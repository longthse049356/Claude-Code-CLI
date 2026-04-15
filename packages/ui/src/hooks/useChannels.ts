import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Channel } from "../types";

const API_URL = "http://localhost:3456";

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/channels`);
      const data = (await res.json()) as { channels: Channel[] };
      return data.channels;
    },
  });
}

export function useCreateChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${API_URL}/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      return (await res.json()) as Channel;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    },
  });
}
