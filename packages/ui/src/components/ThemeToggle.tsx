import { useThemeStore } from "../stores/useThemeStore";

export function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  return (
    <button
      onClick={toggleTheme}
      className="px-3 py-1 text-sm border border-border rounded hover:bg-secondary transition-colors"
      type="button"
    >
      {theme === "dark" ? "Light" : "Dark"}
    </button>
  );
}
