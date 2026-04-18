import { useState } from "react";
import { useAgents, useAddAgent, useRemoveAgent } from "../hooks/useAgents";
import { useAppStore } from "../stores/useAppStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import { Separator } from "./ui/separator";

export function AgentPanel() {
  const selectedChannelId = useAppStore((state) => state.selectedChannelId);
  const { data: agents = [], isLoading } = useAgents(selectedChannelId);
  const addAgent = useAddAgent();
  const removeAgent = useRemoveAgent();
  const [newAgentName, setNewAgentName] = useState("");

  const handleAddAgent = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAgentName.trim();
    if (!name || !selectedChannelId) return;

    addAgent.mutate(
      { channelId: selectedChannelId, name },
      { onSuccess: () => setNewAgentName("") }
    );
  };

  if (!selectedChannelId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Select a channel to manage agents
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Agents</h3>
          <Badge variant="outline">{agents.length}</Badge>
        </div>

        <form onSubmit={handleAddAgent} className="flex gap-2">
          <Input
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            placeholder="Agent name..."
          />
          <Button type="submit" size="sm" disabled={addAgent.isPending}>
            +
          </Button>
        </form>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && <p className="p-3 text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && agents.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">No agents in this channel</p>
        )}

        {agents.map((agent, index) => (
          <div key={agent.id}>
            <div className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{agent.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  removeAgent.mutate({ channelId: selectedChannelId, agentName: agent.name })
                }
              >
                ✕
              </Button>
            </div>
            {index < agents.length - 1 && <Separator />}
          </div>
        ))}
      </ScrollArea>
    </div>
  );
}
