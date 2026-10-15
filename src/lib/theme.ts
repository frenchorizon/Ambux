import { useSyncExternalStore } from "react";

const KEY = "ambux.theme";
let dark = false;
const listeners = new Set<() => void>();

function emit(): void {
  document.documentElement.classList.toggle("dark", dark);
  for (const listener of listeners) listener();
}

export function initTheme(): void {
  try {
    dark = localStorage.getItem(KEY) === "dark";
  } catch {
    dark = false;
  }
  document.documentElement.classList.toggle("dark", dark);
}

export function setDark(next: boolean): void {
  dark = next;
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    /* navigation privée */
  }
  emit();
}

export function toggleTheme(): void {
  setDark(!dark);
}

export function useDark(): boolean {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => dark,
    () => false,
  );
}
