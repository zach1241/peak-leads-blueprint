"use client";
import { useSyncExternalStore } from "react";

const key = "peak-leads-theme";
function snapshot() {
  const applied = document.documentElement.dataset.theme;
  return applied === "light" || applied === "dark" ? applied : "system";
}
function subscribe(notify: () => void) {
  function sync(event: StorageEvent) {
    if (event.key !== key && event.key !== null) return;
    document.documentElement.dataset.theme =
      event.newValue === "light" || event.newValue === "dark"
        ? event.newValue
        : "system";
    notify();
  }
  window.addEventListener("peak-theme-change", notify);
  window.addEventListener("storage", sync);
  return () => {
    window.removeEventListener("peak-theme-change", notify);
    window.removeEventListener("storage", sync);
  };
}
export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "system");
  return (
    <label className="theme-control">
      Appearance
      <select
        aria-label="Appearance"
        value={theme}
        onChange={(event) => {
          const value = event.target.value;
          document.documentElement.dataset.theme = value;
          try { localStorage.setItem(key, value); } catch { /* Apply for this visit if storage is unavailable. */ }
          window.dispatchEvent(new Event("peak-theme-change"));
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
