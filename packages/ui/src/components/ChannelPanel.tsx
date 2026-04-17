import { useState } from "react";
import { Hash, Plus, Loader2 } from "lucide-react";
import { useChannels, useCreateChannel } from "../hooks/useChannels";
import { useAppStore } from "../stores/useAppStore";
import { cn } from "../lib/utils";

export function ChannelPanel() {
  const { data: channels = [], isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const [newChannelName, setNewChannelName] = useState("");
  const { selectedChannelId, setSelectedChannel } = useAppStore();

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (newChannelName.trim()) {
      createChannel.mutate(newChannelName.trim());
      setNewChannelName("");
    }
  };

  return (
    <div
      className="flex flex-col h-full border-r border-border"
      style={{ backgroundColor: "hsl(var(--sidebar))" }}
    >
      <div className="p-4 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Channels
        </h2>
        <form onSubmit={handleCreateChannel} className="flex gap-1.5">
          <input
            type="text"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="New channel..."
            className="flex-1 px-2.5 py-1.5 text-sm rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={createChannel.isPending || !newChannelName.trim()}
            className="p-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            {createChannel.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {channels.map((channel) => {
          const isActive = selectedChannelId === channel.id;
          return (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors border-l-2",
                isActive
                  ? "border-l-[hsl(var(--sidebar-active-foreground))] font-medium"
                  : "border-l-transparent hover:bg-accent"
              )}
              style={
                isActive
                  ? {
                      backgroundColor: "hsl(var(--sidebar-active))",
                      color: "hsl(var(--sidebar-active-foreground))",
                    }
                  : { color: "hsl(var(--sidebar-foreground))" }
              }
            >
              <Hash className="h-4 w-4 flex-shrink-0 opacity-60" />
              <span className="truncate">{channel.name}</span>
            </button>
          );
        })}
        {channels.length === 0 && !isLoading && (
          <p className="p-4 text-sm text-muted-foreground text-center">No channels yet</p>
        )}
      </div>
    </div>
  );
}
