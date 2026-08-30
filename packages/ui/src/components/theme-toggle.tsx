"use client";
import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./button";

export type Theme = "dark" | "light";
const KEY = "bb-theme";

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(KEY, theme); } catch {}
}

/** Inline script for <head>: applies the persisted theme before paint (dark is default). */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${KEY}")||"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = React.useState<Theme>("dark");
  React.useEffect(() => { setTheme((document.documentElement.dataset.theme as Theme) || "dark"); }, []);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <Button variant="ghost" size="icon" aria-label={`Switch to ${next} mode`} onClick={() => { applyTheme(next); setTheme(next); }}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}
