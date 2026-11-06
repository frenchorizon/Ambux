import { useSyncExternalStore } from "react";
import { minutesForKm, roadKm, type LatLng } from "./geo";
import {
  readPrivateMode,
  readRoutingNotice,
  requestRoutingNotice,
  setRoutingPolicyListener,
  type RoutingNoticeOrigin,
} from "./routingPrivacy";

/**
 * Réseau des adresses. Le mode privé (`ambux.routing.private.v1`) coupe Photon,
 * OSRM, le miroir et OpenRouteService. `ambux.routing.notice.v1` mémorise
 * l'avertissement avant le premier envoi. `ambux.routing=estimate` coupe le
 * routage sans couper Photon. `ambux.ors` est une clé facultative, dans ce
 * navigateur seulement. `ambux.tiles` est un modèle de tuiles (voir tiles.ts).
 */
export const ROUTING_TIMEOUT_MS = 8_000;
export const ROUTING_ATTEMPTS = 3;
export const routingNet = { timeoutMs: ROUTING_TIMEOUT_MS, attempts: ROUTING_ATTEMPTS };

export interface Travel {
  km: number;
  min: number;
  source: "osrm" | "ors" | "estimate";
  /** Vrai tant que la durée routière de ce tronçon n'est pas encore en cache. */
  pending?: boolean;
}

const travelById = new Map<string, Travel>();
const pathByCoord = new Map<string, { line: LatLng[]; source: "osrm" | "estimate" }>();
const pending = new Set<string>();
let version = 0;
let matrixState: "idle" | "loading" | "osrm" | "estimate" = "idle";
let sessionEstimate = false;
let choiceEstimate = false;
let appliedPrivate = false;
const listeners = new Set<() => void>();

const OSRM = "https://router.project-osrm.org";
const OSRM_DE = "https://routing.openstreetmap.de/routed-car";
const ORS = "https://api.openrouteservice.org/v2/directions/driving-car";

function bump(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function routingVersion(): number {
  return version;
}

export function matrixSource(): "idle" | "loading" | "osrm" | "estimate" {
  return matrixState;
}

export function useRoutingVersion(): number {
  return useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    () => version,
    () => version,
  );
}

function idKey(fromId: string, toId: string): string {
  return `${fromId}>${toId}`;
}

