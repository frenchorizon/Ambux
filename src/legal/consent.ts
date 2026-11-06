import { useSyncExternalStore } from "react";
import { writeLocal } from "../lib/browserStore";

/** Incrémenter la version invalide les consentements déjà enregistrés. */
export const CONSENT_VERSION = 1;
export const CONSENT_KEY = `ambux.consent.v${CONSENT_VERSION}`;

const CONSENT_EVENT = "ambux-consent-changed";

export interface ImportConsent {
  version: typeof CONSENT_VERSION;
  acceptedAt: string;
}

let cachedRaw: string | null | undefined;
let cached: ImportConsent | null = null;

export function parseImportConsent(raw: string | null): ImportConsent | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ImportConsent>;
    if (value.version !== CONSENT_VERSION) return null;
    if (typeof value.acceptedAt !== "string" || !value.acceptedAt.trim()) return null;
    return { version: CONSENT_VERSION, acceptedAt: value.acceptedAt };
  } catch {
    return null;
  }
}

export function readImportConsent(): ImportConsent | null {
  let raw: string | null;
  try {
    if (typeof localStorage === "undefined") return null;
    raw = localStorage.getItem(CONSENT_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  cached = parseImportConsent(raw);
  return cached;
}

export function importRequiresConsent(
  mode: "demo" | "entreprise" | null | undefined,
  consent: ImportConsent | null,
): boolean {
  return mode === "entreprise" && consent == null;
}

export function grantImportConsent(at: Date = new Date()): boolean {
  const record: ImportConsent = { version: CONSENT_VERSION, acceptedAt: at.toISOString() };
  const raw = JSON.stringify(record);
  if (!writeLocal(CONSENT_KEY, raw)) return false;
  cachedRaw = raw;
  cached = record;
  publish();
  return true;
}

export function revokeImportConsent(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(CONSENT_KEY);
  } catch {
    /* la clé est déjà illisible */
  }
  cachedRaw = undefined;
  cached = null;
  publish();
}

export function resetImportConsentCache(): void {
  cachedRaw = undefined;
  cached = null;
}

export function subscribeImportConsent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key != null && event.key !== CONSENT_KEY) return;
    cachedRaw = undefined;
    onChange();
  };
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useImportConsent(): ImportConsent | null {
  return useSyncExternalStore(subscribeImportConsent, readImportConsent, () => null);
}

function publish(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_EVENT));
}
