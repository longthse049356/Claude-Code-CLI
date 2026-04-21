import type { ToolDefinition, ToolHandler } from "../types.ts";
import { TOOL_SCHEMAS } from "./schemas.ts";
import { readFile } from "./handlers/read-file.ts";
import { writeFile } from "./handlers/write-file.ts";
import { bash } from "./handlers/bash.ts";
import { glob } from "./handlers/glob.ts";
import { grep } from "./handlers/grep.ts";

const registry = new Map<string, ToolHandler>();

registry.set("read_file", readFile);
registry.set("write_file", writeFile);
registry.set("bash", bash);
registry.set("glob", glob);
registry.set("grep", grep);

export function getToolSchemas(): ToolDefinition[] {
  return TOOL_SCHEMAS;
}

export function getToolHandler(name: string): ToolHandler | undefined {
  return registry.get(name);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<{ result: string; isError: boolean }> {
  const handler = getToolHandler(name);
  if (!handler) {
    return { result: `unknown tool: ${name}`, isError: true };
  }
  try {
    const result = await handler(input);
    return { result, isError: false };
  } catch (err) {
    return { result: (err as Error).message, isError: true };
  }
}
