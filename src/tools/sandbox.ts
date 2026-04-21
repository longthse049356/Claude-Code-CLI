import { resolve } from "node:path";

const WORKSPACE = resolve(process.env.AGENT_WORKSPACE ?? process.cwd());

export function getWorkspace(): string {
  return WORKSPACE;
}

export function validatePath(inputPath: string): string {
  const absolute = resolve(WORKSPACE, inputPath);
  if (!absolute.startsWith(WORKSPACE)) {
    throw new Error(`path outside workspace: ${inputPath}`);
  }
  return absolute;
}

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd if=",
  ":(){ :|:& };:",
];

export function validateBashCommand(command: string): void {
  for (const blocked of BLOCKED_COMMANDS) {
    if (command.includes(blocked)) {
      throw new Error(`blocked command: ${blocked}`);
    }
  }
}
