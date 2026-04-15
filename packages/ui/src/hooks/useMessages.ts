import { useQuery } from "@tanstack/react-query";
import type { DbMessage } from "../types";
import { useWsStore } from "../stores/useWsStore";
import { useEffect } from "react";

export function useMessages(channelId: string | null) {
  const { setMessages } = useWsStore();

  const query = useQuery({
    queryKey: ["messages", channelId],
    queryFn: async () => {
      const res = await fetch(`/channels/${channelId}/messages`);
      const data = (await res.json()) as { messages: DbMessage[] };
      return data.messages;
    },
    enabled: !!channelId,
  });

  useEffect(() => {
    if (query.data) {
      setMessages(query.data);
    }
  }, [query.data, setMessages]);

  return query;
}
