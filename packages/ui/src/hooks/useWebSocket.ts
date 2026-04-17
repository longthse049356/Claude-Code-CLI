import { useEffect } from "react";
import { useWsStore } from "../stores/useWsStore";
import type { WsBroadcast } from "../types";

export function useWebSocket(url: string = `ws://${location.host}/ws`) {
  const { setConnected, addMessage, addTypingAgent, removeTypingAgent } =
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
          setTimeout(() => {
            removeTypingAgent(data.data.channel_id, data.data.agent_name);
          }, 2000);
        }
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    ws.onclose = () => {
      console.log("[WS] Disconnected");
      setConnected(false);
      setTimeout(() => {
        console.log("[WS] Attempting reconnect...");
      }, 2000);
    };

    ws.onerror = (event) => {
      console.error("[WS] Error:", event);
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [url, setConnected, addMessage, addTypingAgent, removeTypingAgent]);
}
