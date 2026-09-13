"use client";
import { useSyncExternalStore } from "react";

const key = "peak-leads-theme";
type Theme = "light" | "dark";
function snapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(key, theme); } catch { /* Keep this visit usable without storage. */ }
  window.dispatchEvent(new Event("peak-theme-change"));
}
function subscribe(notify: () => void) {
  function sync(event: StorageEvent) {
    if (event.key !== key && event.key !== null) return;
    document.documentElement.dataset.theme = event.newValue === "dark" ? "dark" : "light";
    notify();
  }
  window.addEventListener("peak-theme-change", notify);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("peak-theme-change", notify);
    window.removeEventListener("storage", sync);
  };
}
export function ThemeControl({ variant = "select" }: { variant?: "select" | "toggle" }) {
  const theme = useSyncExternalStore(subscribe, snapshot, (): Theme => "light");
  if (variant === "toggle") {
    const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
    return <button type="button" className="icon-button desktop-theme-toggle" aria-label={label} title={label} onClick={() => applyTheme(theme === "light" ? "dark" : "light")}>
      <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {theme === "light" ? <path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5" /></>}
      </svg>
    </button>;
  }
  return <label className="theme-control">Theme
    <select aria-label="Theme" value={theme} onChange={event => applyTheme(event.target.value === "dark" ? "dark" : "light")}>
      <option value="light">Light</option><option value="dark">Dark</option>
    </select>
  </label>;
}
