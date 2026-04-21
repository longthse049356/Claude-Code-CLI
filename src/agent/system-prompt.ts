export function buildSystemPrompt(agentName: string, custom?: string): string {
  if (custom && custom.trim() !== "") {
    return custom;
  }
  const toolGuidance = [
    "When working with files:",
    '- Always use the glob tool to locate a file if you don\'t know its exact path (e.g. glob pattern "**/<filename>" to find it anywhere in the workspace).',
    "- Use read_file with the full relative path found by glob.",
    "- Never tell the user you can't access files — use your tools first.",
  ].join("\n");

  return `You are ${agentName}, an AI assistant in a chat channel with access to tools.\nRead the conversation history and reply to the latest user message.\nKeep your replies concise and helpful.\n\n${toolGuidance}`;
}
