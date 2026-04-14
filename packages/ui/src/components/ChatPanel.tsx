import { useEffect, useRef, useState } from "react";
import { useMessages } from "../hooks/useMessages";
import { useAppStore } from "../stores/useAppStore";
import { useWsStore } from "../stores/useWsStore";

const API_URL = "http://localhost:3456";

export function ChatPanel() {
  const { selectedChannelId } = useAppStore();
  const { data: messages = [], isLoading } = useMessages(selectedChannelId);
  const typingAgents = useWsStore((state) => state.typingAgents);
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !selectedChannelId) return;

    try {
      await fetch(`${API_URL}/channels/${selectedChannelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: inputValue.trim() }),
      });
      setInputValue("");
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  // Get typing agents for selected channel
  const typingText = selectedChannelId
    ? Array.from(typingAgents)
        .filter((key) => key.startsWith(`${selectedChannelId}:`))
        .map((key) => key.split(":")[1])
        .join(", ")
    : "";

  if (!selectedChannelId) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500">
        Select a channel to view messages
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading && <p className="text-sm text-slate-500">Loading messages...</p>}
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {msg.agent_name}:
            </span>{" "}
            <span className="text-slate-700 dark:text-slate-300">{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
        {typingText && (
          <p className="text-sm text-slate-500 italic">{typingText} is typing...</p>
        )}
      </div>

      <form onSubmit={sendMessage} className="p-4 border-t dark:border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 border rounded dark:bg-slate-900 dark:border-slate-700"
          />
          <button
            type="submit"
            disabled={!inputValue.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
