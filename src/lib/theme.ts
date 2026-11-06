import { useSyncExternalStore } from "react";
import { writeLocal } from "./browserStore";

const KEY = "ambux.theme";
let dark = true;
const listeners = new Set<() => void>();

function emit(): void {
  document.documentElement.classList.toggle("dark", dark);
  for (const listener of listeners) listener();
}

export function initTheme(): void {
  try {
    dark = localStorage.getItem(KEY) !== "light";
  } catch {
    dark = true;
  }
  document.documentElement.classList.toggle("dark", dark);
}

export function setDark(next: boolean): void {
  dark = next;
  writeLocal(KEY, dark ? "dark" : "light");
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
    () => true,
  );
}
