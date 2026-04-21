import { getWorkspace } from "../sandbox.ts";

export async function glob(input: Record<string, unknown>): Promise<string> {
  const pattern = input.pattern as string;
  const g = new Bun.Glob(pattern);
  const matches: string[] = [];
  for await (const path of g.scan({ cwd: getWorkspace() })) {
    matches.push(path);
  }
  if (matches.length === 0) return "no files matched";
  matches.sort();
  return matches.join("\n");
}
