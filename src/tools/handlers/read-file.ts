import { validatePath } from "../sandbox.ts";

export async function readFile(input: Record<string, unknown>): Promise<string> {
  const path = validatePath(input.path as string);
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`file not found: ${input.path}`);
  }
  return await file.text();
}
