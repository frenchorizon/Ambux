import { useSyncExternalStore } from "react";

/** Modèle d'URL de tuiles, clé `ambux.tiles`. https uniquement, avec {z} {x} {y}. */
export function parseTileTemplate(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (!trimmed.startsWith("https://")) return null;
  if (trimmed.length > 300) return null;
  if (!trimmed.includes("{z}") || !trimmed.includes("{x}") || !trimmed.includes("{y}")) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}

export function readTileTemplate(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return parseTileTemplate(localStorage.getItem("ambux.tiles"));
  } catch {
    return null;
  }
}

let providerIndex = 0;
const tileListeners = new Set<() => void>();

function publishTiles(): void {
  for (const listener of tileListeners) listener();
}

export function noteTileProvider(index: number): void {
  if (index === providerIndex) return;
  providerIndex = index;
  publishTiles();
}

function subscribeTiles(onChange: () => void): () => void {
  tileListeners.add(onChange);
  return () => tileListeners.delete(onChange);
}

export function useTileProvider(): number {
  return useSyncExternalStore(
    subscribeTiles,
    () => providerIndex,
    () => 0,
  );
}
