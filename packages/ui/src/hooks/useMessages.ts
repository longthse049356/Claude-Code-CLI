import { useQuery } from "@tanstack/react-query";
import type { DbMessage } from "../types";
import { useWsStore } from "../stores/useWsStore";
import { useEffect } from "react";

export function useMessages(channelId: string | null) {
  const { setMessages, messages } = useWsStore();

  const query = useQuery({
    queryKey: ["messages", channelId],
    queryFn: async () => {
      const res = await fetch(`/channels/${channelId}/messages`);
      return (await res.json()) as DbMessage[];
    },
    enabled: !!channelId,
  });

  // Seed the store with REST data on initial load / channel switch
  useEffect(() => {
    if (query.data) {
      setMessages(query.data);
    }
  }, [query.data, setMessages]);

  // Return live store messages filtered by channel — these update via WebSocket
  const channelMessages = channelId
    ? messages.filter((m) => m.channel_id === channelId)
    : [];

  return { data: channelMessages, isLoading: query.isLoading };
}