function coordKey(a: LatLng, b: LatLng): string {
  return `${a.lat.toFixed(4)},${a.lng.toFixed(4)}>${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
}

export function rememberTravel(fromId: string, toId: string, travel: Travel): void {
  travelById.set(idKey(fromId, toId), {
    km: travel.km,
    min: travel.min,
    source: travel.source,
  });
}

export function travelBetween(fromId: string, toId: string, from: LatLng, to: LatLng): Travel {
  if (fromId === toId) return { km: 0, min: 0, source: "osrm" };
  const known = travelById.get(idKey(fromId, toId));
  if (known) return known;
  const estimate = estimateTravel(from, to);
  if (routingForcedEstimate() || typeof window === "undefined") return estimate;
  return { ...estimate, pending: true };
}

function estimateTravel(from: LatLng, to: LatLng): Travel {
  const km = roadKm(from, to);
  return { km, min: minutesForKm(km), source: "estimate" };
}

export function pathBetween(from: LatLng, to: LatLng): { line: LatLng[]; source: "osrm" | "estimate" } {
  const known = pathByCoord.get(coordKey(from, to));
  if (known && known.line.length > 1) return known;
  return { line: estimatePath(from, to), source: "estimate" };
}

export function pointAlong(line: readonly LatLng[], t: number): LatLng {
  if (!line.length) return { lat: 49.44, lng: 1.09 };
  if (line.length === 1 || t <= 0) return line[0]!;
  if (t >= 1) return line[line.length - 1]!;
  const steps: number[] = [];
  let total = 0;
  for (let index = 1; index < line.length; index++) {
    const km = roadKm(line[index - 1]!, line[index]!);
    steps.push(km);
    total += km;
  }
  if (total <= 0.0001) return line[0]!;
  let remain = total * t;
  for (let index = 1; index < line.length; index++) {
    const span = steps[index - 1]!;
    if (remain <= span || index === line.length - 1) {
      const ratio = span <= 0 ? 0 : Math.min(1, remain / span);
      const prev = line[index - 1]!;
      const next = line[index]!;
      return {
        lat: prev.lat + (next.lat - prev.lat) * ratio,
        lng: prev.lng + (next.lng - prev.lng) * ratio,
      };
    }
    remain -= span;
  }
  return line[line.length - 1]!;
}

function routingStorageEstimate(): boolean {
  try {
    return localStorage.getItem("ambux.routing") === "estimate";
  } catch {
    return false;
  }
}

/** Estimation locale : clé de test, mode privé, ou repli après échec réseau. */
export function routingForcedEstimate(): boolean {
  return sessionEstimate || appliedPrivate || readPrivateMode() || routingStorageEstimate();
}

export function resetRoutingCaches(): void {
  travelById.clear();
  pathByCoord.clear();
  pending.clear();
  legQueue.length = 0;
  legPending.clear();
  queue.length = 0;
  sessionEstimate = false;
  choiceEstimate = false;
  appliedPrivate = readPrivateMode();
  matrixState = appliedPrivate || routingStorageEstimate() ? "estimate" : "idle";
  version = 0;
}

function markEstimate(): void {
  sessionEstimate = true;
  matrixState = "estimate";
  bump();
}

async function allowNetwork(origin: RoutingNoticeOrigin): Promise<boolean> {
  if (readPrivateMode()) return false;
  const choice = await requestRoutingNotice(origin);
  return choice === "send";
}

export async function warmMatrix(locations: readonly { id: string; lat: number; lng: number }[]): Promise<boolean> {
  if (locations.length < 2) return false;
  if (routingStorageEstimate() || readPrivateMode() || sessionEstimate) {
    matrixState = "estimate";
    bump();
    return false;
  }
  if (!(await allowNetwork("auto"))) {
    markEstimate();
    return false;
  }
  matrixState = "loading";
  bump();
  const usable = locations.slice(0, 90);
  const coords = usable.map((location) => `${location.lng},${location.lat}`).join(";");
  try {
    const response = await fetchLimited(`${OSRM}/table/v1/driving/${coords}?annotations=duration,distance`);
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as {
      code?: string;
      durations?: (number | null)[][];
      distances?: (number | null)[][];
    };
    if (data.code !== "Ok" || !data.durations || !data.distances) throw new Error(data.code ?? "osrm");
    for (let from = 0; from < usable.length; from++) {
      for (let to = 0; to < usable.length; to++) {
        if (from === to) continue;
        const seconds = data.durations[from]?.[to];
        const meters = data.distances[from]?.[to];
        if (seconds == null || meters == null) continue;
        travelById.set(idKey(usable[from]!.id, usable[to]!.id), {
          km: Math.max(0.2, meters / 1000),
          min: Math.max(2, Math.round(seconds / 60)),
          source: "osrm",
        });
      }
    }
    matrixState = "osrm";
    bump();
    return true;
  } catch {
    markEstimate();
    return false;
  }
}

interface LegPair {
  fromId: string;
  toId: string;
  from: LatLng;
  to: LatLng;
}

const legQueue: LegPair[] = [];
const legPending = new Set<string>();
let legWorkers = 0;

export function warmLegs(pairs: readonly LegPair[]): void {
  if (typeof window === "undefined" || routingForcedEstimate()) return;
  for (const pair of pairs) {
    if (pair.fromId === pair.toId) continue;
    const key = idKey(pair.fromId, pair.toId);
    if (travelById.has(key) || legPending.has(key)) continue;
    legPending.add(key);
    legQueue.push(pair);
  }
  void pumpLegs();
}

async function pumpLegs(): Promise<void> {
  while (legWorkers < 2 && legQueue.length) {
    const next = legQueue.shift();
    if (!next) return;
    legWorkers += 1;
    void fetchLeg(next).finally(() => {
      legWorkers -= 1;
      void pumpLegs();
    });
  }
}

async function fetchLeg(pair: LegPair): Promise<void> {
  const key = idKey(pair.fromId, pair.toId);
  const blocked = routingForcedEstimate();
  if (blocked || !(await allowNetwork("auto"))) {
    travelById.set(key, estimateTravel(pair.from, pair.to));
    if (!blocked) choiceEstimate = true;
    sessionEstimate = true;
    if (matrixState !== "osrm") matrixState = "estimate";
    legPending.delete(key);
    bump();
    return;
  }
  try {
    const osrm = await osrmLeg(OSRM, pair.from, pair.to);
    if (osrm) {
      travelById.set(key, { ...osrm, source: "osrm" });
      if (matrixState !== "estimate") matrixState = "osrm";
      return;
    }
    const ors = await orsLeg(pair.from, pair.to);
    if (ors) {
      travelById.set(key, { ...ors, source: "ors" });
      if (matrixState !== "estimate") matrixState = "osrm";
      return;
    }
    const mirror = await osrmLeg(OSRM_DE, pair.from, pair.to);
    if (mirror) {
      travelById.set(key, { ...mirror, source: "osrm" });
      if (matrixState !== "estimate") matrixState = "osrm";
      return;
    }
    travelById.set(key, estimateTravel(pair.from, pair.to));
    sessionEstimate = true;
    matrixState = "estimate";
  } finally {
    legPending.delete(key);
    bump();
  }
}

async function osrmLeg(base: string, from: LatLng, to: LatLng): Promise<{ km: number; min: number } | null> {
  try {
    const response = await fetchLimited(
      `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`,
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      code?: string;
      routes?: { duration?: number; distance?: number }[];
    };
    const route = data.routes?.[0];
    if (data.code !== "Ok" || route?.duration == null || route.distance == null) return null;
    return { km: Math.max(0.2, route.distance / 1000), min: Math.max(1, Math.round(route.duration / 60)) };
  } catch {
    return null;
  }
}

function orsKey(): string {
  try {
    return localStorage.getItem("ambux.ors") ?? "";
  } catch {
    return "";
  }
}

async function orsLeg(from: LatLng, to: LatLng): Promise<{ km: number; min: number } | null> {
  const key = orsKey();
  if (!key) return null;
  try {
    const response = await fetchLimited(ORS, {
      method: "POST",
      headers: {
        Authorization: key,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        coordinates: [
          [from.lng, from.lat],
          [to.lng, to.lat],
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      routes?: { summary?: { duration?: number; distance?: number } }[];
    };
    const summary = data.routes?.[0]?.summary;
    if (summary?.duration == null || summary.distance == null) return null;
    return { km: Math.max(0.2, summary.distance / 1000), min: Math.max(1, Math.round(summary.duration / 60)) };
  } catch {
    return null;
  }
}

const queue: { from: LatLng; to: LatLng }[] = [];
let workers = 0;

export function warmPaths(pairs: readonly { from: LatLng; to: LatLng }[]): void {
  for (const pair of pairs) {
    const key = coordKey(pair.from, pair.to);
    if (pathByCoord.has(key) || pending.has(key)) continue;
    if (roadKm(pair.from, pair.to) < 0.05) continue;
    pending.add(key);
    queue.push(pair);
  }
  void pump();
}

async function pump(): Promise<void> {
  while (workers < 3 && queue.length) {
    const next = queue.shift();
    if (!next) return;
    workers += 1;
    void fetchPath(next.from, next.to).finally(() => {
      workers -= 1;
      void pump();
    });
  }
}

async function fetchPath(from: LatLng, to: LatLng): Promise<void> {
  const key = coordKey(from, to);
  const blocked = routingForcedEstimate();
  if (blocked || !(await allowNetwork("auto"))) {
    pathByCoord.set(key, { line: estimatePath(from, to), source: "estimate" });
    if (!blocked) {
      choiceEstimate = true;
      sessionEstimate = true;
    }
    if (matrixState !== "osrm") matrixState = "estimate";
    pending.delete(key);
    queueMicrotask(bump);
    return;
  }
  try {
    const response = await fetchLimited(
      `${OSRM}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`,
    );
    if (!response.ok) throw new Error(String(response.status));
    const data = (await response.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const coordinates = data.routes?.[0]?.geometry?.coordinates;
    if (data.code !== "Ok" || !coordinates?.length) throw new Error("route");
    pathByCoord.set(key, {
      line: coordinates.map(([lng, lat]) => ({ lat, lng })),
      source: "osrm",
    });
    bump();
  } catch {
    pathByCoord.set(key, { line: estimatePath(from, to), source: "estimate" });
    if (matrixState !== "osrm") {
      sessionEstimate = true;
      matrixState = "estimate";
    }
    bump();
  } finally {
    pending.delete(key);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchLimited(url: string, init?: RequestInit, attempts = routingNet.attempts): Promise<Response> {
  let last = "réseau";
  const tries = Math.max(1, attempts);
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt > 0) await sleep(400 * 2 ** (attempt - 1) + Math.floor(Math.random() * 180));
    const timeout = startTimeout(routingNet.timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: timeout.signal });
      timeout.clear();
      if (response.status === 429 || response.status >= 500) {
        last = String(response.status);
        continue;
      }
      return response;
    } catch (error) {
      timeout.clear();
      last = isTimeout(error) ? "délai" : "réseau";
    }
  }
  throw new Error(last);
}

function startTimeout(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(timeoutError());
  }, ms);
  const clear = () => clearTimeout(timer);
  controller.signal.addEventListener("abort", clear, { once: true });
  return { signal: controller.signal, clear };
}

function timeoutError(): Error {
  const error = new Error("Délai dépassé");
  error.name = "TimeoutError";
  return error;
}

function isTimeout(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}

function estimatePath(from: LatLng, to: LatLng): LatLng[] {
  const mid = {
    lat: (from.lat + to.lat) / 2 + (to.lng - from.lng) * 0.18,
    lng: (from.lng + to.lng) / 2 - (to.lat - from.lat) * 0.18,
  };
  const line: LatLng[] = [];
  for (let step = 0; step <= 8; step++) {
    const t = step / 8;
    const u = 1 - t;
    line.push({
      lat: u * u * from.lat + 2 * u * t * mid.lat + t * t * to.lat,
      lng: u * u * from.lng + 2 * u * t * mid.lng + t * t * to.lng,
    });
  }
  return line;
}

export interface GeocodeContext {
  /** false : ne pas appliquer le filtre historique de la métropole de Rouen. */
  rouengate?: boolean;
  bias?: LatLng;
  radiusKm?: number;
}

/** URL Photon. Sans contexte entreprise, la requête reste celle de la démo Rouen. */
export function geocodePhotonUrl(query: string, context?: GeocodeContext): string {
  if (context?.rouengate !== false) {
    return `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lat=49.44&lon=1.09`;
  }
  const bias = context.bias ? `&lat=${context.bias.lat}&lon=${context.bias.lng}` : "";
  return `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1${bias}&lang=fr`;
}

/** true si le point peut servir. La démo reste bornée à la métropole de Rouen. */
export function geocodeAccepts(lat: number, lng: number, context?: GeocodeContext): boolean {
  if (context?.rouengate !== false) return lat >= 49.1 && lat <= 49.7 && lng >= 0.7 && lng <= 1.4;
  if (context.radiusKm != null && context.bias) return haversineKm(context.bias, { lat, lng }) <= context.radiusKm;
  return true;
}

export async function geocodeAddress(
  query: string,
  context?: GeocodeContext,
): Promise<{ lat: number; lng: number; label: string } | null> {
  if (readPrivateMode()) return null;
  if (!(await allowNetwork("gesture"))) return null;
  try {
    const response = await fetchLimited(geocodePhotonUrl(query, context), undefined, 2);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string; street?: string; city?: string; postcode?: string };
      }[];
    };
    const feature = data.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!coordinates) return null;
    const props = feature.properties ?? {};
    const label = [props.name, props.street, props.postcode, props.city].filter(Boolean).join(", ");
    const lat = coordinates[1];
    const lng = coordinates[0];
    if (!geocodeAccepts(lat, lng, context)) return null;
    return { lat, lng, label: label || query };
  } catch {
    return null;
  }
}

setRoutingPolicyListener(() => {
  const privateMode = readPrivateMode();
  if (privateMode !== appliedPrivate) {
    if (privateMode) {
      sessionEstimate = true;
      matrixState = "estimate";
    } else {
      choiceEstimate = false;
      sessionEstimate = false;
      if (matrixState === "estimate") matrixState = "idle";
    }
    appliedPrivate = privateMode;
    bump();
    return;
  }
  if (choiceEstimate && readRoutingNotice() && !privateMode) {
    choiceEstimate = false;
    sessionEstimate = false;
    if (matrixState === "estimate") matrixState = "idle";
    bump();
  }
});

function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
