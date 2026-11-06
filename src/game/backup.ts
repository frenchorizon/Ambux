import { storageNotice } from "../lib/browserStore";
import { parseRules, saveRules } from "../lib/rulesStore";
import { listDrafts, saveDraft } from "./persist";
import type { GameState, Phase, Speed, ViewId } from "./types";
import { initialState } from "./reducer";
import {
  forgetWorkspaceCache,
  loadWorkspace,
  saveWorkspace,
  workspaceFromUnknown,
  DEMO_PROFILE,
  type WorkspaceProfile,
} from "./workspace";

export const BACKUP_SCHEMA = 1;
export const BACKUP_KIND = "ambux-backup";

export const BACKUP_UNREADABLE = "Ce fichier n'est pas une sauvegarde Ambux (.ambux.json).";
export const BACKUP_SCHEMA_MESSAGE = "Cette sauvegarde vient d'une version plus récente. Ambux ne peut pas l'ouvrir.";
export const BACKUP_STATE_MESSAGE = "Sauvegarde incomplète : le planning est absent ou illisible.";
export const BACKUP_WORKSPACE_MESSAGE =
  "Sauvegarde incomplète : la configuration de la société est absente ou illisible.";
export const BACKUP_QUOTA_MESSAGE =
  "Le stockage de ce navigateur est plein. Rien n'a été remplacé. Exportez d'abord une sauvegarde.";

const PHASES = new Set<Phase>(["briefing", "playing", "review", "report"]);
const VIEWS = new Set<ViewId>([
  "gantt",
  "carte",
  "file",
  "synthese",
  "reglages",
  "tomorrow",
  "crews",
  "vehicles",
  "patients",
  "companies",
  "lomaco",
  "feuille",
]);

export interface AmbuxBackup {
  schema: 1;
  kind: typeof BACKUP_KIND;
  exportedAt: string;
  workspace: WorkspaceProfile;
  rules: GameState["rules"];
  state: GameState;
}

export type BackupRead = { ok: true; backup: AmbuxBackup } | { ok: false; message: string };

export function buildBackup(state: GameState, exportedAt = new Date().toISOString()): AmbuxBackup {
  const rules = parseRules(state.rules);
  return {
    schema: BACKUP_SCHEMA,
    kind: BACKUP_KIND,
    exportedAt,
    workspace: loadWorkspace() ?? { ...DEMO_PROFILE },
    rules,
    state: { ...state, rules, toast: null, modal: null, live: false, paused: true },
  };
}

export function serializeBackup(backup: AmbuxBackup): string {
  return JSON.stringify(backup);
}

export function backupFilename(backup: AmbuxBackup): string {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(backup.state.missionIso) ? backup.state.missionIso : "sauvegarde";
  return `ambux-${iso}.ambux.json`;
}

export function readBackup(raw: string): BackupRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, "").trim());
  } catch {
    return { ok: false, message: BACKUP_UNREADABLE };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, message: BACKUP_UNREADABLE };
  const record = parsed as Record<string, unknown>;
  if (record.kind !== BACKUP_KIND) return { ok: false, message: BACKUP_UNREADABLE };
  if (record.schema !== BACKUP_SCHEMA) return { ok: false, message: BACKUP_SCHEMA_MESSAGE };
  const workspace = workspaceFromUnknown(record.workspace);
  if (!workspace) return { ok: false, message: BACKUP_WORKSPACE_MESSAGE };
  const stateRules =
    record.state && typeof record.state === "object" ? (record.state as { rules?: unknown }).rules : undefined;
  const rules = parseRules(record.rules !== undefined ? record.rules : stateRules);
  const state = backupState(record.state, rules);
  if (!state) return { ok: false, message: BACKUP_STATE_MESSAGE };
  return {
    ok: true,
    backup: {
      schema: BACKUP_SCHEMA,
      kind: BACKUP_KIND,
      exportedAt: typeof record.exportedAt === "string" ? record.exportedAt : "",
      workspace,
      rules,
      state,
    },
  };
}

