import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type { Question, ProgressData, ProgressRecord } from "./data/types.js";
import { DOMAINS, type DomainId } from "./config.js";
import { processAllTranscripts, getProcessingState, getProcessedSummary } from "./processor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, "../data");
const PUBLIC_DIR = path.resolve(__dirname, "../web/public");

const app = express();
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// --- Helpers ---

async function readJSON<T>(relativePath: string, fallback: T): Promise<T> {
  const fullPath = path.join(DATA_ROOT, relativePath);
  if (!existsSync(fullPath)) return fallback;
  const raw = await readFile(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

async function writeJSON(relativePath: string, data: unknown): Promise<void> {
  const fullPath = path.join(DATA_ROOT, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
}

const DOMAIN_FILES: Record<DomainId, string> = {
  "basic-ai": "questions/domain1-basic-ai.json",
  "securing-ai": "questions/domain2-securing-ai.json",
  "ai-security": "questions/domain3-ai-security.json",
  "ai-grc": "questions/domain4-ai-grc.json",
};

// --- API Routes ---

// Get all domains info
app.get("/api/domains", (_req, res) => {
  res.json(DOMAINS);
});

// Get questions for a domain (or all)
app.get("/api/questions", async (req, res) => {
  const domain = req.query.domain as DomainId | undefined;
  const allQuestions: Question[] = [];

  if (domain && DOMAIN_FILES[domain]) {
    const qs = await readJSON<Question[]>(DOMAIN_FILES[domain], []);
    allQuestions.push(...qs);
  } else {
    for (const [, file] of Object.entries(DOMAIN_FILES)) {
      const qs = await readJSON<Question[]>(file, []);
      allQuestions.push(...qs);
    }
  }

  res.json(allQuestions);
});

// Get questions for a quiz (shuffled, limited)
app.get("/api/quiz", async (req, res) => {
  const domain = req.query.domain as DomainId | undefined;
  const count = Math.min(parseInt(req.query.count as string) || 10, 60);
  const difficulty = req.query.difficulty as string | undefined;

  let allQuestions: Question[] = [];

  if (domain && DOMAIN_FILES[domain]) {
    allQuestions = await readJSON<Question[]>(DOMAIN_FILES[domain], []);
  } else {
    for (const [, file] of Object.entries(DOMAIN_FILES)) {
      const qs = await readJSON<Question[]>(file, []);
      allQuestions.push(...qs);
    }
  }

  if (difficulty && difficulty !== "all") {
    allQuestions = allQuestions.filter((q) => q.difficulty === difficulty);
  }

  // Shuffle
  for (let i = allQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
  }

  res.json(allQuestions.slice(0, count));
});

// Submit quiz results
app.post("/api/progress", async (req, res) => {
  const { domain, topic, totalQuestions, correctAnswers, tool } = req.body;

  const progress = await readJSON<ProgressData>("progress.json", {
    sessions: [],
    lastUpdated: new Date().toISOString(),
  });

  const record: ProgressRecord = {
    date: new Date().toISOString().split("T")[0],
    tool: tool || "quiz",
    domain,
    topic: topic || "general",
    totalQuestions,
    correctAnswers,
    score: (correctAnswers / totalQuestions) * 100,
  };

  progress.sessions.push(record);
  progress.lastUpdated = new Date().toISOString();
  await writeJSON("progress.json", progress);

  res.json({ success: true, record });
});

// Get progress
app.get("/api/progress", async (_req, res) => {
  const progress = await readJSON<ProgressData>("progress.json", {
    sessions: [],
    lastUpdated: new Date().toISOString(),
  });
  res.json(progress);
});

// Reset progress
app.delete("/api/progress", async (_req, res) => {
  await writeJSON("progress.json", {
    sessions: [],
    lastUpdated: new Date().toISOString(),
  });
  res.json({ success: true });
});

// Get resources list
app.get("/api/resources", (_req, res) => {
  res.json(RESOURCES);
});

// Toggle resource checked state
app.post("/api/resources/:id/toggle", async (req, res) => {
  const resourceState = await readJSON<Record<string, boolean>>(
    "resource-state.json",
    {}
  );
  const id = req.params.id;
  resourceState[id] = !resourceState[id];
  await writeJSON("resource-state.json", resourceState);
  res.json({ id, checked: resourceState[id] });
});

// Get resource checked states
app.get("/api/resources/state", async (_req, res) => {
  const state = await readJSON<Record<string, boolean>>(
    "resource-state.json",
    {}
  );
  res.json(state);
});

// --- Flashcards ---

interface StoredFlashcard {
  term: string;
  definition: string;
  domain: string;
  topic: string;
}

// Get all flashcards (aggregated from all transcript artifacts)
app.get("/api/flashcards", async (req, res) => {
  const domain = req.query.domain as string | undefined;
  const index = await readJSON<{ id: string; domain: string }[]>("transcripts/index.json", []);

  const all: (StoredFlashcard & { id: string; transcriptId: string })[] = [];

  for (const t of index) {
    if (domain && domain !== "all" && t.domain !== domain) continue;
    const cards = await readJSON<StoredFlashcard[]>(`transcripts/${t.id}-flashcards.json`, []);
    cards.forEach((c, i) => {
      all.push({ ...c, id: `${t.id}-fc${i}`, transcriptId: t.id });
    });
  }

  res.json(all);
});

// Get flashcard review state (known/needs-review)
app.get("/api/flashcards/review-state", async (_req, res) => {
  const state = await readJSON<Record<string, "known" | "review">>("flashcard-review.json", {});
  res.json(state);
});

// Mark a flashcard as known or needs-review
app.post("/api/flashcards/review", async (req, res) => {
  const { id, status } = req.body as { id: string; status: "known" | "review" | "unset" };
  const state = await readJSON<Record<string, string>>("flashcard-review.json", {});
  if (status === "unset") {
    delete state[id];
  } else {
    state[id] = status;
  }
  await writeJSON("flashcard-review.json", state);
  res.json({ success: true });
});

// Serve README as raw markdown
app.get("/api/readme", async (_req, res) => {
  const readmePath = path.resolve(__dirname, "../README.md");
  if (!existsSync(readmePath)) {
    res.type("text/plain").send("README.md not found.");
    return;
  }
  const content = await readFile(readmePath, "utf-8");
  res.type("text/plain").send(content);
});

// --- Transcripts ---

interface TranscriptMeta {
  id: string;
  title: string;
  domain: DomainId | "general";
  module: string;
  wordCount: number;
  createdAt: string;
}

// List all transcripts
app.get("/api/transcripts", async (_req, res) => {
  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  res.json(index);
});

// Get processing status (must be before :id route)
app.get("/api/transcripts/processing-status", (_req, res) => {
  res.json(getProcessingState());
});

// Get processed summary (must be before :id route)
app.get("/api/transcripts/summary", async (_req, res) => {
  res.json(await getProcessedSummary());
});

// Get artifacts for one transcript (must be before :id route)
app.get("/api/transcripts/:id/artifacts", async (req, res) => {
  const id = req.params.id;
  const questions = await readJSON<Question[]>(`transcripts/${id}-questions.json`, []);
  const flashcards = await readJSON<any[]>(`transcripts/${id}-flashcards.json`, []);
  res.json({ questions, flashcards });
});

// Get transcripts for a domain (must be before :id route)
app.get("/api/transcripts/domain/:domain", async (req, res) => {
  const domain = req.params.domain;
  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  const matching = index.filter((t) => t.domain === domain || t.domain === "general");

  const texts: string[] = [];
  for (const t of matching.slice(0, 5)) {
    const data = await readJSON<{ meta: TranscriptMeta; text: string }>(
      `transcripts/${t.id}.json`,
      null as any
    );
    if (data) texts.push(data.text);
  }

  res.json({ count: matching.length, texts });
});

// Get a single transcript (catch-all for :id)
app.get("/api/transcripts/:id", async (req, res) => {
  const id = req.params.id;
  const content = await readJSON<{ meta: TranscriptMeta; text: string }>(
    `transcripts/${id}.json`,
    null as any
  );
  if (!content) {
    res.status(404).json({ error: "Transcript not found" });
    return;
  }
  res.json(content);
});

// Save a new transcript
app.post("/api/transcripts", async (req, res) => {
  const { title, domain, module, text } = req.body as {
    title: string;
    domain: string;
    module: string;
    text: string;
  };

  if (!title || !text) {
    res.status(400).json({ error: "title and text are required" });
    return;
  }

  const id = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    + "-" + Date.now().toString(36);

  const wordCount = text.trim().split(/\s+/).length;
  const meta: TranscriptMeta = {
    id,
    title,
    domain: (domain as DomainId) || "general",
    module: module || "",
    wordCount,
    createdAt: new Date().toISOString(),
  };

  // Save transcript file
  await writeJSON(`transcripts/${id}.json`, { meta, text });

  // Update index
  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  index.push(meta);
  await writeJSON("transcripts/index.json", index);

  res.json({ success: true, meta });
});

// Delete a transcript
app.delete("/api/transcripts/:id", async (req, res) => {
  const id = req.params.id;
  const index = await readJSON<TranscriptMeta[]>("transcripts/index.json", []);
  const filtered = index.filter((t) => t.id !== id);
  await writeJSON("transcripts/index.json", filtered);

  // Delete the file
  const fullPath = path.join(DATA_ROOT, `transcripts/${id}.json`);
  if (existsSync(fullPath)) {
    const { unlink } = await import("node:fs/promises");
    await unlink(fullPath);
  }

  res.json({ success: true });
});

// Trigger transcript processing (background)
app.post("/api/transcripts/process", async (req, res) => {
  const force = req.body?.force === true;
  const state = getProcessingState();
  if (state.status === "running") {
    res.json({ alreadyRunning: true, state });
    return;
  }
  // Fire and forget
  processAllTranscripts(force).catch((err) => console.error("Processing failed:", err));
  res.json({ started: true });
});

// Question counts by domain
app.get("/api/stats", async (_req, res) => {
  const stats: Record<string, { total: number; byDifficulty: Record<string, number> }> = {};

  for (const [domainId, file] of Object.entries(DOMAIN_FILES)) {
    const qs = await readJSON<Question[]>(file, []);
    const byDiff: Record<string, number> = {};
    for (const q of qs) {
      byDiff[q.difficulty] = (byDiff[q.difficulty] || 0) + 1;
    }
    stats[domainId] = { total: qs.length, byDifficulty: byDiff };
  }

  res.json(stats);
});

// SPA fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --- Resources Data ---

const RESOURCES = [
  // === Official CompTIA Sources ===
  {
    id: "comptia-official",
    category: "Official CompTIA",
    name: "CompTIA SecAI+ Certification Page",
    url: "https://www.comptia.org/en-us/certifications/secai/",
    description: "Official exam objectives, registration, and overview",
    scraped: true,
  },
  {
    id: "comptia-blog-what-is",
    category: "Official CompTIA",
    name: "What Is CompTIA SecAI+ and Who Is It For?",
    url: "https://www.comptia.org/en-us/blog/what-is-comptia-secai/",
    description: "CompTIA blog post explaining the cert's purpose and audience",
    scraped: true,
  },
  {
    id: "comptia-blog-faq",
    category: "Official CompTIA",
    name: "CompTIA SecAI+ FAQs",
    url: "https://www.comptia.org/en-us/blog/comptia-secai-frequently-asked-questions/",
    description: "Official FAQ covering exam details, prerequisites, and format",
    scraped: true,
  },
  {
    id: "comptia-exam-objectives",
    category: "Official CompTIA",
    name: "SecAI+ CY0-001 Exam Objectives (PDF)",
    url: "https://www.onlc.com/graphics/Publications/CompTIA/comptia-secai-cy0-001-exam-objectives.pdf",
    description: "Official exam objectives document — every testable objective across all four domains",
    scraped: false,
  },
  {
    id: "comptia-certmaster",
    category: "Official CompTIA",
    name: "CertMaster Learn + Labs + Practice for SecAI+",
    url: "https://www.comptia.org/en-us/resources/certmaster-training/",
    description: "CompTIA's official interactive learning platform with hands-on labs and adaptive practice questions (paid)",
    scraped: false,
  },
  // === Study Guides & Books ===
  {
    id: "sybex-study-guide",
    category: "Study Guides & Books",
    name: "CompTIA SecAI+ Study Guide: Exam CY0-001 (Sybex/Wiley)",
    url: "https://www.wiley.com/en-us/CompTIA+SecAI++Study+Guide:+Exam+CY0-001-p-9781394368075",
    description: "Primary study guide by Mike Chapple & Fred Nwanganga — covers all objectives, includes practice exams and flashcards (paid)",
    scraped: false,
  },
  {
    id: "flashgenius-guide",
    category: "Study Guides & Books",
    name: "CompTIA Security AI+ Ultimate 2026 Guide — FlashGenius",
    url: "https://flashgenius.net/blog-article/comptia-security-ai-secai-ultimate-2026-guide",
    description: "Comprehensive study guide with domain breakdowns and tips",
    scraped: true,
  },
  {
    id: "stationx-passing",
    category: "Study Guides & Books",
    name: "CompTIA SecAI+ Passing Score — StationX",
    url: "https://www.stationx.net/comptia-secai-plus-passing-score/",
    description: "Detailed breakdown of scoring methodology (600/900 scaled)",
    scraped: true,
  },
  {
    id: "cybervista-prep",
    category: "Study Guides & Books",
    name: "How to Prep for CompTIA SecAI+ — CyberVista",
    url: "https://certify.cybervista.net/how-to-prep-for-comptias-secai-plus/",
    description: "Preparation strategy and study planning advice",
    scraped: true,
  },
  // === Frameworks & Standards ===
  {
    id: "mitre-atlas",
    category: "Frameworks & Standards",
    name: "MITRE ATLAS — Adversarial Threat Landscape for AI Systems",
    url: "https://atlas.mitre.org/",
    description: "16 tactics, 84 techniques, 32 mitigations, 42 case studies for adversarial AI — Domain 2",
    scraped: true,
  },
  {
    id: "mitre-safe-ai",
    category: "Frameworks & Standards",
    name: "MITRE SAFE-AI: Framework for Securing AI Systems (PDF)",
    url: "https://atlas.mitre.org/pdf-files/SAFEAI_Full_Report.pdf",
    description: "Strategic-level framework for securing AI systems, complements ATLAS tactical knowledge base — Domain 2",
    scraped: false,
  },
  {
    id: "nist-ai-rmf",
    category: "Frameworks & Standards",
    name: "NIST AI Risk Management Framework (AI RMF 1.0)",
    url: "https://airc.nist.gov/airmf-resources/airmf/",
    description: "Four core functions: Govern, Map, Measure, Manage — foundational for Domain 4",
    scraped: true,
  },
  {
    id: "nist-ai-100-2",
    category: "Frameworks & Standards",
    name: "NIST AI 100-2: Adversarial Machine Learning Taxonomy",
    url: "https://csrc.nist.gov/pubs/ai/100/2/e2025/final",
    description: "Comprehensive taxonomy of adversarial ML attacks and mitigations — directly maps to Domain 2",
    scraped: false,
  },
  {
    id: "nist-ai-600-1",
    category: "Frameworks & Standards",
    name: "NIST AI 600-1: Generative AI Risk Profile",
    url: "https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf",
    description: "GenAI-specific risks: prompt injection, confabulation, data privacy — Domains 2 & 4",
    scraped: false,
  },
  {
    id: "nist-sp800-218a",
    category: "Frameworks & Standards",
    name: "NIST SP 800-218A — Secure Software Development for AI",
    url: "https://csrc.nist.gov/pubs/sp/800/218/a/final",
    description: "Extends SSDF for AI/ML development lifecycle — Domain 2",
    scraped: true,
  },
  {
    id: "nist-cosais",
    category: "Frameworks & Standards",
    name: "NIST COSAiS: SP 800-53 Control Overlays for AI Systems",
    url: "https://csrc.nist.gov/projects/cosais",
    description: "AI-specific security control overlays based on SP 800-53 — Domains 2 & 4",
    scraped: false,
  },
  {
    id: "owasp-llm-top10",
    category: "Frameworks & Standards",
    name: "OWASP Top 10 for LLM Applications (2025)",
    url: "https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/",
    description: "Top 10 LLM risks: prompt injection, data poisoning, model theft, supply chain vulns — Domain 2",
    scraped: true,
  },
  {
    id: "eu-ai-act",
    category: "Frameworks & Standards",
    name: "EU AI Act",
    url: "https://artificialintelligenceact.eu/",
    description: "Risk-based classification (unacceptable/high/limited/minimal), penalties up to 7% turnover — Domain 4",
    scraped: true,
  },
  {
    id: "iso-42001",
    category: "Frameworks & Standards",
    name: "ISO/IEC 42001:2023 — AI Management System Standard",
    url: "https://www.iso.org/standard/42001",
    description: "First certifiable AI management system standard — governance, risk management, transparency — Domain 4 (paid)",
    scraped: false,
  },
  // === SANS Institute ===
  {
    id: "sans-sec411",
    category: "SANS Institute",
    name: "SEC411: AI Security Principles and Practices",
    url: "https://www.sans.org/cyber-security-courses/ai-security-principles-practices",
    description: "Hands-on course on defending GenAI/LLM systems — prompt injection defense, model security (paid)",
    scraped: false,
  },
  {
    id: "sans-sec595",
    category: "SANS Institute",
    name: "SEC595: Applied Data Science and AI/ML for Cybersecurity",
    url: "https://www.sans.org/cyber-security-courses/applied-data-science-machine-learning",
    description: "Building AI-driven security solutions — threat detection, anomaly detection — Domains 1 & 3 (paid)",
    scraped: false,
  },
  {
    id: "sans-sec598",
    category: "SANS Institute",
    name: "SEC598: AI and Security Automation for Red/Blue/Purple Teams",
    url: "https://www.sans.org/cyber-security-courses/ai-security-automation",
    description: "GenAI integration, agentic automation, SOAR, and LLM-powered ops — Domains 2 & 3 (paid)",
    scraped: false,
  },
  {
    id: "sans-ai-hub",
    category: "SANS Institute",
    name: "SANS AI Cybersecurity Hub",
    url: "https://www.sans.org/artificial-intelligence",
    description: "Central landing page for all SANS AI security courses, webcasts, and whitepapers (free hub)",
    scraped: false,
  },
  // === Cloud Provider Guides ===
  {
    id: "google-saif",
    category: "Cloud Provider Guides",
    name: "Google SAIF (Secure AI Framework)",
    url: "https://saif.google/",
    description: "Google's framework for securing AI — covers prompt attacks, data extraction, backdoors, poisoning — Domains 2 & 4",
    scraped: false,
  },
  {
    id: "ms-ai-red-team",
    category: "Cloud Provider Guides",
    name: "Microsoft AI Red Team & PyRIT",
    url: "https://learn.microsoft.com/en-us/security/ai-red-team/",
    description: "AI red teaming methodology + open-source PyRIT framework for automated AI red teaming — Domain 2",
    scraped: false,
  },
  {
    id: "ms-azure-ai-security",
    category: "Cloud Provider Guides",
    name: "Microsoft Azure AI Security Best Practices",
    url: "https://learn.microsoft.com/en-us/azure/security/fundamentals/ai-security-best-practices",
    description: "Security best practices for Azure OpenAI, AI Foundry, and Azure ML workloads — Domains 2 & 3",
    scraped: false,
  },
  {
    id: "ms-responsible-ai",
    category: "Cloud Provider Guides",
    name: "Microsoft Security and Responsible AI Guide",
    url: "https://azure.github.io/Security-and-Responsible-AI-Guide/chapters/chapter_04_implementing_security_measures",
    description: "Open-source guide covering security measures and responsible AI principles — Domains 2 & 4",
    scraped: false,
  },
  {
    id: "aws-caf-ai-security",
    category: "Cloud Provider Guides",
    name: "AWS Cloud Adoption Framework for AI — Security Perspective",
    url: "https://docs.aws.amazon.com/whitepapers/latest/aws-caf-for-ai/security-perspective-compliance-and-assurance-of-aiml-systems.html",
    description: "AWS whitepaper on security and compliance for AI/ML systems — Domains 2 & 4",
    scraped: false,
  },
  // === ENISA Publications ===
  {
    id: "enisa-securing-ml",
    category: "ENISA (EU Agency)",
    name: "ENISA: Securing Machine Learning Algorithms",
    url: "https://www.enisa.europa.eu/publications/securing-machine-learning-algorithms",
    description: "Taxonomy of 40 ML algorithms, maps threats to vulnerabilities, recommends controls — Domains 1 & 2",
    scraped: false,
  },
  {
    id: "enisa-multilayer",
    category: "ENISA (EU Agency)",
    name: "ENISA: Multilayer Framework for Good Cybersecurity Practices for AI",
    url: "https://www.enisa.europa.eu/publications/multilayer-framework-for-good-cybersecurity-practices-for-ai",
    description: "Three-layer framework for securing AI systems — Domains 2 & 4",
    scraped: false,
  },
  {
    id: "enisa-ai-standardisation",
    category: "ENISA (EU Agency)",
    name: "ENISA: Cybersecurity of AI and Standardisation",
    url: "https://www.enisa.europa.eu/publications/cybersecurity-of-ai-and-standardisation",
    description: "How standardisation supports cybersecurity aspects of the EU AI Act — Domain 4",
    scraped: false,
  },
  {
    id: "enisa-threat-landscape",
    category: "ENISA (EU Agency)",
    name: "ENISA Threat Landscape 2025",
    url: "https://www.enisa.europa.eu/publications/enisa-threat-landscape-2025",
    description: "4,875 incidents analyzed — AI supply chain threats, 80%+ phishing uses AI content — Domains 2 & 3",
    scraped: false,
  },
  // === Academic & Research ===
  {
    id: "cmu-aisirt",
    category: "Academic & Research",
    name: "CMU SEI AISIRT — AI Security Incident Response Team",
    url: "https://www.sei.cmu.edu/projects/aisirt-ensures-the-safety-of-ai-systems/",
    description: "World's first AI SIRT — coordinated AI vulnerability disclosure, forensics, red teaming — Domains 2 & 3",
    scraped: false,
  },
  {
    id: "cmu-cert-ai-cert",
    category: "Academic & Research",
    name: "CMU CERT AI for Cybersecurity Professional Certificate",
    url: "https://www.sei.cmu.edu/credentials/cert-artificial-intelligence-ai-cybersecurity-professional-certificate/",
    description: "Professional certificate from CERT/SEI covering AI in cybersecurity — all domains (paid)",
    scraped: false,
  },
  {
    id: "nist-ai-100-1",
    category: "Academic & Research",
    name: "NIST AI 100-1: Trustworthy and Responsible AI",
    url: "https://nvlpubs.nist.gov/nistpubs/ai/nist.ai.100-1.pdf",
    description: "Defines AI trustworthiness characteristics: valid, safe, secure, explainable, fair, accountable — Domains 1 & 4",
    scraped: false,
  },
  // === Practice Exams ===
  {
    id: "certpractice-secai",
    category: "Practice Exams",
    name: "CertificationPractice.com: SecAI+ Practice Tests",
    url: "https://certificationpractice.com/practice-exams/comptia-secai",
    description: "540 questions across 6 practice exams aligned to 2026 objectives (free)",
    scraped: false,
  },
  {
    id: "crucialexams-secai",
    category: "Practice Exams",
    name: "CrucialExams: SecAI+ Practice Tests",
    url: "https://crucialexams.com/exams/comptia/secai/cy0-001/practice-tests-practice-questions",
    description: "Six full-length timed simulations with 90 questions and detailed explanations (free)",
    scraped: false,
  },
  // === Industry Reports ===
  {
    id: "gartner-ai-trism",
    category: "Industry Reports",
    name: "Gartner Market Guide for AI TRiSM",
    url: "https://www.proofpoint.com/us/resources/analyst-reports/gartner-market-guide-ai-trism",
    description: "AI Trust, Risk and Security Management — four layers of governance and enforcement — Domains 2 & 4 (free via vendor)",
    scraped: false,
  },
  // === Tools & Infrastructure ===
  {
    id: "ollama-api-docs",
    category: "Tools & Infrastructure",
    name: "Ollama API Documentation",
    url: "https://docs.ollama.com/api/introduction",
    description: "API reference for local AI model serving (used to build this tool)",
    scraped: true,
  },
  {
    id: "mcp-build-server",
    category: "Tools & Infrastructure",
    name: "MCP — Build an MCP Server",
    url: "https://modelcontextprotocol.io/docs/develop/build-server",
    description: "MCP SDK documentation (used to build the study tools)",
    scraped: true,
  },
];

// --- Start ---

const PORT = parseInt(process.env.PORT || "3000");

app.listen(PORT, () => {
  console.log(`\n  SecAI+ Study App running at:\n`);
  console.log(`  → http://localhost:${PORT}\n`);
});
