import { useState } from "react";
import { useAgents, useAddAgent, useRemoveAgent } from "../hooks/useAgents";
import { useAppStore } from "../stores/useAppStore";

export function AgentPanel() {
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
      <div className="flex items-center justify-center h-full text-sm text-slate-500">
        Select a channel to manage agents
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b dark:border-slate-800">
        <h3 className="text-sm font-semibold mb-2">Agents</h3>
        <form onSubmit={handleAddAgent} className="flex gap-2">
          <input
            type="text"
            value={newAgentName}
            onChange={(e) => setNewAgentName(e.target.value)}
            placeholder="Agent name..."
            className="flex-1 px-2 py-1 text-sm border rounded dark:bg-slate-900 dark:border-slate-700"
          />
          <button
            type="submit"
            disabled={addAgent.isPending}
            className="px-2 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            +
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-3 text-sm text-slate-500">Loading...</p>}
        {agents.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <span>{agent.name}</span>
            <button
              onClick={() => handleRemoveAgent(agent.id)}
              className="text-red-500 hover:text-red-700 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        {agents.length === 0 && !isLoading && (
          <p className="p-3 text-sm text-slate-500">No agents in this channel</p>
        )}
      </div>
    </div>
  );
}
