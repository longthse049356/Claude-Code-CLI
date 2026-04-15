import { create } from "zustand";

interface AppState {
  selectedChannelId: string | null;
  setSelectedChannel: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedChannelId: null,
  setSelectedChannel: (id) => set({ selectedChannelId: id }),
}));
