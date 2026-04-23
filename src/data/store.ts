import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.resolve(__dirname, "../../data");

export async function readJSON<T>(relativePath: string, fallback: T): Promise<T> {
  const fullPath = path.join(DATA_ROOT, relativePath);
  if (!existsSync(fullPath)) return fallback;
  const raw = await readFile(fullPath, "utf-8");
  return JSON.parse(raw) as T;
}

export async function writeJSON(relativePath: string, data: unknown): Promise<void> {
  const fullPath = path.join(DATA_ROOT, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, JSON.stringify(data, null, 2), "utf-8");
}
