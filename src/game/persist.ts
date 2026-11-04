import { MISSION_DATE, MISSION_ISO } from "./types";
import type { GameState } from "./types";

const KEY = "ambux-drafts-v1";
const MAX_VERSIONS = 10;

export interface DraftSnapshot {
  schema: 1;
  version: number;
  savedAt: string;
  missionDate: string;
  missionIso?: string;
  seed: number;
  density: GameState["density"];
  ambCount: number;
  vslCount: number;
  locations: GameState["locations"];
  patients: GameState["patients"];
  crews: GameState["crews"];
  transports: GameState["transports"];
  blocks: GameState["blocks"];
  rules: GameState["rules"];
  vehicles: GameState["vehicles"];
  staff: GameState["staff"];
  tomorrowItems: GameState["tomorrowItems"];
  tomorrowTransports: GameState["tomorrowTransports"];
  stats: GameState["stats"];
  calls: GameState["calls"];
  lomaco: GameState["lomaco"];
  dayNote?: GameState["dayNote"];
}

export interface DraftSummary {
  version: number;
  savedAt: string;
  courses: number;
  missionDate: string;
}

function fingerprint(state: GameState): string {
  return JSON.stringify({
    t: state.transports.map((transport) => [
      transport.id,
      transport.crewId ?? "",
      transport.departMin ?? "",
      transport.appointmentMin ?? "",
      transport.cancelled,
      transport.pickupId,
      transport.dropoffId,
      transport.posture,
      transport.centerArriveMin ?? "",
      transport.stayMin ?? "",
      transport.pinned ? 1 : 0,
    ]),
    d: state.missionIso,
    c: state.crews.map((crew) => [
      crew.id,
      crew.shiftStart,
      crew.shiftEnd,
      crew.dea,
      crew.plate,
      crew.driverId ?? "",
      crew.mateId ?? "",
      crew.tag ?? "",
    ]),
    b: state.blocks.map((block) => [block.id, block.startMin, block.endMin, block.crewId]),
    r: state.rules,
    p: state.patients.map((patient) => [
      patient.id,
      patient.lastName,
      patient.firstName,
      patient.addressId,
      patient.mobility ?? "",
    ]),
    v: state.vehicles.map((vehicle) => [vehicle.id, vehicle.plate, vehicle.active]),
  });
}

function readAll(): DraftSnapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DraftSnapshot[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && item.schema === 1 && Array.isArray(item.transports));
  } catch {
    return [];
  }
}

function writeAll(drafts: DraftSnapshot[]): void {
  localStorage.setItem(KEY, JSON.stringify(drafts));
}

export function listDrafts(): DraftSummary[] {
  return readAll()
    .slice()
    .sort((a, b) => b.version - a.version)
    .map((draft) => ({
      version: draft.version,
      savedAt: draft.savedAt,
      courses: draft.transports.filter((transport) => !transport.cancelled).length,
      missionDate: draft.missionDate,
    }));
}

export function loadDraft(version: number): DraftSnapshot | null {
  return readAll().find((draft) => draft.version === version) ?? null;
}

export function saveDraft(state: GameState): number | null {
  if (state.phase === "briefing" || typeof localStorage === "undefined") return null;
  const drafts = readAll().sort((a, b) => a.version - b.version);
  const latest = drafts[drafts.length - 1];
  const finger = fingerprint(state);
  if (latest && fingerprint(snapshotToState(latest)) === finger) return latest.version;
  const version = (latest?.version ?? 0) + 1;
  const next: DraftSnapshot = {
    schema: 1,
    version,
    savedAt: new Date().toISOString(),
    missionDate: state.missionLabel || MISSION_DATE,
    missionIso: state.missionIso || MISSION_ISO,
    seed: state.seed,
    density: state.density,
    ambCount: state.ambCount,
    vslCount: state.vslCount,
    locations: state.locations,
    patients: state.patients,
    crews: state.crews,
    transports: state.transports,
    blocks: state.blocks,
    rules: state.rules,
    vehicles: state.vehicles,
    staff: state.staff,
    tomorrowItems: state.tomorrowItems,
    tomorrowTransports: state.tomorrowTransports,
    stats: state.stats,
    calls: state.calls,
    lomaco: state.lomaco,
    dayNote: state.dayNote,
  };
  const kept = [...drafts, next].slice(-MAX_VERSIONS);
  try {
    writeAll(kept);
  } catch {
    return null;
  }
  return version;
}

function snapshotToState(snapshot: DraftSnapshot): GameState {
  return snapshot as unknown as GameState;
}
