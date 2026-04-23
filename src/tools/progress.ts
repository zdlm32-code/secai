import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DOMAINS, getDomain, type DomainId } from "../config.js";
import { readJSON, writeJSON } from "../data/store.js";
import type { ProgressData, ProgressRecord } from "../data/types.js";

const PROGRESS_FILE = "progress.json";
const PASSING_THRESHOLD = 66.7;

async function loadProgress(): Promise<ProgressData> {
  return readJSON<ProgressData>(PROGRESS_FILE, {
    sessions: [],
    lastUpdated: new Date().toISOString(),
  });
}

async function saveProgress(data: ProgressData): Promise<void> {
  data.lastUpdated = new Date().toISOString();
  await writeJSON(PROGRESS_FILE, data);
}

function generateReport(data: ProgressData): string {
  const { sessions } = data;
  if (sessions.length === 0) {
    return "# SecAI+ Study Progress\n\nNo study sessions recorded yet. Start a quiz or assessment to begin tracking your progress!";
  }

  let output = "# SecAI+ Study Progress Report\n\n";

  // Overall stats
  const totalQ = sessions.reduce((s, r) => s + r.totalQuestions, 0);
  const totalCorrect = sessions.reduce((s, r) => s + r.correctAnswers, 0);
  const overallPct = totalQ > 0 ? (totalCorrect / totalQ) * 100 : 0;

  output += `## Overall\n`;
  output += `- **Sessions:** ${sessions.length}\n`;
  output += `- **Total Questions:** ${totalQ}\n`;
  output += `- **Overall Score:** ${overallPct.toFixed(1)}% (${totalCorrect}/${totalQ})\n`;
  output += `- **Status:** ${overallPct >= PASSING_THRESHOLD ? "PASSING" : "BELOW PASSING"} (need ${PASSING_THRESHOLD}%)\n\n`;

  // Per-domain breakdown
  output += `## Domain Breakdown\n\n`;
  output += `| Domain | Weight | Questions | Score | Status |\n`;
  output += `|--------|--------|-----------|-------|--------|\n`;

  for (const domain of DOMAINS) {
    const domainSessions = sessions.filter((s) => s.domain === domain.id);
    const dTotal = domainSessions.reduce((s, r) => s + r.totalQuestions, 0);
    const dCorrect = domainSessions.reduce((s, r) => s + r.correctAnswers, 0);
    const dPct = dTotal > 0 ? (dCorrect / dTotal) * 100 : 0;
    const status = dTotal === 0 ? "No data" : dPct >= PASSING_THRESHOLD ? "PASS" : "NEEDS WORK";

    output += `| ${domain.name.substring(0, 35)} | ${Math.round(domain.weight * 100)}% | ${dTotal} | ${dPct.toFixed(1)}% | ${status} |\n`;
  }

  // Weighted score estimate
  let weightedScore = 0;
  let weightCovered = 0;
  for (const domain of DOMAINS) {
    const domainSessions = sessions.filter((s) => s.domain === domain.id);
    const dTotal = domainSessions.reduce((s, r) => s + r.totalQuestions, 0);
    const dCorrect = domainSessions.reduce((s, r) => s + r.correctAnswers, 0);
    if (dTotal > 0) {
      weightedScore += (dCorrect / dTotal) * domain.weight;
      weightCovered += domain.weight;
    }
  }
  const estimatedScore = weightCovered > 0 ? (weightedScore / weightCovered) * 900 : 0;

  output += `\n## Exam Readiness Estimate\n\n`;
  output += `- **Estimated Score:** ${Math.round(estimatedScore)}/900 (passing: 600)\n`;
  output += `- **Domains Covered:** ${Math.round(weightCovered * 100)}% of exam weight\n`;

  // Weak areas
  const weakDomains = DOMAINS.filter((d) => {
    const ds = sessions.filter((s) => s.domain === d.id);
    const dt = ds.reduce((s, r) => s + r.totalQuestions, 0);
    const dc = ds.reduce((s, r) => s + r.correctAnswers, 0);
    return dt === 0 || (dc / dt) * 100 < PASSING_THRESHOLD;
  });

  if (weakDomains.length > 0) {
    output += `\n## Recommended Focus Areas\n\n`;
    weakDomains.forEach((d) => {
      output += `- **${d.name}** (${Math.round(d.weight * 100)}% of exam)`;
      const ds = sessions.filter((s) => s.domain === d.id);
      if (ds.length === 0) {
        output += ` — No practice yet!\n`;
      } else {
        const dt = ds.reduce((s, r) => s + r.totalQuestions, 0);
        const dc = ds.reduce((s, r) => s + r.correctAnswers, 0);
        output += ` — ${((dc / dt) * 100).toFixed(1)}% (need ${PASSING_THRESHOLD}%)\n`;
      }
    });
  }

  // Recent sessions
  const recent = sessions.slice(-5).reverse();
  output += `\n## Recent Sessions\n\n`;
  recent.forEach((s) => {
    output += `- ${s.date} | ${s.tool} | ${getDomain(s.domain).name.substring(0, 25)} | ${s.score.toFixed(1)}% (${s.correctAnswers}/${s.totalQuestions})\n`;
  });

  return output;
}

export function registerProgressTool(server: McpServer) {
  server.tool(
    "secai_progress",
    "Track and report CompTIA SecAI+ study progress — record scores, view reports, or reset",
    {
      action: z
        .enum(["record", "report", "reset"])
        .describe("Record a score, view progress report, or reset all data"),
      domain: z
        .enum(["basic-ai", "securing-ai", "ai-security", "ai-grc"])
        .optional()
        .describe("Domain (required for record action)"),
      topic: z.string().optional().describe("Topic studied"),
      totalQuestions: z.number().optional().describe("Total questions attempted"),
      correctAnswers: z.number().optional().describe("Number of correct answers"),
      tool: z
        .enum(["quiz", "assess", "scenario"])
        .optional()
        .describe("Which study tool was used"),
    },
    async ({ action, domain, topic, totalQuestions, correctAnswers, tool }) => {
      const progress = await loadProgress();

      if (action === "record") {
        if (!domain || totalQuestions === undefined || correctAnswers === undefined) {
          return {
            content: [
              {
                type: "text",
                text: 'Error: "record" action requires domain, totalQuestions, and correctAnswers.',
              },
            ],
          };
        }

        const record: ProgressRecord = {
          date: new Date().toISOString().split("T")[0],
          tool: tool ?? "quiz",
          domain,
          topic: topic ?? "general",
          totalQuestions,
          correctAnswers,
          score: (correctAnswers / totalQuestions) * 100,
        };

        progress.sessions.push(record);
        await saveProgress(progress);

        return {
          content: [
            {
              type: "text",
              text: `Recorded: ${record.score.toFixed(1)}% (${correctAnswers}/${totalQuestions}) for ${getDomain(domain).name} — ${topic ?? "general"}`,
            },
          ],
        };
      }

      if (action === "reset") {
        await saveProgress({ sessions: [], lastUpdated: new Date().toISOString() });
        return {
          content: [{ type: "text", text: "Progress data has been reset." }],
        };
      }

      // report
      const report = generateReport(progress);
      return { content: [{ type: "text", text: report }] };
    }
  );
}
