import { useSyncExternalStore } from "react";
import { writeLocal } from "./browserStore";

/** Incrémenter la version oublie le mode privé déjà enregistré. */
export const PRIVATE_VERSION = 1;
export const PRIVATE_KEY = `ambux.routing.private.v${PRIVATE_VERSION}`;

/** Incrémenter la version redemande l'avertissement avant le prochain envoi. */
export const NOTICE_VERSION = 1;
export const NOTICE_KEY = `ambux.routing.notice.v${NOTICE_VERSION}`;

const EVENT = "ambux-routing-privacy";

export interface RoutingNotice {
  version: typeof NOTICE_VERSION;
  acceptedAt: string;
}

export type RoutingChoice = "send" | "private" | "dismiss";
export type RoutingNoticeOrigin = "auto" | "gesture";

let cachedPrivateRaw: string | null | undefined;
let cachedPrivate = false;
let cachedNoticeRaw: string | null | undefined;
let cachedNotice: RoutingNotice | null = null;

let hosts = 0;
let deferred = false;
let noticeOpen = false;
let inflight: Promise<RoutingChoice> | null = null;
let pendingResolve: ((choice: RoutingChoice) => void) | null = null;
let policyListener: (() => void) | null = null;

export function parsePrivateMode(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const value = JSON.parse(raw) as { version?: unknown; enabled?: unknown };
    return value.version === PRIVATE_VERSION && value.enabled === true;
  } catch {
    return false;
  }
}

export function parseRoutingNotice(raw: string | null): RoutingNotice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RoutingNotice>;
    if (value.version !== NOTICE_VERSION) return null;
    if (typeof value.acceptedAt !== "string" || !value.acceptedAt.trim()) return null;
    return { version: NOTICE_VERSION, acceptedAt: value.acceptedAt };
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readPrivateMode(): boolean {
  const raw = readRaw(PRIVATE_KEY);
  if (raw === cachedPrivateRaw) return cachedPrivate;
  cachedPrivateRaw = raw;
  cachedPrivate = parsePrivateMode(raw);
  return cachedPrivate;
}

export function readRoutingNotice(): RoutingNotice | null {
  const raw = readRaw(NOTICE_KEY);
  if (raw === cachedNoticeRaw) return cachedNotice;
  cachedNoticeRaw = raw;
  cachedNotice = parseRoutingNotice(raw);
  return cachedNotice;
}

export function setPrivateMode(enabled: boolean): boolean {
  if (!enabled) {
    try {
      if (typeof localStorage !== "undefined") localStorage.removeItem(PRIVATE_KEY);
    } catch {
      return false;
    }
    cachedPrivateRaw = null;
    cachedPrivate = false;
    publish();
    return true;
  }
  const raw = JSON.stringify({ version: PRIVATE_VERSION, enabled: true });
  if (!writeLocal(PRIVATE_KEY, raw)) return false;
  cachedPrivateRaw = raw;
  cachedPrivate = true;
  publish();
  return true;
}

export function grantRoutingNotice(at: Date = new Date()): boolean {
  const record: RoutingNotice = { version: NOTICE_VERSION, acceptedAt: at.toISOString() };
  const raw = JSON.stringify(record);
  if (!writeLocal(NOTICE_KEY, raw)) return false;
  cachedNoticeRaw = raw;
  cachedNotice = record;
  deferred = false;
  publish();
  return true;
}

export function revokeRoutingNotice(): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(NOTICE_KEY);
  } catch {
    /* la clé est déjà illisible */
  }
  cachedNoticeRaw = undefined;
  cachedNotice = null;
  deferred = false;
  publish();
}

/** Après l'effacement des clés Ambux : oublie la mémoire, sans réécrire le stockage. */
export function forgetRoutingPrivacy(): void {
  const resolve = pendingResolve;
  inflight = null;
  pendingResolve = null;
  noticeOpen = false;
  deferred = false;
  cachedPrivateRaw = undefined;
  cachedPrivate = false;
  cachedNoticeRaw = undefined;
  cachedNotice = null;
  publish();
  resolve?.("dismiss");
}

export function resetRoutingPrivacyForTests(): void {
  forgetRoutingPrivacy();
  hosts = 0;
}

export function setRoutingNoticeHost(mounted: boolean): void {
  hosts += mounted ? 1 : -1;
  if (hosts < 0) hosts = 0;
}

export function routingNoticeHostMounted(): boolean {
  return hosts > 0;
}

export function routingNoticeOpen(): boolean {
  return noticeOpen;
}

export function setRoutingPolicyListener(listener: (() => void) | null): void {
  policyListener = listener;
}

/**
 * Avant Photon, OSRM, son miroir ou OpenRouteService.
 * `auto` : routage de fond, une seule question par page si la personne ferme.
 * `gesture` : bouton Localiser ou enregistrement d'adresse, redemande si besoin.
 * Sans hôte d'interface, aucun envoi.
 */
export function requestRoutingNotice(origin: RoutingNoticeOrigin): Promise<RoutingChoice> {
  if (readPrivateMode()) return Promise.resolve("private");
  if (readRoutingNotice()) return Promise.resolve("send");
  if (origin === "gesture") deferred = false;
  if (origin === "auto" && deferred) return Promise.resolve("dismiss");
  if (inflight) return inflight;
  if (!routingNoticeHostMounted()) return Promise.resolve("dismiss");
  noticeOpen = true;
  inflight = new Promise((resolve) => {
    pendingResolve = resolve;
  });
  publish();
  return inflight;
}

export function settleRoutingNotice(choice: RoutingChoice): void {
  const resolve = pendingResolve;
  if (!resolve) return;
  inflight = null;
  pendingResolve = null;
  noticeOpen = false;
  if (choice === "send") {
    if (!grantRoutingNotice()) {
      deferred = true;
      publish();
      resolve("dismiss");
      return;
    }
  } else if (choice === "private") {
    if (!setPrivateMode(true)) {
      deferred = true;
      publish();
      resolve("dismiss");
      return;
    }
  } else {
    deferred = true;
  }
  publish();
  resolve(choice);
}

export function subscribeRoutingPrivacy(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key != null && event.key !== PRIVATE_KEY && event.key !== NOTICE_KEY) return;
    cachedPrivateRaw = undefined;
    cachedNoticeRaw = undefined;
    onChange();
  };
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function usePrivateMode(): boolean {
  return useSyncExternalStore(subscribeRoutingPrivacy, readPrivateMode, () => false);
}

export function useRoutingNotice(): RoutingNotice | null {
  return useSyncExternalStore(subscribeRoutingPrivacy, readRoutingNotice, () => null);
}

export function useRoutingNoticeOpen(): boolean {
  return useSyncExternalStore(subscribeRoutingPrivacy, routingNoticeOpen, () => false);
}

function publish(): void {
  policyListener?.();
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}
