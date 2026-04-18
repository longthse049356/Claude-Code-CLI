import { useState } from "react";
import { useChannels, useCreateChannel } from "../hooks/useChannels";
import { useAppStore } from "../stores/useAppStore";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";

export function ChannelPanel() {
  const { data: channels = [], isLoading } = useChannels();
  const createChannel = useCreateChannel();
  const [newChannelName, setNewChannelName] = useState("");
  const selectedChannelId = useAppStore((state) => state.selectedChannelId);
  const setSelectedChannel = useAppStore((state) => state.setSelectedChannel);

  const handleCreateChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newChannelName.trim();
    if (!name) return;

    createChannel.mutate(name, {
      onSuccess: () => setNewChannelName(""),
    });
  };

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="p-4 border-b border-border">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Channels</h2>
          <Badge variant="outline">{channels.length}</Badge>
        </div>

        <form onSubmit={handleCreateChannel} className="flex gap-2">
          <Input
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="New channel..."
          />
          <Button type="submit" size="sm" disabled={createChannel.isPending}>
            +
          </Button>
        </form>
      </div>

      <ScrollArea className="flex-1">
        {isLoading && <p className="p-4 text-sm text-muted-foreground">Loading...</p>}

        {!isLoading && channels.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No channels yet</p>
        )}

        {channels.map((channel) => {
          const selected = selectedChannelId === channel.id;
          return (
            <button
              key={channel.id}
              onClick={() => setSelectedChannel(channel.id)}
              className={`w-full border-b border-border px-4 py-2 text-left text-sm transition-colors hover:bg-secondary ${
                selected ? "bg-secondary font-medium" : ""
              }`}
              type="button"
            >
              # {channel.name}
            </button>
          );
        })}
      </ScrollArea>
    </div>
  );
}
