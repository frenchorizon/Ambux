import { useSyncExternalStore } from "react";

/**
 * Quota indicatif du localStorage, compté en UTF-16 comme les navigateurs.
 * Le plein réel est QuotaExceededError. IndexedDB n'est pas utilisé :
 * le brouillon tient dans ambux-drafts-v1, la sauvegarde complète est un fichier.
 */
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
export const STORAGE_NEAR_RATIO = 0.8;

export const STORAGE_FULL_MESSAGE =
  "Le stockage de ce navigateur est plein. Exportez une sauvegarde, ou effacez les données Ambux.";
export const STORAGE_NEAR_MESSAGE = "Le stockage de ce navigateur est presque plein. Exportez une sauvegarde.";
export const STORAGE_BLOCKED_MESSAGE = "Ce navigateur a refusé l'enregistrement local.";

const SKIP_KEY = "ambux.resume.skip";

export const storageLimits = {
  quotaBytes: STORAGE_QUOTA_BYTES,
  nearRatio: STORAGE_NEAR_RATIO,
};

export type StorageLevel = "ok" | "near" | "full" | "blocked";

export interface StorageNotice {
  level: StorageLevel;
  usedBytes: number;
  quotaBytes: number;
  message: string;
}

const OK_NOTICE: StorageNotice = {
  level: "ok",
  usedBytes: 0,
  quotaBytes: STORAGE_QUOTA_BYTES,
  message: "",
};

let current: StorageNotice = OK_NOTICE;
const listeners = new Set<() => void>();

export function storageNotice(): StorageNotice {
  return current;
}

export function subscribeStorage(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => listeners.delete(onStoreChange);
}

export function useStorageNotice(): StorageNotice {
  return useSyncExternalStore(subscribeStorage, storageNotice, () => OK_NOTICE);
}

export function isAmbuxKey(key: string): boolean {
  return key.startsWith("ambux-") || key.startsWith("ambux.");
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  const code = "code" in error ? Number(error.code) : Number.NaN;
  return code === 22 || code === 1014;
}

export function levelForUsage(
  usedBytes: number,
  quotaBytes = storageLimits.quotaBytes,
  nearRatio = storageLimits.nearRatio,
): StorageLevel {
  if (quotaBytes <= 0 || usedBytes >= quotaBytes) return "full";
  if (usedBytes >= quotaBytes * nearRatio) return "near";
  return "ok";
}

export function localStorageBytes(): number {
  try {
    if (typeof localStorage === "undefined") return 0;
    let chars = 0;
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key) continue;
      chars += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
    return chars * 2;
  } catch {
    return 0;
  }
}

export function refreshStorageLevel(): void {
  const usedBytes = localStorageBytes();
  const level = levelForUsage(usedBytes);
  publish({
    level,
    usedBytes,
    quotaBytes: storageLimits.quotaBytes,
    message: messageFor(level),
  });
}

export function noteStorageError(error: unknown): void {
  const quota = isQuotaError(error);
  publish({
    level: quota ? "full" : "blocked",
    usedBytes: localStorageBytes(),
    quotaBytes: storageLimits.quotaBytes,
    message: quota ? STORAGE_FULL_MESSAGE : STORAGE_BLOCKED_MESSAGE,
  });
}

export function writeLocal(key: string, value: string): boolean {
  try {
    if (typeof localStorage === "undefined") {
      noteStorageError(new Error("localStorage indisponible"));
      return false;
    }
    localStorage.setItem(key, value);
  } catch (error) {
    noteStorageError(error);
    return false;
  }
  refreshStorageLevel();
  return true;
}

export function clearAmbuxKeys(): string[] {
  const removed = [...dropMatching(localStorage)];
  if (typeof sessionStorage !== "undefined") removed.push(...dropMatching(sessionStorage));
  refreshStorageLevel();
  return removed;
}

export function resumePaused(): boolean {
  try {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

export function pauseResume(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(SKIP_KEY, "1");
  } catch {
    noteStorageError(new Error("sessionStorage indisponible"));
  }
}

export function allowResume(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.removeItem(SKIP_KEY);
  } catch {
    /* la reprise au prochain chargement reste active */
  }
}

function dropMatching(store: Storage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key && isAmbuxKey(key)) keys.push(key);
  }
  for (const key of keys) store.removeItem(key);
  return keys;
}

function messageFor(level: StorageLevel): string {
  if (level === "full") return STORAGE_FULL_MESSAGE;
  if (level === "near") return STORAGE_NEAR_MESSAGE;
  if (level === "blocked") return STORAGE_BLOCKED_MESSAGE;
  return "";
}

function publish(next: StorageNotice): void {
  if (
    current.level === next.level &&
    current.message === next.message &&
    current.usedBytes === next.usedBytes &&
    current.quotaBytes === next.quotaBytes
  ) {
    return;
  }
  current = next;
  for (const listener of listeners) listener();
}
