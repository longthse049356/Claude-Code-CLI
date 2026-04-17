import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageSquare, SendHorizontal, User } from "lucide-react";
import { useMessages } from "../hooks/useMessages";
import { useAppStore } from "../stores/useAppStore";
import { useWsStore } from "../stores/useWsStore";
import { cn } from "../lib/utils";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function ChatPanel() {
  const { selectedChannelId } = useAppStore();
  const { data: messages = [], isLoading } = useMessages(selectedChannelId);
  const typingAgents = useWsStore((state) => state.typingAgents);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !selectedChannelId || isSending) return;

    setIsSending(true);
    try {
      await fetch(`/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputValue.trim() }),
      });
      setInputValue("");
    } catch (err) {
      console.error("Failed to send message:", err);
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
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-30" />
        <p className="text-sm">Select a channel to view messages</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={cn(
                "flex gap-2.5",
                isUser ? "flex-row-reverse ml-auto max-w-[80%]" : "max-w-[80%]"
              )}
            >
              <div
                className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
                style={
                  isUser
                    ? {
                        backgroundColor: "hsl(var(--bubble-user))",
                        color: "hsl(var(--bubble-user-foreground))",
                      }
                    : {
                        backgroundColor: "hsl(var(--bubble-assistant))",
                        color: "hsl(var(--bubble-assistant-foreground))",
                      }
                }
              >
                {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
              </div>
              <div>
                <p className={cn("text-[10px] mb-1 text-muted-foreground", isUser ? "text-right" : "")}>
                  {isUser ? "You" : (msg.agent_name || "Agent")} · {formatTime(msg.created_at)}
                </p>
                <div
                  className={cn(
                    "px-3 py-2 rounded-xl text-sm leading-relaxed",
                    isUser ? "rounded-tr-sm" : "rounded-tl-sm"
                  )}
                  style={
                    isUser
                      ? {
                          backgroundColor: "hsl(var(--bubble-user))",
                          color: "hsl(var(--bubble-user-foreground))",
                        }
                      : {
                          backgroundColor: "hsl(var(--bubble-assistant))",
                          color: "hsl(var(--bubble-assistant-foreground))",
                        }
                  }
                >
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
        {typingText && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bot className="h-4 w-4" />
            <span className="italic">{typingText} is thinking</span>
            <span className="flex gap-0.5 items-center">
              <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1 h-1 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
            </span>
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t border-border bg-card">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            disabled={isSending}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isSending}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-1.5"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
