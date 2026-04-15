import { useState } from "react";
import { useChannels, useCreateChannel } from "../hooks/useChannels";
import { useAppStore } from "../stores/useAppStore";

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
    <div className="flex flex-col h-full border-r dark:border-slate-800">
      <div className="p-4 border-b dark:border-slate-800">
        <h2 className="text-lg font-semibold mb-2">Channels</h2>
        <form onSubmit={handleCreateChannel} className="flex gap-2">
          <input
            type="text"
            value={newChannelName}
            onChange={(e) => setNewChannelName(e.target.value)}
            placeholder="New channel..."
            className="flex-1 px-2 py-1 text-sm border rounded dark:bg-slate-900 dark:border-slate-700"
          />
          <button
            type="submit"
            disabled={createChannel.isPending}
            className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            +
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="p-4 text-sm text-slate-500">Loading...</p>}
        {channels.map((channel) => (
          <button
            key={channel.id}
            onClick={() => setSelectedChannel(channel.id)}
            className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
              selectedChannelId === channel.id
                ? "bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400"
                : ""
            }`}
          >
            # {channel.name}
          </button>
        ))}
        {channels.length === 0 && !isLoading && (
          <p className="p-4 text-sm text-slate-500">No channels yet</p>
        )}
      </div>
    </div>
  );
}
