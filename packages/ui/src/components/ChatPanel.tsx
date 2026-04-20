import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Bot, Loader2, MessageSquare, RotateCcw, SendHorizontal, User } from "lucide-react";
import { useMessages } from "../hooks/useMessages";
import { useAppStore } from "../stores/useAppStore";
import { readSseStream } from "../lib/sse";
import { cn } from "../lib/utils";
import type { DbMessage } from "../types";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

type DraftAssistantState = {
  channelId: string;
  text: string;
  status: "streaming" | "failed";
  userText: string;
};

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words [&_p]:my-0 [&_p+*]:mt-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-black/10 [&_pre]:p-2 [&_code]:break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export function ChatPanel() {
  const queryClient = useQueryClient();
  const { selectedChannelId } = useAppStore();
  const { data: messages = [], isLoading } = useMessages(selectedChannelId);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [optimisticUserMessage, setOptimisticUserMessage] = useState<DbMessage | null>(null);
  const [draftAssistant, setDraftAssistant] = useState<DraftAssistantState | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, optimisticUserMessage, draftAssistant]);

  const streamMessage = async (channelId: string, userText: string) => {
    const res = await fetch(`/channels/${channelId}/messages/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: userText }),
    });

    if (!res.ok) {
      let message = `Failed to send message (${res.status})`;
      try {
        const payload = (await res.json()) as { error?: string };
        if (payload.error) {
          message = payload.error;
        }
      } catch {
        // keep default
      }
      throw new Error(message);
    }

    if (!res.body) {
      throw new Error("SSE stream not available");
    }

    let doneReceived = false;
    let errorReceived = false;

    await readSseStream(res.body, async ({ event, data }) => {
      if (event === "token") {
        let payload: { text?: string };
        try {
          payload = JSON.parse(data) as { text?: string };
        } catch {
          return;
        }
        if (!payload.text) return;
        setDraftAssistant((prev) => {
          if (!prev || prev.channelId !== channelId) return prev;
          return {
            ...prev,
            text: prev.text + payload.text,
          };
        });
        return;
      }

      if (event === "done") {
        doneReceived = true;
        setDraftAssistant(null);
        setOptimisticUserMessage(null);
        await queryClient.invalidateQueries({ queryKey: ["messages", channelId] });
        await queryClient.refetchQueries({ queryKey: ["messages", channelId], type: "active" });
        return;
      }

      if (event === "error") {
        errorReceived = true;
        setDraftAssistant((prev) => {
          if (!prev || prev.channelId !== channelId) return prev;
          return {
            ...prev,
            status: "failed",
          };
        });
      }
    });

    if (!doneReceived) {
      await queryClient.invalidateQueries({ queryKey: ["messages", channelId] });
      await queryClient.refetchQueries({ queryKey: ["messages", channelId], type: "active" });
      setOptimisticUserMessage(null);
    }

    if (!doneReceived && !errorReceived) {
      setDraftAssistant((prev) => {
        if (!prev || prev.channelId !== channelId) return prev;
        return {
          ...prev,
          status: "failed",
        };
      });
    }
  };

  const sendMessageText = async (text: string) => {
    if (!selectedChannelId || isSending) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    setIsSending(true);
    setOptimisticUserMessage({
      id: `optimistic-${Date.now()}`,
      channel_id: selectedChannelId,
      text: trimmed,
      role: "user",
      agent_name: "",
      created_at: Date.now(),
    });
    setDraftAssistant({
      channelId: selectedChannelId,
      text: "",
      status: "streaming",
      userText: trimmed,
    });

    try {
      await streamMessage(selectedChannelId, trimmed);
      setInputValue("");
    } catch (err) {
      console.error("Failed to stream message:", err);
      setOptimisticUserMessage(null);
      setDraftAssistant((prev) => {
        if (!prev || prev.channelId !== selectedChannelId) return prev;
        return {
          ...prev,
          status: "failed",
          text:
            prev.text ||
            (err instanceof Error ? `[Stream failed] ${err.message}` : "[Stream failed]"),
        };
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendMessage = async () => {
    await sendMessageText(inputValue);
  };

  const retryFailedDraft = async () => {
    if (!draftAssistant || draftAssistant.status !== "failed") return;
    await sendMessageText(draftAssistant.userText);
  };

  if (!selectedChannelId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-30" />
        <p className="text-sm">Select a channel to view messages</p>
      </div>
    );
  }

  const visibleMessages = optimisticUserMessage
    ? [...messages, optimisticUserMessage]
    : messages;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {visibleMessages.map((msg) => {
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
                <p className={cn("text-[10px] mb-1 text-muted-foreground", isUser ? "text-right" : "") }>
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
                  <MarkdownText text={msg.text} />
                </div>
              </div>
            </div>
          );
        })}

        {draftAssistant && draftAssistant.channelId === selectedChannelId && (
          <div className="flex gap-2.5 max-w-[80%]">
            <div
              className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: "hsl(var(--bubble-assistant))",
                color: "hsl(var(--bubble-assistant-foreground))",
              }}
            >
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div>
              <p className="text-[10px] mb-1 text-muted-foreground">
                Agent · {formatTime(Date.now())}
              </p>
              <div
                className={cn(
                  "px-3 py-2 rounded-xl rounded-tl-sm text-sm leading-relaxed",
                  draftAssistant.status === "failed" && "border border-destructive/40"
                )}
                style={{
                  backgroundColor: "hsl(var(--bubble-assistant))",
                  color: "hsl(var(--bubble-assistant-foreground))",
                }}
              >
                <MarkdownText
                  text={draftAssistant.text || (draftAssistant.status === "streaming" ? "..." : "(empty response)")}
                />
              </div>
              {draftAssistant.status === "failed" && (
                <button
                  type="button"
                  onClick={retryFailedDraft}
                  disabled={isSending}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  Stream failed
                  <RotateCcw className="h-3.5 w-3.5" />
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={(e) => {
        e.preventDefault();
        void sendMessage();
      }} className="p-4 border-t border-border bg-card">
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
