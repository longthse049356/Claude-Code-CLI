export function buildSystemPrompt(agentName: string, custom?: string): string {
  if (custom && custom.trim() !== "") {
    return custom;
  }
  return `You are ${agentName}, an AI assistant in a chat channel.
Read the conversation history and reply to the latest user message.
Keep your replies concise and helpful.`;
}
