/**
 * Light / dark theme. Light is the default; a guard's choice is remembered on
 * this phone. Applied before the first render so the page never flashes the
 * wrong theme.
 */

import { useCallback, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "surgeguard.security-alerts.theme";
const BAR_COLOUR: Record<Theme, string> = { light: "#edf0f3", dark: "#0e1319" };

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOUR[theme]);
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "light" ? "dark" : "light";
      applyTheme(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Not remembered, but still switched for this visit.
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}
