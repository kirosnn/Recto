"use client";

import { useTheme } from "./ThemeProvider";

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      title={theme === "dark" ? "Passer en clair" : "Passer en sombre"}
      className="w-8 h-8 flex items-center justify-center rounded-lg text-txm hover:text-tx hover:bg-surface transition-colors text-sm"
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
