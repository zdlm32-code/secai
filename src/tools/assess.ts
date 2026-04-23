import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DOMAINS, getDomain, getRandomTopic, type DomainId } from "../config.js";
import { generateJSON } from "../ollama.js";
import { loadSeedQuestions } from "./quiz.js";
import type { Question } from "../data/types.js";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function distributeQuestions(total: number): Record<DomainId, number> {
  const raw = DOMAINS.map((d) => ({ id: d.id, count: d.weight * total }));
  const floored = raw.map((r) => ({ id: r.id, count: Math.floor(r.count) }));
  let remainder = total - floored.reduce((sum, r) => sum + r.count, 0);

  // Distribute remainder by largest fractional part
  const fractions = raw
    .map((r, i) => ({ idx: i, frac: r.count - Math.floor(r.count) }))
    .sort((a, b) => b.frac - a.frac);

  for (const f of fractions) {
    if (remainder <= 0) break;
    floored[f.idx].count++;
    remainder--;
  }

  return Object.fromEntries(floored.map((r) => [r.id, r.count])) as Record<DomainId, number>;
}

async function generateQuestionsForDomain(
  domain: DomainId,
  count: number,
  difficulty: string
): Promise<Question[]> {
  const domainInfo = getDomain(domain);
  const topic = getRandomTopic(domain);

  const systemPrompt = `You are a CompTIA SecAI+ (CY0-001) exam question writer. Generate practice multiple-choice questions.

Domain: ${domainInfo.name}

Return a JSON object with a "questions" array. Each question:
{
  "question": "text",
  "choices": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}],
  "correctAnswer": "B",
  "explanation": "why correct",
  "topic": "the specific subtopic"
}

Vary the topics across the domain. Match ${difficulty} difficulty.`;

  const userPrompt = `Generate ${count} ${difficulty}-level questions for the CompTIA SecAI+ exam domain: ${domainInfo.name}`;

  const result = await generateJSON<{
    questions: (Omit<Question, "id" | "domain" | "difficulty" | "source"> & { topic?: string })[];
  }>(systemPrompt, userPrompt);

  return (result.questions || []).map((q, i) => ({
    ...q,
    id: `assess-${Date.now()}-${i}`,
    domain,
    topic: q.topic || topic,
    difficulty: difficulty as Question["difficulty"],
    source: "generated" as const,
  }));
}

export function registerAssessTool(server: McpServer) {
  server.tool(
    "secai_assess",
    "Run a weighted mini-assessment across all CompTIA SecAI+ domains matching exam proportions",
    {
      totalQuestions: z
        .number()
        .min(10)
        .max(60)
        .default(20)
        .describe("Total questions in the assessment"),
      difficulty: z
        .enum(["beginner", "intermediate", "advanced", "mixed"])
        .default("mixed")
        .describe("Overall difficulty level"),
    },
    async ({ totalQuestions, difficulty }) => {
      const distribution = distributeQuestions(totalQuestions);
      const allQuestions: Question[] = [];

      for (const domain of DOMAINS) {
        const needed = distribution[domain.id];
        if (needed === 0) continue;

        const diff = difficulty === "mixed"
          ? (["beginner", "intermediate", "advanced"] as const)[Math.floor(Math.random() * 3)]
          : difficulty;

        // Try seed bank first
        const seeds = await loadSeedQuestions(domain.id);
        const seedPick = shuffle(seeds).slice(0, needed);

        if (seedPick.length < needed) {
          const genCount = needed - seedPick.length;
          const generated = await generateQuestionsForDomain(domain.id, genCount, diff);
          allQuestions.push(...seedPick, ...generated);
        } else {
          allQuestions.push(...seedPick);
        }
      }

      const questions = shuffle(allQuestions);

      let output = `# SecAI+ Assessment\n`;
      output += `**Questions:** ${questions.length} | **Difficulty:** ${difficulty}\n`;
      output += `**Distribution:** ${DOMAINS.map((d) => `${d.name.split(" ")[0]}=${distribution[d.id]}`).join(", ")}\n\n`;
      output += `> Passing score on the real exam: 600/900 (approximately 66.7%)\n\n---\n\n`;

      questions.forEach((q, i) => {
        const domainLabel = getDomain(q.domain).name.split(" ").slice(0, 2).join(" ");
        output += `**Q${i + 1}.** [${domainLabel}] ${q.question}\n\n`;
        q.choices.forEach((c) => {
          output += `  ${c.label}. ${c.text}\n`;
        });
        output += "\n";
      });

      output += "---\n\n## Answer Key\n\n";
      questions.forEach((q, i) => {
        output += `**Q${i + 1}: ${q.correctAnswer}** — ${q.explanation}\n\n`;
      });

      output += "---\n\n## Scoring Guide\n\n";
      output += `Record your results using the \`secai_progress\` tool with action "record" for each domain.\n`;

      return { content: [{ type: "text", text: output }] };
    }
  );
}
