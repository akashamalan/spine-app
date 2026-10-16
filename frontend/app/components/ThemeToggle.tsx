"use client";

import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

const STORAGE_KEY = "spine-theme";

/** localStorage throws in private mode / blocked-cookie contexts. */
function storeTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not fatal — the toggle still works for this session.
  }
}

/**
 * Deliberately stateless.
 *
 * The active theme lives in one place — the `data-theme` attribute, which
 * layout.tsx sets before first paint. Mirroring it into React state would
 * mean the server renders "light" while the client renders the stored
 * theme, i.e. a hydration mismatch. Instead both icons are always rendered
 * and CSS shows whichever matches the active theme.
 */
export function ThemeToggle() {
  const toggle = () => {
    const explicit = document.documentElement.getAttribute("data-theme");
    const isDark =
      explicit === "dark" ||
      (explicit === null &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    storeTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Switch between light and dark mode"
      title="Switch between light and dark mode"
      className="flex h-8 w-8 items-center justify-center rounded-chip border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <Moon className="h-4 w-4 theme-icon-light" aria-hidden="true" />
      <Sun className="h-4 w-4 theme-icon-dark" aria-hidden="true" />
    </button>
  );
}