export function backupWouldReplace(state: GameState): boolean {
  if (state.phase !== "briefing") return true;
  if (loadWorkspace()) return true;
  return listDrafts().length > 0;
}

/** Écrit la société, les règles et un brouillon. En cas d'échec, la société précédente est remise. */
export function persistImported(backup: AmbuxBackup): string | null {
  const previous = loadWorkspace();
  if (!saveWorkspace(backup.workspace)) return noticeOrQuota();
  const saved = backup.state.phase === "briefing" ? true : saveDraft(backup.state) != null;
  const rulesOk = saveRules(backup.rules);
  if (!saved || !rulesOk) {
    restoreWorkspace(previous);
    return noticeOrQuota();
  }
  return null;
}

export function downloadBackup(backup: AmbuxBackup): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = backupFilename(backup);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function restoreWorkspace(previous: WorkspaceProfile | null): void {
  if (previous) {
    saveWorkspace(previous);
    return;
  }
  try {
    localStorage.removeItem("ambux-workspace-v1");
  } catch {
    /* la remise en place a déjà échoué */
  }
  forgetWorkspaceCache();
}

function noticeOrQuota(): string {
  return storageNotice().message || BACKUP_QUOTA_MESSAGE;
}

function backupState(value: unknown, rules: GameState["rules"]): GameState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Partial<GameState>;
  const transports = asArray<GameState["transports"][number]>(raw.transports);
  const crews = asArray<GameState["crews"][number]>(raw.crews);
  const patients = asArray<GameState["patients"][number]>(raw.patients);
  const locations = asArray<GameState["locations"][number]>(raw.locations);
  const blocks = asArray<GameState["blocks"][number]>(raw.blocks);
  if (!transports || !crews || !patients || !locations || !blocks) return null;
  const phase = isPhase(raw.phase) ? raw.phase : "playing";
  const view = isView(raw.view) ? raw.view : "gantt";
  const density = raw.density === "normale" || raw.density === "chargee" ? raw.density : initialState.density;
  const speed: Speed = raw.speed === 2 || raw.speed === 4 ? raw.speed : 1;
  return {
    ...initialState,
    ...raw,
    phase,
    view,
    modal: null,
    density,
    speed,
    live: false,
    paused: true,
    followNow: false,
    toast: null,
    rules,
    transports,
    crews,
    patients,
    locations,
    blocks,
    calls: asArray(raw.calls) ?? [],
    lomaco: asArray(raw.lomaco) ?? [],
    tomorrowItems: asArray(raw.tomorrowItems) ?? [],
    tomorrowTransports: asArray(raw.tomorrowTransports) ?? [],
    vehicles: asArray(raw.vehicles) ?? [],
    staff: asArray(raw.staff) ?? [],
    stats: { ...initialState.stats, ...(raw.stats && typeof raw.stats === "object" ? raw.stats : {}) },
    missionIso:
      typeof raw.missionIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.missionIso)
        ? raw.missionIso
        : initialState.missionIso,
    missionLabel:
      typeof raw.missionLabel === "string" && raw.missionLabel.trim() ? raw.missionLabel : initialState.missionLabel,
    seed: finite(raw.seed, initialState.seed),
    ambCount: finite(raw.ambCount, initialState.ambCount),
    vslCount: finite(raw.vslCount, initialState.vslCount),
    nowMin: finite(raw.nowMin, initialState.nowMin),
    regulationMs: finite(raw.regulationMs, 0),
    tomorrowStops: Array.isArray(raw.tomorrowStops) ? raw.tomorrowStops : null,
    selectedId: typeof raw.selectedId === "string" ? raw.selectedId : undefined,
    crewFilter: typeof raw.crewFilter === "string" ? raw.crewFilter : undefined,
  };
}

function asArray<T>(value: unknown): T[] | null {
  return Array.isArray(value) ? (value as T[]) : null;
}

function isPhase(value: unknown): value is Phase {
  return typeof value === "string" && PHASES.has(value as Phase);
}

function isView(value: unknown): value is ViewId {
  return typeof value === "string" && VIEWS.has(value as ViewId);
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
