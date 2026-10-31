import { useState } from "react";
export type Theme = "light" | "dark";
export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("crewcanvas.theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* Preference persistence may be disabled by the browser. */ }
  return "light";
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("crewcanvas.theme", theme);
  } catch { /* Still apply for this session. */ }
}
export function useTheme() {
  const [theme, set] = useState(initialTheme);
  return [theme, () => {
    const next = theme === "light" ? "dark" : "light";
    applyTheme(next);
    set(next);
  }] as const;
}
