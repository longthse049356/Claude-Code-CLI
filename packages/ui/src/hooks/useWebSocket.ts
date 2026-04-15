import { useEffect } from "react";
import { useWsStore } from "../stores/useWsStore";
import type { WsBroadcast } from "../types";

export function useWebSocket(url: string = `ws://${location.host}/ws`) {
  const { setConnected, addMessage, addTypingAgent, removeTypingAgent, addLog } =
    useWsStore();

  useEffect(() => {
    const ws = new WebSocket(url);

    ws.onopen = () => {
      console.log("[WS] Connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsBroadcast;

        if (data.type === "new_message") {
          addMessage(data.data);
        } else if (data.type === "typing") {
          addTypingAgent(data.data.channel_id, data.data.agent_name);
          // Clear typing indicator after 2 seconds
          setTimeout(() => {
            removeTypingAgent(data.data.channel_id, data.data.agent_name);
          }, 2000);
        } else if (data.type === "log") {
          addLog(data.data);
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      setConnected(false);
      // Auto-reconnect after 2 seconds
      setTimeout(() => {
        console.log("[WS] Attempting reconnect...");
        // Trigger a new connection attempt (in production, implement exponential backoff)
      }, 2000);
    };

    ws.onerror = (event) => {
      console.error("[WS] Error:", event);
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [url, setConnected, addMessage, addTypingAgent, removeTypingAgent, addLog]);
}
