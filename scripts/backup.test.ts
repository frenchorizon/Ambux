import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import {
  BACKUP_SCHEMA_MESSAGE,
  BACKUP_STATE_MESSAGE,
  BACKUP_UNREADABLE,
  BACKUP_WORKSPACE_MESSAGE,
  backupFilename,
  backupWouldReplace,
  buildBackup,
  persistImported,
  readBackup,
  serializeBackup,
} from "../src/game/backup.ts";
import { loadDraft, saveDraft } from "../src/game/persist.ts";
import { resumeOnLoad } from "../src/game/resume.ts";
import { initialState } from "../src/game/reducer.ts";
import { DEFAULT_RULES } from "../src/game/types.ts";
import {
  DEMO_PROFILE,
  WORKSPACE_KEY,
  eraseAmbuxBrowser,
  forgetWorkspaceCache,
  loadWorkspace,
  saveWorkspace,
  type WorkspaceProfile,
} from "../src/game/workspace.ts";
import { loadRules } from "../src/lib/rulesStore.ts";
import {
  STORAGE_FULL_MESSAGE,
  STORAGE_NEAR_MESSAGE,
  STORAGE_QUOTA_BYTES,
  allowResume,
  isAmbuxKey,
  levelForUsage,
  pauseResume,
  refreshStorageLevel,
  storageLimits,
  storageNotice,
} from "../src/lib/browserStore.ts";

const memory = new Map<string, string>();
const session = new Map<string, string>();

function store(source: Map<string, string>) {
  return {
    getItem: (key: string) => source.get(key) ?? null,
    setItem: (key: string, value: string) => void source.set(key, value),
    removeItem: (key: string) => void source.delete(key),
    clear: () => source.clear(),
    key: (index: number) => [...source.keys()][index] ?? null,
    get length() {
      return source.size;
    },
  };
}

const storage = store(memory);
const sessionStorageMock = store(session);
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");

const lyon: WorkspaceProfile = {
  schema: 1,
  mode: "entreprise",
  companyName: "Ambulances Exemple",
  city: "Lyon",
  region: "Auvergne-Rhône-Alpes",
  amplitudeMin: 10 * 60,
  depot: { label: "place Bellecour", lat: 45.7578, lng: 4.832 },
};

beforeEach(() => {
  memory.clear();
  session.clear();
  storageLimits.quotaBytes = STORAGE_QUOTA_BYTES;
  storageLimits.nearRatio = 0.8;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: sessionStorageMock });
  forgetWorkspaceCache();
  refreshStorageLevel();
});

after(() => {
  storageLimits.quotaBytes = STORAGE_QUOTA_BYTES;
  storageLimits.nearRatio = 0.8;
  if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
  if (previousSession) Object.defineProperty(globalThis, "sessionStorage", previousSession);
  else Reflect.deleteProperty(globalThis, "sessionStorage");
});

function playing(missionIso: string) {
  return {
    ...initialState,
    phase: "playing" as const,
    missionIso,
    missionLabel: missionIso,
    rules: { ...DEFAULT_RULES, mealMin: 25 },
    patients: [
      {
        id: "p-exemple",
        firstName: "Noa",
        lastName: "EXEMPLE",
        phone: "0600000000",
        birthYear: 1980,
        addressId: "depot-societe",
        mobility: "assis" as const,
      },
    ],
  };
}

