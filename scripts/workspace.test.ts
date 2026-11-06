import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { LOMACO_IMPORT_PROFILE, mapSheet, previewLomaco } from "../src/game/lomaco.ts";
import { previewCsv } from "../src/game/csv.ts";
import { loadDraft, saveDraft } from "../src/game/persist.ts";
import { initialState, reducer } from "../src/game/reducer.ts";
import { DEFAULT_RULES } from "../src/game/types.ts";
import { geocodeAccepts, geocodePhotonUrl } from "../src/lib/routing.ts";
import {
  DEMO_PROFILE,
  WORKSPACE_KEY,
  addressForGeocode,
  depotFromProfile,
  loadWorkspace,
  qualifyAddress,
  saveWorkspace,
  workspaceCity,
  type WorkspaceProfile,
} from "../src/game/workspace.ts";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, value),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

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
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
});

after(() => {
  if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("ville configurable", () => {
  it("ajoute la ville, et la région en mode entreprise", () => {
    assert.equal(qualifyAddress("12 rue de la République", "Rouen"), "12 rue de la République, Rouen");
    assert.equal(qualifyAddress("12 rue de la République, Rouen", "Rouen"), "12 rue de la République, Rouen");
    assert.equal(qualifyAddress("12 rue Test, Évreux", "Evreux"), "12 rue Test, Évreux");
    assert.equal(
      qualifyAddress("12 rue de la République", "Lyon", "Auvergne-Rhône-Alpes"),
      "12 rue de la République, Lyon, Auvergne-Rhône-Alpes",
    );
    assert.equal(addressForGeocode("12 rue de la République"), "12 rue de la République, Rouen");
    assert.equal(workspaceCity(), "Rouen");

    saveWorkspace(lyon);
    assert.equal(addressForGeocode("12 rue de la République"), "12 rue de la République, Lyon, Auvergne-Rhône-Alpes");
    assert.equal(
      addressForGeocode("Hôpital de la Croix-Rousse, Lyon"),
      "Hôpital de la Croix-Rousse, Lyon, Auvergne-Rhône-Alpes",
    );
    assert.equal(workspaceCity(), "Lyon");
  });

  it("borne le géocodage à Rouen en démo et au dépôt en entreprise", () => {
    const demoUrl = geocodePhotonUrl("12 rue de la République, Rouen");
    assert.equal(
      demoUrl,
      "https://photon.komoot.io/api/?q=12%20rue%20de%20la%20R%C3%A9publique%2C%20Rouen&limit=1&lat=49.44&lon=1.09",
    );
    assert.equal(geocodeAccepts(49.44, 1.09), true);
    assert.equal(geocodeAccepts(45.76, 4.84), false);

    saveWorkspace(lyon);
    const url = new URL(
      geocodePhotonUrl(addressForGeocode("12 rue de la République"), {
        rouengate: false,
        bias: lyon.depot ?? undefined,
      }),
    );
    assert.equal(url.searchParams.get("q"), "12 rue de la République, Lyon, Auvergne-Rhône-Alpes");
    assert.equal(url.searchParams.get("lat"), "45.7578");
    assert.notEqual(url.searchParams.get("lat"), "49.44");
    assert.equal(geocodeAccepts(45.76, 4.84, { rouengate: false, bias: lyon.depot ?? undefined, radiusKm: 400 }), true);
    assert.equal(
      geocodeAccepts(-21.11, 55.53, { rouengate: false, bias: lyon.depot ?? undefined, radiusKm: 400 }),
      false,
    );
    assert.equal(geocodeAccepts(-21.11, 55.53, { rouengate: false }), true);
  });

  it("passe la ville au géocodage CSV et Lomaco", async () => {
    saveWorkspace(lyon);
    const csv = [
      "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite",
      "DOS-1;EXEMPLE;Noa;2026-10-16;09:00;12 rue de la République;Hôpital Nord;assis",
    ].join("\n");
    const queries: string[] = [];
    const preview = await previewCsv(csv, [], DEFAULT_RULES, "2026-10-16", async (query) => {
      queries.push(query);
      return { lat: 45.76, lng: 4.84, label: query };
    });
    assert.deepEqual(queries, [
      "12 rue de la République, Lyon, Auvergne-Rhône-Alpes",
      "Hôpital Nord, Lyon, Auvergne-Rhône-Alpes",
    ]);
    assert.equal(preview.accepted[0]?.location?.city, "Lyon");
    assert.equal(preview.rejected.length, 0);

    const sheet = mapSheet(
      {
        file: "patients.csv",
        sheet: "Patients",
        headers: ["Nom", "Prénom", "Adresse"],
        rows: [["EXEMPLE", "Noa", "8 place Bellecour"]],
      },
      LOMACO_IMPORT_PROFILE,
    );
    const seen: string[] = [];
    const lomaco = await previewLomaco([sheet], {
      locations: [],
      rules: DEFAULT_RULES,
      missionIso: "2026-10-16",
      fleet: [],
      geocode: async (query) => {
        seen.push(query);
        return { lat: 45.76, lng: 4.84, label: query };
      },
    });
    assert.deepEqual(seen, ["8 place Bellecour, Lyon, Auvergne-Rhône-Alpes"]);
    assert.equal(lomaco.patients[0]?.location?.city, "Lyon");
  });
});

describe("persistance du mode", () => {
  it("garde ambux-drafts-v1 et n'écrit le mode que dans la clé versionnée", () => {
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
    assert.equal(loadWorkspace()?.city, "Lyon");
    assert.equal(localStorage.getItem(WORKSPACE_KEY)?.includes("ambux-drafts"), false);

    const version = saveDraft({ ...initialState, phase: "playing" });
    const stored = JSON.parse(localStorage.getItem("ambux-drafts-v1") ?? "[]") as {
      version: number;
      missionDate?: string;
      origin?: string;
    }[];
    assert.equal(
      stored.some((draft) => draft.version === 1 && draft.missionDate === "SENTINELLE"),
      true,
    );
    assert.equal(loadDraft(version ?? -1)?.origin, "entreprise");

    saveWorkspace(DEMO_PROFILE);
    const demoVersion = saveDraft({ ...initialState, phase: "playing", missionIso: "2026-10-17" });
    assert.equal(loadDraft(demoVersion ?? -1)?.origin, undefined);
    assert.equal(loadWorkspace()?.mode, "demo");
    assert.equal(loadWorkspace()?.city, "Rouen");
    assert.equal(loadWorkspace()?.depot, null);
  });

  it("ignore un profil illisible", () => {
    localStorage.setItem(WORKSPACE_KEY, "{");
    assert.equal(loadWorkspace(), null);
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ schema: 2, mode: "entreprise" }));
    assert.equal(loadWorkspace(), null);
  });

  it("ouvre un espace vide rattaché au dépôt", () => {
    const depot = depotFromProfile(lyon);
    assert.ok(depot);
    let state = reducer(initialState, { type: "START_COMPANY", depot, amplitudeMin: 10 * 60, view: "tomorrow" });
    assert.equal(state.phase, "playing");
    assert.equal(state.view, "tomorrow");
    assert.equal(state.transports.length, 0);
    assert.equal(state.crews.length, 0);
    assert.equal(state.patients.length, 0);
    assert.equal(state.locations.length, 1);
    assert.equal(state.locations[0]?.city, "Lyon");
    assert.equal(state.rules.amplitudeMin, 600);
    state = reducer(state, { type: "ADD_VEHICLE", plate: "ZZ-100-ZZ", vehicleType: "vsl", name: "VSL 1" });
    const crew = state.crews[0];
    assert.ok(crew);
    assert.equal(crew.baseId, depot.id);
    assert.equal(crew.shiftEnd - crew.shiftStart, 600);
  });
});
