import { resolve, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";
import { validatePath, getWorkspace } from "../sandbox.ts";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next"]);
const MAX_RESULTS = 200;

export async function grep(input: Record<string, unknown>): Promise<string> {
  const pattern = input.pattern as string;
  const searchPath = input.path
    ? validatePath(input.path as string)
    : getWorkspace();

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    throw new Error(`invalid regex: ${pattern}`);
  }

  const results: string[] = [];

  async function searchFile(filePath: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    try {
      const content = await Bun.file(filePath).text();
      const lines = content.split("\n");
      const rel = relative(getWorkspace(), filePath);
      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          results.push(`${rel}:${i + 1}: ${lines[i]}`);
          if (results.length >= MAX_RESULTS) return;
        }
      }
    } catch {
      // skip binary or unreadable files
    }
  }

  async function walk(dir: string): Promise<void> {
    if (results.length >= MAX_RESULTS) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) return;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(resolve(dir, entry.name));
      } else if (entry.isFile()) {
        await searchFile(resolve(dir, entry.name));
      }
    }
  }

  const info = await stat(searchPath);
  if (info.isFile()) {
    await searchFile(searchPath);
  } else {
    await walk(searchPath);
  }

  if (results.length === 0) return "no matches found";
  return results.join("\n");
}
