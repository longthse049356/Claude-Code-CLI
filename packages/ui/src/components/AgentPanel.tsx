import { useState } from "react";
import { Bot, Cpu, Loader2, Plus, Trash2 } from "lucide-react";
import { useAgents, useAddAgent, useRemoveAgent } from "../hooks/useAgents";
import { useAppStore } from "../stores/useAppStore";
import { useWsStore } from "../stores/useWsStore";
import { cn } from "../lib/utils";

function formatModelName(model: string): string {
  // "claude-sonnet-4-20250514" -> "sonnet-4"
  // "claude-3-5-haiku-20241022" -> "haiku-3.5"
  const match = model.match(/claude-(?:(\d+)-(\d+)-)?([\w]+?)(?:-\d{8})?(?:-latest)?$/);
  if (match) {
    const [, major, minor, variant] = match;
    if (major && minor) return `${variant}-${major}.${minor}`;
    if (major) return `${variant}-${major}`;
    return variant ?? model;
  }
  return model;
}

export function AgentPanel() {
  const { selectedChannelId } = useAppStore();
  const { data: agents = [], isLoading } = useAgents(selectedChannelId);
  const addAgent = useAddAgent();
  const removeAgent = useRemoveAgent();
  const typingAgents = useWsStore((state) => state.typingAgents);
  const [newAgentName, setNewAgentName] = useState("");

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAgentName.trim() && selectedChannelId) {
      addAgent.mutate({ channelId: selectedChannelId, name: newAgentName.trim() });
      setNewAgentName("");
    }
  };

  const handleRemoveAgent = (agentId: string) => {
    if (selectedChannelId) {
      removeAgent.mutate({ channelId: selectedChannelId, agentId });
    }
  };

  const isAgentThinking = (agentName: string): boolean => {
    if (!selectedChannelId) return false;
    return typingAgents.has(`${selectedChannelId}:${agentName}`);
  };

  if (!selectedChannelId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Bot className="h-8 w-8 opacity-40" />
        <p className="text-sm">Select a channel</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          Agents
        </h3>
        <form onSubmit={handleAddAgent} className="flex gap-1.5">
          <input
            type="text"
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            placeholder="Agent name..."
            className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={addAgent.isPending || !newAgentName.trim()}
            className="p-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {addAgent.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {agents.map((agent) => {
          const thinking = isAgentThinking(agent.name);
          return (
            <div
              key={agent.id}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{agent.name}</span>
                </div>
                <button
                  onClick={() => handleRemoveAgent(agent.id)}
                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {agent.model && (
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {formatModelName(agent.model)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      thinking ? "bg-amber-400 animate-pulse" : "bg-emerald-500"
                    )}
                  />
                  {thinking ? "Thinking" : "Idle"}
                </span>
              </div>
            </div>
          );
        })}
        {agents.length === 0 && !isLoading && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No agents in this channel
          </p>
        )}
      </div>
    </div>
  );
}
