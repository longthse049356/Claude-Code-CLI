import { useState } from "react";
import { Hash, Plus, Loader2 } from "lucide-react";
import { useChannels, useCreateChannel } from "../hooks/useChannels";
import { useAppStore } from "../stores/useAppStore";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
          <Input
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="New channel..."
            className="flex-1"
          />
          <Button
            type="submit"
            size="icon"
            disabled={createChannel.isPending || !newChannelName.trim()}
          >
            {createChannel.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
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
            <Button
              key={channel.id}
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2 text-left border-l-2",
                isActive
                  ? "border-l-[hsl(var(--sidebar-active-foreground))] font-medium"
                  : "border-l-transparent"
              )}
              style={
                isActive
                  ? {
                      backgroundColor: "hsl(var(--sidebar-active))",
                      color: "hsl(var(--sidebar-active-foreground))",
                    }
                  : { color: "hsl(var(--sidebar-foreground))" }
              }
              onClick={() => setSelectedChannel(channel.id)}
            >
              <Hash className="h-4 w-4 flex-shrink-0 opacity-60" />
              <span className="truncate">{channel.name}</span>
            </Button>
          );
        })}
        {channels.length === 0 && !isLoading && (
          <p className="p-4 text-sm text-muted-foreground text-center">No channels yet</p>
        )}
      </div>
    </div>
  );
}
