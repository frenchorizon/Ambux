import { clearAmbuxKeys, writeLocal } from "../lib/browserStore";
import { geocodeAddress, type GeocodeContext } from "../lib/routing";
import type { Location } from "./types";

/** Profil du navigateur. Séparé des brouillons `ambux-drafts-v1`. */
export const WORKSPACE_KEY = "ambux-workspace-v1";

export const COMPANY_DEPOT_ID = "depot-societe";

/** Rayon autour du dépôt : un homonyme lointain est refusé, une région entière passe. */
export const ENTERPRISE_RADIUS_KM = 400;

const CHANGE_EVENT = "ambux-workspace-changed";

export interface DepotPoint {
  label: string;
  lat: number;
  lng: number;
}

export interface WorkspaceProfile {
  schema: 1;
  mode: "demo" | "entreprise";
  companyName: string;
  city: string;
  region: string;
  depot: DepotPoint | null;
  amplitudeMin: number;
}

export const DEMO_PROFILE: WorkspaceProfile = {
  schema: 1,
  mode: "demo",
  companyName: "",
  city: "Rouen",
  region: "",
  depot: null,
  amplitudeMin: 11 * 60,
};

export type GeocodeHit = { lat: number; lng: number; label: string };
export type Geocoder = (query: string) => Promise<GeocodeHit | null>;

let cachedRaw: string | null | undefined;
let cachedProfile: WorkspaceProfile | null = null;

export function clampAmplitude(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEMO_PROFILE.amplitudeMin;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return Math.min(14, Math.max(8, hours)) * 60;
}

export function subscribeWorkspace(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const notify = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(CHANGE_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

export function loadWorkspace(): WorkspaceProfile | null {
  const raw = readWorkspaceRaw();
  if (raw === cachedRaw) return cachedProfile;
  cachedRaw = raw;
  cachedProfile = parseWorkspace(raw);
  return cachedProfile;
}

function readWorkspaceRaw(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(WORKSPACE_KEY);
  } catch {
    return null;
  }
}

export function saveWorkspace(profile: WorkspaceProfile): boolean {
  const stored = profile.mode === "demo" ? { ...DEMO_PROFILE } : normalizeEnterprise(profile);
  const raw = JSON.stringify(stored);
  if (!writeLocal(WORKSPACE_KEY, raw)) return false;
  cachedRaw = raw;
  cachedProfile = stored;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

export function forgetWorkspaceCache(): void {
  cachedRaw = null;
  cachedProfile = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function eraseAmbuxBrowser(): string[] {
  const removed = clearAmbuxKeys();
  forgetWorkspaceCache();
  return removed;
}

export function workspaceFromUnknown(value: unknown): WorkspaceProfile | null {
  if (!value || typeof value !== "object") return null;
  try {
    return parseWorkspace(JSON.stringify(value));
  } catch {
    return null;
  }
}

export function workspaceCity(): string {
  const profile = loadWorkspace();
  if (profile?.mode === "entreprise") return profile.city;
  return "Rouen";
}

export function geocodeContext(): GeocodeContext {
  const profile = loadWorkspace();
  if (!profile || profile.mode !== "entreprise") return { rouengate: true };
  const bias = profile.depot ? { lat: profile.depot.lat, lng: profile.depot.lng } : undefined;
  return { rouengate: false, bias, radiusKm: bias ? ENTERPRISE_RADIUS_KM : undefined };
}

export function defaultGeocoder(query: string): Promise<GeocodeHit | null> {
  return geocodeAddress(query, geocodeContext());
}

/** Ville de la configuration, Rouen en démo ou tant qu'aucun mode n'est choisi. */
export function addressForGeocode(query: string): string {
  const profile = loadWorkspace();
  if (profile?.mode === "entreprise") return qualifyAddress(query, profile.city, profile.region);
  return qualifyAddress(query, "Rouen");
}

export function qualifyAddress(query: string, city: string, region = ""): string {
  let next = query.trim();
  const place = city.trim();
  const area = region.trim();
  if (place && !containsFolded(next, place)) next = `${next}, ${place}`;
  if (area && !containsFolded(next, area)) next = `${next}, ${area}`;
  return next;
}

export function depotFromProfile(profile: WorkspaceProfile): Location | null {
  if (profile.mode !== "entreprise" || !profile.depot) return null;
  const label = profile.depot.label.trim() || `Dépôt ${profile.companyName}`.trim();
  return {
    id: COMPANY_DEPOT_ID,
    name: label,
    short: "Dépôt",
    kind: "depot",
    lat: profile.depot.lat,
    lng: profile.depot.lng,
    city: profile.city,
  };
}

function normalizeEnterprise(profile: WorkspaceProfile): WorkspaceProfile {
  const depot = profile.depot;
  return {
    schema: 1,
    mode: "entreprise",
    companyName: profile.companyName.trim(),
    city: profile.city.trim(),
    region: profile.region.trim(),
    amplitudeMin: clampAmplitude(profile.amplitudeMin),
    depot: depot ? { label: depot.label.trim(), lat: depot.lat, lng: depot.lng } : null,
  };
}

function parseWorkspace(raw: string | null): WorkspaceProfile | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WorkspaceProfile>;
    if (value.schema !== 1) return null;
    if (value.mode === "demo") return { ...DEMO_PROFILE };
    if (value.mode !== "entreprise") return null;
    const companyName = typeof value.companyName === "string" ? value.companyName.trim() : "";
    const city = typeof value.city === "string" ? value.city.trim() : "";
    const region = typeof value.region === "string" ? value.region.trim() : "";
    const depot = parseDepot(value.depot);
    if (!companyName || !city || !region || !depot) return null;
    return {
      schema: 1,
      mode: "entreprise",
      companyName,
      city,
      region,
      depot,
      amplitudeMin: clampAmplitude(typeof value.amplitudeMin === "number" ? value.amplitudeMin : 11 * 60),
    };
  } catch {
    return null;
  }
}

function parseDepot(value: unknown): DepotPoint | null {
  if (!value || typeof value !== "object") return null;
  const depot = value as Partial<DepotPoint>;
  if (typeof depot.lat !== "number" || typeof depot.lng !== "number") return null;
  if (!Number.isFinite(depot.lat) || !Number.isFinite(depot.lng)) return null;
  if (depot.lat < -90 || depot.lat > 90 || depot.lng < -180 || depot.lng > 180) return null;
  return { label: typeof depot.label === "string" ? depot.label : "", lat: depot.lat, lng: depot.lng };
}

function containsFolded(query: string, fragment: string): boolean {
  return fold(query).includes(fold(fragment));
}

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}
