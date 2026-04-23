import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDomain, getRandomDomain, getRandomTopic, type DomainId } from "../config.js";
import { generateJSON } from "../ollama.js";
import { readJSON } from "../data/store.js";

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

interface ScenarioResult {
  narrative: string;
  tasks: string[];
  questions: {
    question: string;
    choices: { label: string; text: string }[];
    correctAnswer: string;
    explanation: string;
  }[];
  solutionGuide: string;
}

export function registerScenarioTool(server: McpServer) {
  server.tool(
    "secai_scenario",
    "Generate PBQ-style scenario questions simulating CompTIA SecAI+ performance-based tasks",
    {
      domain: z
        .enum(["basic-ai", "securing-ai", "ai-security", "ai-grc"])
        .optional()
        .describe("Domain for the scenario"),
      topic: z.string().optional().describe("Specific topic"),
      difficulty: z
        .enum(["intermediate", "advanced"])
        .default("intermediate")
        .describe("Scenario complexity"),
    },
    async ({ domain, topic, difficulty }) => {
      const domainId = domain ?? getRandomDomain().id;
      const domainInfo = getDomain(domainId);
      const topicStr = topic ?? getRandomTopic(domainId);

      const transcriptContext = await loadTranscriptContext(domainId);

      const systemPrompt = `You are a CompTIA SecAI+ (CY0-001) exam scenario designer. Create a performance-based question (PBQ) scenario.

Domain: ${domainInfo.name}
Topic: ${topicStr}
Difficulty: ${difficulty}
${transcriptContext ? "\nUse the reference material below to ground the scenario in real concepts taught in the course." + transcriptContext : ""}

Return a JSON object with:
{
  "narrative": "A realistic workplace scenario (3-5 sentences) describing a situation involving AI and cybersecurity",
  "tasks": ["Task 1 the candidate must address", "Task 2", "Task 3"],
  "questions": [
    {
      "question": "A follow-up question about the scenario",
      "choices": [{"label": "A", "text": "..."}, {"label": "B", "text": "..."}, {"label": "C", "text": "..."}, {"label": "D", "text": "..."}],
      "correctAnswer": "C",
      "explanation": "Why C is correct in this scenario context"
    }
  ],
  "solutionGuide": "A detailed walkthrough of how to handle this scenario correctly, addressing each task"
}

Include 2-3 follow-up questions. The scenario should feel like a real-world situation a security professional would encounter.`;

      const userPrompt = `Create a ${difficulty} PBQ scenario about "${topicStr}" for the CompTIA SecAI+ exam.`;

      const result = await generateJSON<ScenarioResult>(systemPrompt, userPrompt);

      let output = `# SecAI+ Scenario — ${domainInfo.name}\n`;
      output += `**Topic:** ${topicStr} | **Difficulty:** ${difficulty}\n\n---\n\n`;
      output += `## Scenario\n\n${result.narrative}\n\n`;
      output += `## Your Tasks\n\n`;
      (result.tasks || []).forEach((t, i) => {
        output += `${i + 1}. ${t}\n`;
      });
      output += "\n";

      output += `## Questions\n\n`;
      (result.questions || []).forEach((q, i) => {
        output += `**Q${i + 1}.** ${q.question}\n\n`;
        (q.choices || []).forEach((c) => {
          output += `  ${c.label}. ${c.text}\n`;
        });
        output += "\n";
      });

      output += "---\n\n";
      output += `<details>\n<summary>Click to reveal Answer Key</summary>\n\n`;
      (result.questions || []).forEach((q, i) => {
        output += `**Q${i + 1}: ${q.correctAnswer}** — ${q.explanation}\n\n`;
      });
      output += `</details>\n\n`;

      output += `<details>\n<summary>Click to reveal Solution Guide</summary>\n\n`;
      output += `${result.solutionGuide}\n\n`;
      output += `</details>\n`;

      return { content: [{ type: "text", text: output }] };
    }
  );
}
