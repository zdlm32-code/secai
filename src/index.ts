import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerQuizTool } from "./tools/quiz.js";
import { registerExplainTool } from "./tools/explain.js";
import { registerFlashcardTool } from "./tools/flashcard.js";
import { registerScenarioTool } from "./tools/scenario.js";
import { registerAssessTool } from "./tools/assess.js";
import { registerProgressTool } from "./tools/progress.js";

const server = new McpServer({
  name: "secai-study",
  version: "1.0.0",
});

registerQuizTool(server);
registerExplainTool(server);
registerFlashcardTool(server);
registerScenarioTool(server);
registerAssessTool(server);
registerProgressTool(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("SecAI+ Study MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
