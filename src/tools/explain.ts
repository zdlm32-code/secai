import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getDomain, DOMAINS, type DomainId } from "../config.js";
import { generate } from "../ollama.js";

export function registerExplainTool(server: McpServer) {
  server.tool(
    "secai_explain",
    "Get a detailed explanation of a CompTIA SecAI+ concept using local AI",
    {
      concept: z.string().describe("The concept or term to explain"),
      domain: z
        .enum(["basic-ai", "securing-ai", "ai-security", "ai-grc"])
        .optional()
        .describe("Domain context for the explanation"),
      depth: z
        .enum(["brief", "detailed", "exam-focused"])
        .default("exam-focused")
        .describe("Level of detail"),
    },
    async ({ concept, domain, depth }) => {
      const domainContext = domain
        ? getDomain(domain).name
        : "all CompTIA SecAI+ domains";

      let depthInstructions: string;
      switch (depth) {
        case "brief":
          depthInstructions =
            "Give a concise 2-3 sentence definition suitable for quick review.";
          break;
        case "detailed":
          depthInstructions =
            "Provide a thorough explanation with technical depth, examples, and related concepts.";
          break;
        case "exam-focused":
          depthInstructions = `Provide an exam-focused explanation structured as:
1. **Definition**: Clear, concise definition
2. **Why It Matters for SecAI+**: Why this appears on the exam and which objectives it maps to
3. **Real-World Example**: A practical scenario illustrating this concept
4. **Common Exam Traps**: Misconceptions or tricky distinctions the exam may test
5. **Related Concepts**: Other terms the candidate should study alongside this one`;
          break;
      }

      const systemPrompt = `You are an expert CompTIA SecAI+ (CY0-001) instructor helping a candidate prepare for the exam.

The exam covers 4 domains:
${DOMAINS.map((d) => `- ${d.name} (${Math.round(d.weight * 100)}%)`).join("\n")}

Context: This concept falls under ${domainContext}.

${depthInstructions}

Be accurate, practical, and exam-relevant. Use clear language appropriate for IT professionals with 2+ years of cybersecurity experience.`;

      const userPrompt = `Explain the following concept for the CompTIA SecAI+ exam: "${concept}"`;

      const explanation = await generate(systemPrompt, userPrompt);

      return {
        content: [
          {
            type: "text",
            text: `# SecAI+ Concept: ${concept}\n\n${explanation}`,
          },
        ],
      };
    }
  );
}
