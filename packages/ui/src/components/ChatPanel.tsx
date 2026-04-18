import { useEffect, useRef, useState } from "react";
import { useMessages } from "../hooks/useMessages";
import { useMessageStream } from "../hooks/useMessageStream";
import { useAppStore } from "../stores/useAppStore";
import { useWsStore } from "../stores/useWsStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { ScrollArea } from "./ui/scroll-area";

export function ChatPanel() {
  const selectedChannelId = useAppStore((state) => state.selectedChannelId);
  const messages = useWsStore((state) =>
    selectedChannelId
      ? state.messages.filter((message) => message.channel_id === selectedChannelId)
      : []
  );
  const typingAgents = useWsStore((state) => state.typingAgents);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendStreamMessage } = useMessageStream(selectedChannelId);

  const { isLoading } = useMessages(selectedChannelId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingAgents]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !selectedChannelId || isSending) return;

    try {
      setIsSending(true);
      await sendStreamMessage(inputValue.trim());
      setInputValue("");
    } catch (err) {
      useWsStore.getState().addLog(`[UI] Failed to stream message: ${String(err)}`);
    } finally {
      setIsSending(false);
    }
  };

  const typingText = selectedChannelId
    ? Array.from(typingAgents)
        .filter((key) => key.startsWith(`${selectedChannelId}:`))
        .map((key) => key.split(":")[1])
        .join(", ")
    : "";

  if (!selectedChannelId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select a channel to view messages
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 p-4 space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading messages...</p>}

        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {msg.agent_name}:
            </span>{" "}
            <span className="text-foreground">{msg.text}</span>
          </div>
        ))}

        {typingText && (
          <p className="text-sm text-muted-foreground italic">{typingText} is typing...</p>
        )}

        <div ref={messagesEndRef} />
      </ScrollArea>

      <form onSubmit={sendMessage} className="p-4 border-t border-border">
        <div className="flex gap-2">
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            disabled={isSending}
          />
          <Button type="submit" disabled={!inputValue.trim() || isSending}>
            {isSending ? "Sending..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
