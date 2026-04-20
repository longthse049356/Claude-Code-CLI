import { create } from "zustand";

const getInitialTheme = (): "light" | "dark" => {
  const stored = localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  return "dark";
};

const applyTheme = (theme: "light" | "dark") => {
  document.documentElement.classList.toggle("dark", theme === "dark");
};

// Apply on module load to sync SSR/default state
const initial = getInitialTheme();
applyTheme(initial);

interface AppState {
  selectedChannelId: string | null;
  setSelectedChannel: (id: string | null) => void;
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedChannelId: null,
  setSelectedChannel: (id) => set({ selectedChannelId: id }),
  theme: initial,
  setTheme: (theme) => {
    localStorage.setItem("theme", theme);
    applyTheme(theme);
    set({ theme });
  },
}));
