import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "../stores/useAppStore";

export function ThemeToggle() {
  const { theme, setTheme } = useAppStore();

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="cursor-pointer"
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
