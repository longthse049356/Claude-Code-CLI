import "./App.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeToggle } from "./components/ThemeToggle";
import { ChannelPanel } from "./components/ChannelPanel";
import { ChatPanel } from "./components/ChatPanel";
import { AgentPanel } from "./components/AgentPanel";
import { LogPanel } from "./components/LogPanel";
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
  // Connect to WebSocket
  useWebSocket("ws://localhost:3456/ws");

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-800 bg-white dark:bg-slate-950">
        <h1 className="text-xl font-bold">M10 Lite UI</h1>
        <div className="flex items-center gap-4">
          <ConnectionStatus />
          <ThemeToggle />
        </div>
      </header>

      {/* Main Dashboard Grid */}
      <main className="flex-1 grid grid-cols-[240px_1fr_320px] overflow-hidden">
        {/* Left: Channel Panel */}
        <ChannelPanel />

        {/* Center: Chat Panel */}
        <ChatPanel />

        {/* Right: Agent + Log Panels */}
        <div className="flex flex-col border-l dark:border-slate-800">
          <div className="h-1/2 border-b dark:border-slate-800 overflow-hidden">
            <AgentPanel />
          </div>
          <div className="h-1/2 overflow-hidden">
            <LogPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

function ConnectionStatus() {
  const connected = useWsStore((state) => state.connected);
  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`w-2 h-2 rounded-full ${
          connected ? "bg-green-500" : "bg-red-500"
        }`}
      />
      <span className="text-slate-600 dark:text-slate-400">
        {connected ? "Connected" : "Disconnected"}
      </span>
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
