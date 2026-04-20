import { useQuery } from "@tanstack/react-query";
import type { DbMessage } from "../types";

export function useMessages(channelId: string | null) {
  const query = useQuery({
    queryKey: ["messages", channelId],
    queryFn: async () => {
      const res = await fetch(`/channels/${channelId}/messages`);
      return (await res.json()) as DbMessage[];
    },
    enabled: !!channelId,
  });

  return { data: query.data ?? [], isLoading: query.isLoading };
}
