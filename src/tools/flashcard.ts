import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDomain, getRandomDomain, type DomainId } from "../config.js";
import { generateJSON } from "../ollama.js";
import { readJSON } from "../data/store.js";
import type { Flashcard } from "../data/types.js";

async function loadTranscriptContext(domain: DomainId): Promise<string> {
  const index = await readJSON<{ id: string; domain: string; title: string }[]>("transcripts/index.json", []);
  const matching = index.filter((t) => t.domain === domain || t.domain === "general");
  if (matching.length === 0) return "";
  const chunks: string[] = [];
  let total = 0;
  for (const t of matching.slice(0, 3)) {
    const data = await readJSON<{ meta: any; text: string }>(`transcripts/${t.id}.json`, null as any);
    if (data && total < 4000) {
      const text = data.text.slice(0, 4000 - total);
      chunks.push(`--- ${data.meta.title} ---\n${text}`);
      total += text.length;
    }
  }
  return chunks.length > 0 ? `\n\nREFERENCE MATERIAL:\n${chunks.join("\n\n")}` : "";
}

export function registerFlashcardTool(server: McpServer) {
  server.tool(
    "secai_flashcard",
    "Generate flashcard sets for CompTIA SecAI+ key terms and concepts",
    {
      domain: z
        .enum(["basic-ai", "securing-ai", "ai-security", "ai-grc"])
        .optional()
        .describe("Domain to generate flashcards for"),
      topic: z.string().optional().describe("Specific topic within the domain"),
      count: z
        .number()
        .min(3)
        .max(25)
        .default(10)
        .describe("Number of flashcards (3-25)"),
    },
    async ({ domain, topic, count }) => {
      const domainId = domain ?? getRandomDomain().id;
      const domainInfo = getDomain(domainId);
      const topicStr = topic ?? domainInfo.topics[Math.floor(Math.random() * domainInfo.topics.length)];

      const transcriptContext = await loadTranscriptContext(domainId);

      const systemPrompt = `You are a CompTIA SecAI+ (CY0-001) study aid. Generate flashcards for exam preparation.

Domain: ${domainInfo.name}
Topic: ${topicStr}

Return a JSON object with a "flashcards" array. Each flashcard has:
{
  "term": "the key term or concept",
  "definition": "a concise, exam-relevant definition (2-3 sentences max)"
}

Focus on the most testable and important terms. Definitions should be precise enough to distinguish from similar concepts.${transcriptContext ? "\nUse the reference material below to identify the most important terms.\n" + transcriptContext : ""}`;

      const userPrompt = `Generate ${count} flashcards about "${topicStr}" for the CompTIA SecAI+ exam.`;

      const result = await generateJSON<{ flashcards: { term: string; definition: string }[] }>(
        systemPrompt,
        userPrompt
      );

      const flashcards: Flashcard[] = (result.flashcards || []).map((f) => ({
        ...f,
        domain: domainId,
        topic: topicStr,
      }));

      let output = `# SecAI+ Flashcards — ${domainInfo.name}\n`;
      output += `**Topic:** ${topicStr} | **Cards:** ${flashcards.length}\n\n---\n\n`;

      flashcards.forEach((f, i) => {
        output += `### Card ${i + 1}: ${f.term}\n`;
        output += `${f.definition}\n\n`;
      });

      return { content: [{ type: "text", text: output }] };
    }
  );
}
