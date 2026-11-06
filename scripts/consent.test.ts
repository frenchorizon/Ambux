import assert from "node:assert/strict";
import { after, beforeEach, describe, it } from "node:test";
import { eraseAmbuxBrowser } from "../src/game/workspace.ts";
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  grantImportConsent,
  importRequiresConsent,
  parseImportConsent,
  readImportConsent,
  resetImportConsentCache,
  revokeImportConsent,
} from "../src/legal/consent.ts";
import { BETA_NOTICE, LEGAL_DRAFT_TITLE, PRIVACY, PUBLISHER } from "../src/legal/copy.ts";
import { legalPageFromHash } from "../src/legal/nav.ts";

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
const at = new Date("2026-11-06T12:00:00.000Z");

beforeEach(() => {
  memory.clear();
  storage.setItem = (key: string, value: string) => {
    memory.set(key, value);
  };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  resetImportConsentCache();
});

after(() => {
  if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
  else Reflect.deleteProperty(globalThis, "localStorage");
});

describe("consentement d'import", () => {
  it("enregistre une version et une date, puis les relit", () => {
    assert.equal(CONSENT_KEY, "ambux.consent.v1");
    assert.equal(CONSENT_VERSION, 1);
    assert.equal(readImportConsent(), null);
    assert.equal(grantImportConsent(at), true);
    const stored = readImportConsent();
    assert.deepEqual(stored, { version: 1, acceptedAt: "2026-11-06T12:00:00.000Z" });
    assert.equal(readImportConsent(), stored);
    assert.equal(localStorage.getItem(CONSENT_KEY), JSON.stringify(stored));
  });

  it("ignore une autre version, un JSON cassé ou une date vide", () => {
    assert.equal(parseImportConsent(null), null);
    assert.equal(parseImportConsent("{"), null);
    assert.equal(parseImportConsent(JSON.stringify({ version: 2, acceptedAt: "2026-11-06T12:00:00.000Z" })), null);
    assert.equal(parseImportConsent(JSON.stringify({ version: 1, acceptedAt: "  " })), null);
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 2, acceptedAt: "2026-11-06T12:00:00.000Z" }));
    assert.equal(readImportConsent(), null);
  });

  it("ne bloque que le mode entreprise sans consentement", () => {
    assert.equal(importRequiresConsent("demo", null), false);
    assert.equal(importRequiresConsent(undefined, null), false);
    assert.equal(importRequiresConsent("entreprise", null), true);
    assert.equal(importRequiresConsent("entreprise", { version: 1, acceptedAt: "2026-11-06T12:00:00.000Z" }), false);
    assert.equal(importRequiresConsent("demo", { version: 1, acceptedAt: "2026-11-06T12:00:00.000Z" }), false);
  });

  it("révoque le consentement et n'écrit rien si le stockage refuse", () => {
    grantImportConsent(at);
    revokeImportConsent();
    assert.equal(localStorage.getItem(CONSENT_KEY), null);
    assert.equal(readImportConsent(), null);

    storage.setItem = () => {
      const error = new Error("quota");
      error.name = "QuotaExceededError";
      throw error;
    };
    assert.equal(grantImportConsent(at), false);
    assert.equal(readImportConsent(), null);
  });

  it("disparaît avec l'effacement du navigateur", () => {
    grantImportConsent(at);
    localStorage.setItem("hors-ambux", "reste");
    eraseAmbuxBrowser();
    assert.equal(readImportConsent(), null);
    assert.equal(localStorage.getItem("hors-ambux"), "reste");
  });
});

describe("texte juridique", () => {
  it("laisse le SIRET et l'adresse à compléter", () => {
    assert.equal(PUBLISHER.find((row) => row.term === "SIRET")?.detail, "à compléter");
    assert.equal(PUBLISHER.find((row) => row.term === "Adresse")?.detail, "à compléter");
    assert.match(PUBLISHER.find((row) => row.term === "Éditeur")?.detail ?? "", /^Nicolas — à compléter/);
    assert.equal(LEGAL_DRAFT_TITLE, "Brouillon à faire relire par un humain.");
    assert.match(BETA_NOTICE, /Pas un dispositif médical, version bêta, sans garantie/);
    const blob = JSON.stringify({ PUBLISHER, PRIVACY });
    assert.match(blob, /photon\.komoot\.io/);
    assert.match(blob, /stockage local/);
    assert.doesNotMatch(blob, /\d{9,}/);
  });

  it("ouvre les deux pages par le fragment", () => {
    assert.equal(legalPageFromHash("#mentions-legales"), "mentions");
    assert.equal(legalPageFromHash("#confidentialite"), "confidentialite");
    assert.equal(legalPageFromHash("#autre"), null);
    assert.equal(legalPageFromHash(""), null);
  });
});
