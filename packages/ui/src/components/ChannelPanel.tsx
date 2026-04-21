import { useState } from "react";
import { Hash, Plus, Loader2, Trash2 } from "lucide-react";
import { useChannels, useCreateChannel, useDeleteChannel } from "../hooks/useChannels";
import { useAppStore } from "../stores/useAppStore";
import { cn } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChannelPanel() {
  const { data: channels = [], isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const deleteChannel = useDeleteChannel();
  const [newChannelName, setNewChannelName] = useState("");
  const { selectedChannelId, setSelectedChannel } = useAppStore();

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    if (newChannelName.trim()) {
      createChannel.mutate(newChannelName.trim());
      setNewChannelName("");
    }
  };

  const handleDeleteChannel = (channelId: string) => {
    if (selectedChannelId === channelId) {
      setSelectedChannel(null);
    }
    deleteChannel.mutate(channelId);
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
            <div
              key={channel.id}
              className={cn(
                "group flex items-center border-l-2 pr-1",
                isActive
                  ? "border-l-[hsl(var(--sidebar-active-foreground))]"
                  : "border-l-transparent"
              )}
              style={
                isActive
                  ? { backgroundColor: "hsl(var(--sidebar-active))" }
                  : undefined
              }
            >
              <Button
                variant="ghost"
                className={cn(
                  "flex-1 justify-start gap-2 text-left rounded-none",
                  isActive ? "font-medium" : ""
                )}
                style={
                  isActive
                    ? { color: "hsl(var(--sidebar-active-foreground))" }
                    : { color: "hsl(var(--sidebar-foreground))" }
                }
                onClick={() => setSelectedChannel(channel.id)}
              >
                <Hash className="h-4 w-4 flex-shrink-0 opacity-60" />
                <span className="truncate">{channel.name}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 flex-shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChannel(channel.id);
                }}
                disabled={deleteChannel.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        {channels.length === 0 && !isLoading && (
          <p className="p-4 text-sm text-muted-foreground text-center">No channels yet</p>
        )}
      </div>
    </div>
  );
}
