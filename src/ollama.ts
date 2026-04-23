import { Ollama } from "ollama";
import { OLLAMA_MODEL } from "./config.js";

const client = new Ollama();

export async function generate(systemPrompt: string, userPrompt: string): Promise<string> {
  const response = await client.chat({
    model: OLLAMA_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    options: { temperature: 0.7 },
  });
  return response.message.content;
}

export async function generateJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat({
        model: OLLAMA_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        format: "json",
        options: { temperature: 0.7 },
      });
      return JSON.parse(response.message.content) as T;
    } catch (err) {
      if (attempt === 1) throw err;
      // Retry once on parse failure
    }
  }
  throw new Error("Failed to generate valid JSON after 2 attempts");
}
