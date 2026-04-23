import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DOMAINS, getDomain, getRandomDomain, getRandomTopic, type DomainId } from "../config.js";
import { generateJSON } from "../ollama.js";
import { readJSON } from "../data/store.js";
import type { Question } from "../data/types.js";

const DOMAIN_FILE_MAP: Record<DomainId, string> = {
  "basic-ai": "questions/domain1-basic-ai.json",
  "securing-ai": "questions/domain2-securing-ai.json",
  "ai-security": "questions/domain3-ai-security.json",
  "ai-grc": "questions/domain4-ai-grc.json",
};

export async function loadSeedQuestions(domainId: DomainId): Promise<Question[]> {
  return readJSON<Question[]>(DOMAIN_FILE_MAP[domainId], []);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface TranscriptMeta {
  id: string;
  title: string;
  domain: DomainId | "general";
  module: string;
  wordCount: number;
  createdAt: string;
}

async function loadTranscriptContext(domain: DomainId): Promise<string> {
  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  const matching = index.filter((t) => t.domain === domain || t.domain === "general");
  if (matching.length === 0) return "";

  const chunks: string[] = [];
  let totalChars = 0;
  const MAX_CHARS = 6000;

  for (const t of matching.slice(0, 5)) {
    const data = await readJSON<{ meta: TranscriptMeta; text: string }>(
      `transcripts/${t.id}.json`,
      null as any
    );
    if (data && totalChars < MAX_CHARS) {
      const text = data.text.slice(0, MAX_CHARS - totalChars);
      chunks.push(`--- ${data.meta.title} ---\n${text}`);
      totalChars += text.length;
    }
  }

  return chunks.length > 0
    ? `\n\nREFERENCE MATERIAL FROM COURSE TRANSCRIPTS:\n${chunks.join("\n\n")}`
    : "";
}

async function generateQuestions(
  domain: DomainId,
  topic: string,
  count: number,
  difficulty: string
): Promise<Question[]> {
  const domainInfo = getDomain(domain);
  const transcriptContext = await loadTranscriptContext(domain);

  const systemPrompt = `You are a CompTIA SecAI+ (CY0-001) exam question writer. Generate practice multiple-choice questions.

Domain: ${domainInfo.name}
Topic: ${topic}

Rules:
- Each question must have exactly 4 choices (A, B, C, D)
- Only one correct answer per question
- Distractors should be plausible but clearly wrong to someone who studied
- Include a brief explanation for the correct answer
- Questions should match ${difficulty} difficulty level
- Focus on exam-relevant concepts
${transcriptContext ? "- Base questions on the reference material provided below when relevant" : ""}

Return a JSON object with a "questions" array. Each question object has:
{
  "question": "the question text",
  "choices": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}],
  "correctAnswer": "B",
  "explanation": "why B is correct"
}${transcriptContext}`;

  const userPrompt = `Generate ${count} ${difficulty}-level multiple-choice questions about "${topic}" for the CompTIA SecAI+ exam.`;

  const result = await generateJSON<{ questions: Omit<Question, "id" | "domain" | "topic" | "difficulty" | "source">[] }>(
    systemPrompt,
    userPrompt
  );

  return (result.questions || []).map((q, i) => ({
    ...q,
    id: `gen-${Date.now()}-${i}`,
    domain,
    topic,
    difficulty: difficulty as Question["difficulty"],
    source: "generated" as const,
  }));
}

export function registerQuizTool(server: McpServer) {
  server.tool(
    "secai_quiz",
    "Generate CompTIA SecAI+ practice multiple-choice questions by domain and topic",
    {
      domain: z
        .enum(["basic-ai", "securing-ai", "ai-security", "ai-grc"])
        .optional()
        .describe("Exam domain to quiz on. Omit for random."),
      topic: z.string().optional().describe("Specific topic within the domain"),
      count: z
        .number()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of questions (1-10)"),
      difficulty: z
        .enum(["beginner", "intermediate", "advanced"])
        .default("intermediate")
        .describe("Question difficulty"),
      source: z
        .enum(["seed", "generated", "mixed"])
        .default("mixed")
        .describe("Use seed bank, AI-generated, or both"),
    },
    async ({ domain, topic, count, difficulty, source }) => {
      const domainId = domain ?? getRandomDomain().id;
      const topicStr = topic ?? getRandomTopic(domainId);
      let questions: Question[] = [];

      // Pull from seed bank
      if (source === "seed" || source === "mixed") {
        const seeds = await loadSeedQuestions(domainId);
        const filtered = seeds.filter((q) => {
          const topicMatch = !topic || q.topic.toLowerCase().includes(topic.toLowerCase());
          const diffMatch = q.difficulty === difficulty;
          return topicMatch && diffMatch;
        });
        questions = shuffle(filtered).slice(0, count);
      }

      // Generate remaining via Gemma
      if (questions.length < count && source !== "seed") {
        const needed = count - questions.length;
        const generated = await generateQuestions(domainId, topicStr, needed, difficulty);
        questions = [...questions, ...generated];
      }

      // Fallback: if seed-only and not enough, relax difficulty filter
      if (questions.length < count && source === "seed") {
        const seeds = await loadSeedQuestions(domainId);
        const filtered = seeds.filter(
          (q) => !topic || q.topic.toLowerCase().includes(topic.toLowerCase())
        );
        questions = shuffle(filtered).slice(0, count);
      }

      questions = questions.slice(0, count);

      if (questions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No questions available for domain "${domainId}", topic "${topicStr}". Try source: "generated" to create new questions with AI.`,
            },
          ],
        };
      }

      // Format output
      const domainInfo = getDomain(domainId);
      let output = `# SecAI+ Quiz — ${domainInfo.name}\n`;
      output += `**Topic:** ${topicStr} | **Difficulty:** ${difficulty} | **Questions:** ${questions.length}\n\n---\n\n`;

      questions.forEach((q, i) => {
        output += `**Q${i + 1}.** ${q.question}\n\n`;
        q.choices.forEach((c) => {
          output += `  ${c.label}. ${c.text}\n`;
        });
        output += "\n";
      });

      output += "---\n\n## Answer Key\n\n";
      questions.forEach((q, i) => {
        output += `**Q${i + 1}: ${q.correctAnswer}** — ${q.explanation}\n\n`;
      });

      return { content: [{ type: "text", text: output }] };
    }
  );
}
