import { relative } from "node:path";
import { validatePath, getWorkspace } from "../sandbox.ts";

export async function writeFile(input: Record<string, unknown>): Promise<string> {
  const path = validatePath(input.path as string);
  const content = input.content as string;
  await Bun.write(path, content);
  const rel = relative(getWorkspace(), path);
  return `wrote ${content.length} bytes to ${rel}`;
}
