import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getStoredTheme(): Theme | null {
  try {
    const v = localStorage.getItem("hrm-theme");
    if (v === "light" || v === "dark") return v;
  } catch {
    // ignore
  }
  return null;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem("hrm-theme", theme);
  } catch {
    // ignore
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    return getStoredTheme() ?? "light";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, toggle };
}

// Initialize theme immediately on load (avoid flash)
if (typeof window !== "undefined") {
  const initial = getStoredTheme() ?? "light";
  applyTheme(initial);
}
