import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Bot, Wifi, WifiOff } from "lucide-react";
import { ThemeToggle } from "./components/ThemeToggle";
import { ChannelPanel } from "./components/ChannelPanel";
import { ChatPanel } from "./components/ChatPanel";
import { AgentPanel } from "./components/AgentPanel";
import { useWebSocket } from "./hooks/useWebSocket";
import { useWsStore } from "./stores/useWsStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function Dashboard() {
  useWebSocket();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold tracking-tight">Clawd</h1>
        </div>
        <div className="flex items-center gap-3">
          <ConnectionStatus />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[240px_1fr_320px] grid-rows-[1fr] overflow-hidden">
        <ChannelPanel />
        <ChatPanel />
        <div className="flex flex-col h-full border-l border-border overflow-hidden">
          <AgentPanel />
        </div>
      </main>
    </div>
  );
}

function ConnectionStatus() {
  const connected = useWsStore((state) => state.connected);
  return (
    <div className="flex items-center gap-1.5 text-xs font-medium">
      {connected ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-muted-foreground">Connected</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-destructive" />
          <span className="text-destructive">Disconnected</span>
        </>
      )}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  );
}