describe("reprise du brouillon", () => {
  it("reprend le brouillon du mode en cours et ignore l'autre", () => {
    saveWorkspace(DEMO_PROFILE);
    saveDraft(playing("2026-03-03"));
    saveWorkspace(lyon);
    saveDraft(playing("2026-04-04"));

    saveWorkspace(DEMO_PROFILE);
    const demo = resumeOnLoad(initialState);
    assert.equal(demo.phase, "playing");
    assert.equal(demo.missionIso, "2026-03-03");
    assert.equal(demo.patients[0]?.lastName, "EXEMPLE");

    saveWorkspace(lyon);
    const company = resumeOnLoad(initialState);
    assert.equal(company.missionIso, "2026-04-04");
    assert.equal(loadDraft(2)?.origin, "entreprise");
    assert.equal(loadDraft(1)?.origin, undefined);
    assert.equal(loadWorkspace()?.mode, "entreprise");
  });

  it("sans brouillon du mode, garde le comportement B1", () => {
    assert.equal(resumeOnLoad(initialState).phase, "briefing");

    saveWorkspace(DEMO_PROFILE);
    saveDraft(playing("2026-02-02"));
    saveWorkspace(lyon);
    const opened = resumeOnLoad(initialState);
    assert.equal(opened.phase, "playing");
    assert.equal(opened.view, "reglages");
    assert.equal(opened.locations[0]?.city, "Lyon");
    assert.equal(opened.transports.length, 0);
    assert.notEqual(opened.missionIso, "2026-02-02");
    assert.equal(localStorage.getItem("ambux-drafts-v1")?.includes("2026-02-02"), true);

    localStorage.removeItem(WORKSPACE_KEY);
    forgetWorkspaceCache();
    assert.equal(resumeOnLoad(initialState).phase, "briefing");
  });

  it("laisse l'accueil si le régulateur vient d'y retourner", () => {
    saveWorkspace(DEMO_PROFILE);
    saveDraft(playing("2026-05-05"));
    pauseResume();
    assert.equal(resumeOnLoad(initialState).phase, "briefing");
    allowResume();
    assert.equal(resumeOnLoad(initialState).missionIso, "2026-05-05");
  });
});

describe("sauvegarde .ambux.json", () => {
  it("fait l'aller-retour état, société et règles", () => {
    const sentinel = {
      schema: 1,
      version: 1,
      savedAt: "2026-10-01T00:00:00.000Z",
      missionDate: "SENTINELLE",
      missionIso: "2026-01-01",
      seed: 1,
      density: "normale",
      ambCount: 0,
      vslCount: 0,
      locations: [],
      patients: [],
      crews: [],
      transports: [],
      blocks: [],
      rules: {},
      vehicles: [],
      staff: [],
      tomorrowItems: [],
      tomorrowTransports: [],
      stats: {},
      calls: [],
      lomaco: [],
    };
    localStorage.setItem("ambux-drafts-v1", JSON.stringify([sentinel]));
    saveWorkspace(lyon);
    const backup = buildBackup(playing("2026-11-03"), "2026-11-06T08:00:00.000Z");
    assert.equal(backupFilename(backup), "ambux-2026-11-03.ambux.json");
    const read = readBackup(serializeBackup(backup));
    assert.equal(read.ok, true);
    if (!read.ok) return;
    assert.equal(read.backup.schema, 1);
    assert.equal(read.backup.kind, "ambux-backup");
    assert.equal(read.backup.workspace.city, "Lyon");
    assert.equal(read.backup.rules.mealMin, 25);
    assert.equal(read.backup.state.patients[0]?.lastName, "EXEMPLE");
    assert.equal(read.backup.state.live, false);

    memory.clear();
    forgetWorkspaceCache();
    localStorage.setItem("ambux-drafts-v1", JSON.stringify([sentinel]));
    assert.equal(persistImported(read.backup), null);
    assert.equal(loadWorkspace()?.companyName, "Ambulances Exemple");
    assert.equal(loadWorkspace()?.city, "Lyon");
    assert.equal(loadRules().mealMin, 25);
    const stored = JSON.parse(localStorage.getItem("ambux-drafts-v1") ?? "[]") as {
      schema: number;
      missionDate?: string;
      origin?: string;
      missionIso?: string;
    }[];
    assert.equal(
      stored.some((draft) => draft.missionDate === "SENTINELLE"),
      true,
    );
    assert.equal(
      stored.some((draft) => draft.schema === 1 && draft.origin === "entreprise" && draft.missionIso === "2026-11-03"),
      true,
    );
    assert.equal(localStorage.getItem(WORKSPACE_KEY)?.includes("ambux-drafts"), false);
    const resumed = resumeOnLoad(initialState);
    assert.equal(resumed.missionIso, "2026-11-03");
    assert.equal(resumed.patients[0]?.lastName, "EXEMPLE");
    assert.equal(resumed.rules.mealMin, 25);
  });

  it("explique un fichier refusé", () => {
    assert.equal(readBackup("{").ok, false);
    assert.equal(messageOf(readBackup("{")), BACKUP_UNREADABLE);
    assert.equal(messageOf(readBackup("[]")), BACKUP_UNREADABLE);
    assert.equal(messageOf(readBackup(JSON.stringify({ schema: 1, kind: "note" }))), BACKUP_UNREADABLE);
    assert.equal(messageOf(readBackup(JSON.stringify({ schema: 2, kind: "ambux-backup" }))), BACKUP_SCHEMA_MESSAGE);
    assert.equal(
      messageOf(readBackup(JSON.stringify({ schema: 1, kind: "ambux-backup", workspace: DEMO_PROFILE }))),
      BACKUP_STATE_MESSAGE,
    );
    assert.equal(
      messageOf(
        readBackup(
          JSON.stringify({
            schema: 1,
            kind: "ambux-backup",
            workspace: { schema: 1, mode: "entreprise", companyName: "X" },
            state: { transports: [], crews: [], patients: [], locations: [], blocks: [] },
          }),
        ),
      ),
      BACKUP_WORKSPACE_MESSAGE,
    );
  });

  it("demande un remplacement seulement s'il y a déjà du travail", () => {
    assert.equal(backupWouldReplace(initialState), false);
    saveWorkspace(DEMO_PROFILE);
    assert.equal(backupWouldReplace(initialState), true);
    localStorage.removeItem(WORKSPACE_KEY);
    forgetWorkspaceCache();
    localStorage.setItem(
      "ambux-drafts-v1",
      JSON.stringify([{ schema: 1, version: 1, transports: [], missionDate: "SENTINELLE" }]),
    );
    assert.equal(backupWouldReplace(initialState), true);
  });
});

