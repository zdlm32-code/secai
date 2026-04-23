import { readJSON, writeJSON } from "./data/store.js";
import { generate, generateJSON } from "./ollama.js";
import { getDomain, type DomainId } from "./config.js";
import type { Question, Flashcard } from "./data/types.js";

// === Types ===

interface TranscriptMeta {
  id: string;
  title: string;
  domain: DomainId | "general";
  module: string;
  wordCount: number;
  createdAt: string;
}

interface TranscriptFile {
  meta: TranscriptMeta;
  text: string;
}

interface ProcessedRecord {
  transcriptId: string;
  processedAt: string;
  topics: string[];
  questionCount: number;
  flashcardCount: number;
  detectedDomain: DomainId;
}

interface ProcessingState {
  status: "idle" | "running" | "complete" | "error";
  total: number;
  processed: number;
  current: string | null;
  errors: { id: string; error: string }[];
  startedAt: string | null;
  finishedAt: string | null;
}

// === Module-level processing state ===

let state: ProcessingState = {
  status: "idle",
  total: 0,
  processed: 0,
  current: null,
  errors: [],
  startedAt: null,
  finishedAt: null,
};

export function getProcessingState(): ProcessingState {
  return { ...state };
}

const DOMAIN_FILE_MAP: Record<DomainId, string> = {
  "basic-ai": "questions/domain1-basic-ai.json",
  "securing-ai": "questions/domain2-securing-ai.json",
  "ai-security": "questions/domain3-ai-security.json",
  "ai-grc": "questions/domain4-ai-grc.json",
};

// === Gemma helpers ===

async function detectDomain(text: string): Promise<DomainId> {
  const prompt = `You are a CompTIA SecAI+ exam content classifier. Read the lesson transcript below and decide which exam domain it belongs to.

Domains:
- basic-ai: Basic AI Concepts (ML fundamentals, neural networks, NLP, generative AI, training data)
- securing-ai: Securing AI Systems (adversarial attacks, prompt injection, model security, supply chain, red teaming)
- ai-security: AI-Assisted Security (AI for threat detection, SOC, incident response, malware analysis)
- ai-grc: AI Governance, Risk, Compliance (ethics, regulation, bias, explainability, audit)

Return JSON: { "domain": "basic-ai" | "securing-ai" | "ai-security" | "ai-grc" }

TRANSCRIPT:
${text.slice(0, 3000)}`;

  try {
    const result = await generateJSON<{ domain: DomainId }>(
      "You classify CompTIA SecAI+ lesson content. Return only valid JSON.",
      prompt
    );
    if (result.domain && DOMAIN_FILE_MAP[result.domain]) return result.domain;
  } catch {}
  return "basic-ai"; // safe fallback
}

async function extractTopics(text: string, domain: DomainId): Promise<string[]> {
  const domainInfo = getDomain(domain);
  const prompt = `Read this CompTIA SecAI+ lesson transcript and identify the 2-4 most important topics it covers.

Domain context: ${domainInfo.name}
Available topic categories: ${domainInfo.topics.join(", ")}

Pick topics that match the lesson content. Return JSON: { "topics": ["topic1", "topic2"] }

TRANSCRIPT:
${text.slice(0, 4000)}`;

  try {
    const result = await generateJSON<{ topics: string[] }>(
      "You identify topics in CompTIA SecAI+ lesson transcripts. Return only valid JSON.",
      prompt
    );
    if (Array.isArray(result.topics) && result.topics.length > 0) {
      return result.topics.slice(0, 4);
    }
  } catch {}
  return [domainInfo.topics[0]];
}

async function generateQuestionsFromTranscript(
  transcript: TranscriptFile,
  domain: DomainId,
  topics: string[]
): Promise<Question[]> {
  const domainInfo = getDomain(domain);
  const text = transcript.text.slice(0, 6000);

  const systemPrompt = `You are a CompTIA SecAI+ (CY0-001) exam question writer. Generate exam-quality multiple-choice questions based STRICTLY on the lesson transcript provided. Do not invent facts not present in the transcript.

Domain: ${domainInfo.name}
Topics covered in this lesson: ${topics.join(", ")}

Rules:
- Generate 5 questions of varying difficulty (mix beginner, intermediate, advanced)
- Each question must have exactly 4 choices (A, B, C, D)
- Only one correct answer per question
- Distractors must be plausible but clearly wrong
- Base every question on content from the transcript
- Include a brief explanation referencing the transcript content

Return JSON:
{
  "questions": [
    {
      "question": "...",
      "choices": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}],
      "correctAnswer": "B",
      "explanation": "...",
      "difficulty": "beginner|intermediate|advanced",
      "topic": "specific topic from the lesson"
    }
  ]
}

LESSON TRANSCRIPT:
${text}`;

  const userPrompt = `Generate 5 multiple-choice exam questions based on the lesson transcript above.`;

  try {
    const result = await generateJSON<{
      questions: (Omit<Question, "id" | "domain" | "source"> & { topic?: string })[];
    }>(systemPrompt, userPrompt);

    return (result.questions || []).map((q, i) => ({
      ...q,
      id: `tx-${transcript.meta.id}-q${i}`,
      domain,
      topic: q.topic || topics[0] || "general",
      difficulty: (q.difficulty as Question["difficulty"]) || "intermediate",
      source: "generated" as const,
    }));
  } catch (err) {
    console.error("Failed to generate questions:", err);
    return [];
  }
}

