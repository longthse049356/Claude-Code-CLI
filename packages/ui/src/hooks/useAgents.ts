import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent } from "../types";

const API_URL = "http://localhost:3456";

export function useAgents(channelId: string | null) {
  return useQuery({
    queryKey: ["agents", channelId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/channels/${channelId}/agents`);
      const data = (await res.json()) as { agents: Agent[] };
      return data.agents;
    },
    enabled: !!channelId,
  });
}

export function useAddAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      name,
    }: {
      channelId: string;
      name: string;
    }) => {
      const res = await fetch(`${API_URL}/channels/${channelId}/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return (await res.json()) as Agent;
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["agents", channelId] });
    },
  });
}

export function useRemoveAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      channelId,
      agentId,
    }: {
      channelId: string;
      agentId: string;
    }) => {
      await fetch(`${API_URL}/channels/${channelId}/agents/${agentId}`, {
        method: "DELETE",
      });
    },
    onSuccess: (_, { channelId }) => {
      queryClient.invalidateQueries({ queryKey: ["agents", channelId] });
    },
  });
}
