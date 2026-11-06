import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eraseAmbuxBrowser } from "../src/game/workspace.ts";
import {
  fetchLimited,
  geocodeAddress,
  matrixSource,
  resetRoutingCaches,
  ROUTING_ATTEMPTS,
  ROUTING_TIMEOUT_MS,
  routingNet,
  warmMatrix,
  warmPaths,
} from "../src/lib/routing.ts";
import {
  NOTICE_KEY,
  PRIVATE_KEY,
  grantRoutingNotice,
  parsePrivateMode,
  parseRoutingNotice,
  readPrivateMode,
  readRoutingNotice,
  resetRoutingPrivacyForTests,
  revokeRoutingNotice,
  setPrivateMode,
} from "../src/lib/routingPrivacy.ts";
import { parseTileTemplate } from "../src/lib/tiles.ts";
import { PRIVACY } from "../src/legal/copy.ts";

const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};

const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const previousFetch = globalThis.fetch;
const at = new Date("2026-11-06T12:00:00.000Z");
let calls = 0;

beforeEach(() => {
  memory.clear();
  calls = 0;
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  resetRoutingPrivacyForTests();
  resetRoutingCaches();
  routingNet.timeoutMs = ROUTING_TIMEOUT_MS;
  routingNet.attempts = ROUTING_ATTEMPTS;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = previousFetch;
  if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("mode privé", () => {
  it("n'appelle ni Photon, ni OSRM, ni OpenRouteService", async () => {
    assert.equal(PRIVATE_KEY, "ambux.routing.private.v1");
    assert.equal(setPrivateMode(true), true);
    assert.equal(readPrivateMode(), true);
    localStorage.setItem("ambux.ors", "cle-de-test");
    grantRoutingNotice(at);

    const geo = await geocodeAddress("12 rue des Lilas, Villefictive");
    assert.equal(geo, null);
    const matrix = await warmMatrix([
      { id: "a", lat: 49.44, lng: 1.09 },
      { id: "b", lat: 49.5, lng: 1.12 },
    ]);
    assert.equal(matrix, false);
    assert.equal(matrixSource(), "estimate");
    warmPaths([{ from: { lat: 49.44, lng: 1.09 }, to: { lat: 49.5, lng: 1.12 } }]);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(calls, 0);
  });

  it("ignore une autre version et se révoque avec l'effacement", () => {
    assert.equal(parsePrivateMode(JSON.stringify({ version: 2, enabled: true })), false);
    assert.equal(parseRoutingNotice(JSON.stringify({ version: 2, acceptedAt: at.toISOString() })), null);
    setPrivateMode(true);
    grantRoutingNotice(at);
    assert.equal(NOTICE_KEY, "ambux.routing.notice.v1");
    assert.deepEqual(readRoutingNotice(), { version: 1, acceptedAt: at.toISOString() });
    revokeRoutingNotice();
    assert.equal(readRoutingNotice(), null);
    eraseAmbuxBrowser();
    assert.equal(localStorage.getItem(PRIVATE_KEY), null);
    assert.equal(localStorage.getItem(NOTICE_KEY), null);
    assert.equal(readPrivateMode(), false);
  });
});

describe("délai du routage", () => {
  it("abandonne un fetch qui ne répond pas, puis réessaie", async () => {
    routingNet.timeoutMs = 40;
    routingNet.attempts = 2;
    globalThis.fetch = ((_: string, init?: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const fail = () => reject(Object.assign(new Error("délai"), { name: "TimeoutError" }));
        if (!signal) return;
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
      });
    }) as typeof fetch;

    const started = Date.now();
    await assert.rejects(() => fetchLimited("https://router.project-osrm.org/route"), /délai|réseau/);
    assert.equal(calls, 2);
    assert.ok(Date.now() - started < 3_000, "le délai ne doit pas laisser le fetch ouvert");
  });

  it("passe au kilométrage estimé si OSRM ne répond pas", async () => {
    grantRoutingNotice(at);
    routingNet.timeoutMs = 40;
    routingNet.attempts = 2;
    globalThis.fetch = ((_: string, init?: RequestInit) => {
      calls += 1;
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        const fail = () => reject(Object.assign(new Error("délai"), { name: "TimeoutError" }));
        if (!signal) return;
        if (signal.aborted) fail();
        else signal.addEventListener("abort", fail, { once: true });
      });
    }) as typeof fetch;

    const started = Date.now();
    const ok = await warmMatrix([
      { id: "a", lat: 49.44, lng: 1.09 },
      { id: "b", lat: 49.5, lng: 1.12 },
    ]);
    assert.equal(ok, false);
    assert.equal(matrixSource(), "estimate");
    assert.ok(calls >= 1);
    assert.ok(Date.now() - started < 3_000);
  });

  it("ne contacte pas Photon tant que l'avertissement n'est pas enregistré", async () => {
    const geo = await geocodeAddress("12 rue des Lilas");
    assert.equal(geo, null);
    assert.equal(calls, 0);
  });
});

describe("tuiles et politique", () => {
  it("n'accepte qu'un modèle https avec z, x et y", () => {
    assert.equal(parseTileTemplate("http://tile.example/osm/{z}/{x}/{y}.png"), null);
    assert.equal(parseTileTemplate("https://tile.example/osm/{z}/{x}.png"), null);
    assert.equal(parseTileTemplate("https://tile.example/osm/{z}/{x}/{y}.png extra"), null);
    assert.equal(
      parseTileTemplate("https://tile.example/osm/{z}/{x}/{y}.png"),
      "https://tile.example/osm/{z}/{x}/{y}.png",
    );
  });

  it("décrit le mode privé dans la politique", () => {
    const blob = JSON.stringify(PRIVACY);
    assert.match(blob, /Pas d'envoi d'adresse/);
    assert.match(blob, /ambux\.routing\.notice\.v1/);
    assert.match(blob, /photon\.komoot\.io/);
    assert.match(blob, /OpenStreetMap/);
  });
});