async function generateFlashcardsFromTranscript(
  transcript: TranscriptFile,
  domain: DomainId,
  topics: string[]
): Promise<Flashcard[]> {
  const text = transcript.text.slice(0, 6000);

  const systemPrompt = `You are a CompTIA SecAI+ study aid. Extract the most important terms and definitions from the lesson transcript below. Each definition must be drawn from the transcript content.

Return JSON:
{
  "flashcards": [
    { "term": "key term", "definition": "concise 1-2 sentence definition from the lesson" }
  ]
}

Generate 8 flashcards covering the most testable concepts.

LESSON TRANSCRIPT:
${text}`;

  const userPrompt = `Generate 8 flashcards from the lesson transcript above.`;

  try {
    const result = await generateJSON<{ flashcards: { term: string; definition: string }[] }>(
      systemPrompt,
      userPrompt
    );

    return (result.flashcards || []).map((f) => ({
      ...f,
      domain,
      topic: topics[0] || "general",
    }));
  } catch (err) {
    console.error("Failed to generate flashcards:", err);
    return [];
  }
}

// === Persistence ===

async function loadProcessedIds(): Promise<Set<string>> {
  const records = await readJSON<ProcessedRecord[]>("transcripts/processed.json", []);
  return new Set(records.map((r) => r.transcriptId));
}

async function saveProcessedRecord(record: ProcessedRecord): Promise<void> {
  const records = await readJSON<ProcessedRecord[]>("transcripts/processed.json", []);
  const filtered = records.filter((r) => r.transcriptId !== record.transcriptId);
  filtered.push(record);
  await writeJSON("transcripts/processed.json", filtered);
}

async function appendQuestionsToBank(domain: DomainId, newQuestions: Question[]): Promise<void> {
  const file = DOMAIN_FILE_MAP[domain];
  const existing = await readJSON<Question[]>(file, []);
  // Avoid duplicates by ID
  const existingIds = new Set(existing.map((q) => q.id));
  const toAdd = newQuestions.filter((q) => !existingIds.has(q.id));
  await writeJSON(file, [...existing, ...toAdd]);
}

async function saveTranscriptArtifacts(
  transcriptId: string,
  questions: Question[],
  flashcards: Flashcard[]
): Promise<void> {
  await writeJSON(`transcripts/${transcriptId}-questions.json`, questions);
  await writeJSON(`transcripts/${transcriptId}-flashcards.json`, flashcards);
}

// === Main processing flow ===

async function processOneTranscript(meta: TranscriptMeta): Promise<ProcessedRecord> {
  state.current = meta.title;

  const file = await readJSON<TranscriptFile>(`transcripts/${meta.id}.json`, null as any);
  if (!file) throw new Error("Transcript file not found");

  // 1. Detect domain (use user-specified if not "general", otherwise classify)
  let domain: DomainId;
  if (meta.domain && meta.domain !== "general") {
    domain = meta.domain as DomainId;
  } else {
    domain = await detectDomain(file.text);
  }

  // 2. Extract topics
  const topics = await extractTopics(file.text, domain);

  // 3. Generate questions
  const questions = await generateQuestionsFromTranscript(file, domain, topics);

  // 4. Generate flashcards
  const flashcards = await generateFlashcardsFromTranscript(file, domain, topics);

  // 5. Persist artifacts
  await saveTranscriptArtifacts(meta.id, questions, flashcards);

  // 6. Append questions to seed bank so they appear in quizzes
  if (questions.length > 0) {
    await appendQuestionsToBank(domain, questions);
  }

  return {
    transcriptId: meta.id,
    processedAt: new Date().toISOString(),
    topics,
    questionCount: questions.length,
    flashcardCount: flashcards.length,
    detectedDomain: domain,
  };
}

export async function processAllTranscripts(force = false): Promise<void> {
  if (state.status === "running") return;

  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  const processedIds = force ? new Set<string>() : await loadProcessedIds();
  const todo = index.filter((t) => !processedIds.has(t.id));

  state = {
    status: "running",
    total: todo.length,
    processed: 0,
    current: null,
    errors: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  for (const meta of todo) {
    try {
      const record = await processOneTranscript(meta);
      await saveProcessedRecord(record);
      state.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.errors.push({ id: meta.id, error: message });
      state.processed++;
    }
  }

  state.status = state.errors.length === todo.length && todo.length > 0 ? "error" : "complete";
  state.current = null;
  state.finishedAt = new Date().toISOString();
}

export async function getProcessedSummary(): Promise<{
  totalTranscripts: number;
  processedCount: number;
  totalQuestions: number;
  totalFlashcards: number;
  byDomain: Record<string, { transcripts: number; questions: number; flashcards: number }>;
}> {
  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  const records = await readJSON<ProcessedRecord[]>("transcripts/processed.json", []);

  const byDomain: Record<string, { transcripts: number; questions: number; flashcards: number }> = {};
  let totalQ = 0;
  let totalF = 0;

  for (const r of records) {
    const d = r.detectedDomain;
    if (!byDomain[d]) byDomain[d] = { transcripts: 0, questions: 0, flashcards: 0 };
    byDomain[d].transcripts++;
    byDomain[d].questions += r.questionCount;
    byDomain[d].flashcards += r.flashcardCount;
    totalQ += r.questionCount;
    totalF += r.flashcardCount;
  }

  return {
    totalTranscripts: index.length,
    processedCount: records.length,
    totalQuestions: totalQ,
    totalFlashcards: totalF,
    byDomain,
  };
}