describe("quota et effacement", () => {
  it("signale un stockage plein ou presque plein", () => {
    assert.equal(levelForUsage(79, 100, 0.8), "ok");
    assert.equal(levelForUsage(80, 100, 0.8), "near");
    assert.equal(levelForUsage(100, 100, 0.8), "full");

    storageLimits.quotaBytes = 1000;
    localStorage.setItem("ambux.theme", "x".repeat(420));
    refreshStorageLevel();
    assert.equal(storageNotice().level, "near");
    assert.equal(storageNotice().message, STORAGE_NEAR_MESSAGE);

    const quota = {
      ...storage,
      setItem() {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      },
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: quota });
    assert.equal(saveDraft(playing("2026-06-06")), null);
    assert.equal(storageNotice().level, "full");
    assert.equal(storageNotice().message, STORAGE_FULL_MESSAGE);
  });

  it("retire les clés Ambux et laisse le reste", () => {
    localStorage.setItem("ambux-drafts-v1", "[]");
    localStorage.setItem("ambux.rules", "{}");
    localStorage.setItem(WORKSPACE_KEY, "{}");
    localStorage.setItem("hors-ambux", "reste");
    localStorage.setItem("ambulance-parc", "non");
    sessionStorage.setItem("ambux.tour", "1");
    sessionStorage.setItem("autre", "oui");
    saveWorkspace(lyon);
    const removed = eraseAmbuxBrowser();
    assert.equal(localStorage.getItem("hors-ambux"), "reste");
    assert.equal(localStorage.getItem("ambulance-parc"), "non");
    assert.equal(localStorage.getItem("ambux-drafts-v1"), null);
    assert.equal(localStorage.getItem("ambux.rules"), null);
    assert.equal(localStorage.getItem(WORKSPACE_KEY), null);
    assert.equal(sessionStorage.getItem("ambux.tour"), null);
    assert.equal(sessionStorage.getItem("autre"), "oui");
    assert.equal(loadWorkspace(), null);
    assert.equal(removed.includes("ambux-drafts-v1"), true);
    assert.equal(removed.includes("hors-ambux"), false);
    assert.equal(isAmbuxKey("ambux.rules"), true);
    assert.equal(isAmbuxKey("ambux-drafts-v1"), true);
    assert.equal(isAmbuxKey("ambulance-parc"), false);
  });
});

function messageOf(result: { ok: true } | { ok: false; message: string }): string {
  return result.ok ? "" : result.message;
}
