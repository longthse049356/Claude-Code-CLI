import { useState } from "react";
import { Bot, Cpu, Loader2, Plus, Trash2 } from "lucide-react";
import { useAgents, useAddAgent, useRemoveAgent } from "../hooks/useAgents";
import { useAppStore } from "../stores/useAppStore";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

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

interface AgentPanelProps {
  runningAgentIds?: string[];
}

export function AgentPanel({ runningAgentIds = [] }: AgentPanelProps) {
  const { selectedChannelId } = useAppStore();
  const { data: agents = [], isLoading } = useAgents(selectedChannelId);
  const addAgent = useAddAgent();
  const removeAgent = useRemoveAgent();
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
          <Input
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            placeholder="Agent name..."
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={addAgent.isPending || !newAgentName.trim()}
          >
            {addAgent.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {agents.map((agent) => {
          return (
            <Card key={agent.id} className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{agent.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveAgent(agent.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                {agent.model && (
                  <span className="flex items-center gap-1">
                    <Cpu className="h-3 w-3" />
                    {formatModelName(agent.model)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <span className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    runningAgentIds.includes(agent.id) ? "bg-yellow-500 animate-pulse" : "bg-emerald-500"
                  )} />
                  {runningAgentIds.includes(agent.id) ? "Thinking" : "Idle"}
                </span>
              </div>
            </Card>
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
