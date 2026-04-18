import { useQuery } from "@tanstack/react-query";
import type { DbMessage } from "../types";
import { useWsStore } from "../stores/useWsStore";
import { useEffect } from "react";

export function useMessages(channelId: string | null) {
  const setMessages = useWsStore((state) => state.setMessages);

  const query = useQuery({
    queryKey: ["messages", channelId],
    queryFn: async () => {
      const res = await fetch(`/channels/${channelId}/messages`);
      if (!res.ok) {
        throw new Error(`Failed to load messages: ${res.status}`);
      }

      const data = (await res.json()) as { messages: DbMessage[] };
      return data.messages;
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (channelId && query.data) {
      setMessages(channelId, query.data);
    }
  }, [channelId, query.data, setMessages]);

  return query;
}
