import type { Phase, ViewId } from "../game/types";

/**
 * Canal d'avis — à renseigner par Nicolas.
 *
 * 1. URL d'envoi, prioritaire si elle est non vide :
 *    - constante FEEDBACK_URL ci-dessous
 *    - ou variable de build VITE_FEEDBACK_URL (elle gagne sur la constante)
 *    Formspree : https://formspree.io/f/xxxxxxxx
 *    (POST multipart : note, texte, version, ecran, mode, courses, equipages, vehicules, capture)
 *    Tally : https://tally.so/r/xxxxxx
 *    (ouvre le formulaire avec les mêmes champs en query string ; la capture n'est pas envoyée)
 *    Laisser vide pour le repli mailto. Seul un https est accepté.
 *
 * 2. Courriel de repli :
 *    - constante FEEDBACK_EMAIL
 *    - ou variable de build VITE_FEEDBACK_EMAIL
 *    La valeur livrée est un placeholder (TLD .invalid, RFC 2606). Elle ne désigne pas une boîte.
 *    Nicolas la remplace par l'adresse qui doit recevoir les avis.
 */
export const FEEDBACK_URL = "";

export const FEEDBACK_EMAIL_PLACEHOLDER = "a-completer@exemple.invalid";

/** Remplacer par l'adresse réelle. Ne pas inventer une adresse personnelle. */
export const FEEDBACK_EMAIL = FEEDBACK_EMAIL_PLACEHOLDER;

export const APP_VERSION = "0.9.0-alpha.3-b9";

export const TECHNICAL_FIELDS = ["version", "ecran", "mode", "courses", "equipages", "vehicules"] as const;

export const FORM_FIELDS = ["note", "texte", ...TECHNICAL_FIELDS, "capture"] as const;

const VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-.][0-9A-Za-z]+)*$/;
const EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const TEXT_MAX = 4000;

const VIEW_SCREEN: Record<ViewId, string> = {
  gantt: "timeline",
  carte: "carte",
  file: "a-placer",
  synthese: "synthese",
  reglages: "reglages",
  tomorrow: "demande",
  crews: "equipages",
  vehicles: "vehicules",
  patients: "fiches",
  companies: "societes",
  lomaco: "lomaco",
  feuille: "feuille",
};

const SCREENS = new Set<string>([
  "accueil",
  "choix-mode",
  "assistant-entreprise",
  "ouverture",
  "bilan",
  ...Object.values(VIEW_SCREEN),
]);

export interface TechnicalContext {
  version: string;
  ecran: string;
  mode: "demo" | "entreprise";
  courses: number;
  equipages: number;
  vehicules: number;
}

export interface FeedbackDraft {
  note: number;
  texte: string;
  capture: File | null;
  contexte: TechnicalContext;
}

export interface FeedbackEnv {
  url: string;
  email: string;
}

export type FeedbackChannel =
  | { kind: "form"; url: string }
  | { kind: "tally"; url: string }
  | { kind: "mailto"; email: string; placeholder: boolean };

export function screenFromApp(phase: Phase, view: ViewId): string {
  if (phase === "briefing") return "accueil";
  if (phase === "report") return "bilan";
  return VIEW_SCREEN[view];
}

export function countersOf(source: {
  transports?: readonly unknown[];
  crews?: readonly unknown[];
  vehicles?: readonly unknown[];
}): { courses: number; equipages: number; vehicules: number } {
  return {
    courses: lengthOf(source.transports),
    equipages: lengthOf(source.crews),
    vehicules: lengthOf(source.vehicles),
  };
}

export function technicalContext(input: {
  version: string;
  ecran: string;
  mode: string;
  courses: number;
  equipages: number;
  vehicules: number;
}): TechnicalContext {
  const ctx: TechnicalContext = {
    version: versionToken(input.version),
    ecran: SCREENS.has(input.ecran) ? input.ecran : "inconnu",
    mode: input.mode === "entreprise" ? "entreprise" : "demo",
    courses: count(input.courses),
    equipages: count(input.equipages),
    vehicules: count(input.vehicules),
  };
  return ctx;
}

export function feedbackPlainText(draft: FeedbackDraft): string {
  const ctx = technicalContext(draft.contexte);
  const note = clampNote(draft.note);
  const lines = [
    "Avis Ambux",
    note == null ? "Note : (absente)" : `Note : ${note}/5`,
    "Texte :",
    cleanText(draft.texte) || "(vide)",
    "",
    "Contexte technique anonyme. Aucune donnée métier n'est jointe.",
    `Version : ${ctx.version}`,
    `Écran : ${ctx.ecran}`,
    `Mode : ${ctx.mode}`,
    `Courses : ${ctx.courses}`,
    `Équipages : ${ctx.equipages}`,
    `Véhicules : ${ctx.vehicules}`,
  ];
  return lines.join("\n");
}

export function feedbackMailto(email: string, draft: FeedbackDraft): string {
  const to = safeEmail(email);
  const subject = "Avis Ambux";
  const body = feedbackPlainText(draft);
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function feedbackFormData(draft: FeedbackDraft): FormData {
  const ctx = technicalContext(draft.contexte);
  const note = clampNote(draft.note);
  if (note == null) throw new Error("note hors 1–5");
  const form = new FormData();
  form.set("note", String(note));
  form.set("texte", cleanText(draft.texte));
  form.set("version", ctx.version);
  form.set("ecran", ctx.ecran);
  form.set("mode", ctx.mode);
  form.set("courses", String(ctx.courses));
  form.set("equipages", String(ctx.equipages));
  form.set("vehicules", String(ctx.vehicules));
  if (draft.capture && draft.capture.type.startsWith("image/")) {
    form.set("capture", new File([draft.capture], "capture", { type: draft.capture.type }));
  }
  return form;
}

export function tallyHref(base: string, draft: FeedbackDraft): string | null {
  const note = clampNote(draft.note);
  const url = httpsUrl(base);
  if (!url || note == null || !isTally(url)) return null;
  const ctx = technicalContext(draft.contexte);
  url.searchParams.set("note", String(note));
  url.searchParams.set("texte", cleanText(draft.texte).slice(0, 1500));
  url.searchParams.set("version", ctx.version);
  url.searchParams.set("ecran", ctx.ecran);
  url.searchParams.set("mode", ctx.mode);
  url.searchParams.set("courses", String(ctx.courses));
  url.searchParams.set("equipages", String(ctx.equipages));
  url.searchParams.set("vehicules", String(ctx.vehicules));
  return url.toString();
}

export function feedbackChannel(env: FeedbackEnv = readBuildEnv()): FeedbackChannel {
  const url = resolvedFeedbackUrl(env);
  if (url) {
    const parsed = new URL(url);
    if (isTally(parsed)) return { kind: "tally", url };
    return { kind: "form", url };
  }
  const email = resolvedFeedbackEmail(env);
  return { kind: "mailto", email, placeholder: email.endsWith("@exemple.invalid") };
}

export function resolvedFeedbackUrl(env: FeedbackEnv = readBuildEnv()): string {
  const raw = (env.url || FEEDBACK_URL).trim();
  const url = httpsUrl(raw);
  if (!url) return "";
  return url.toString();
}

export function resolvedFeedbackEmail(env: FeedbackEnv = readBuildEnv()): string {
  return safeEmail((env.email || FEEDBACK_EMAIL).trim());
}

export async function postFeedback(url: string, draft: FeedbackDraft, fetchImpl: typeof fetch = fetch): Promise<void> {
  const target = resolvedFeedbackUrl({ url, email: "" });
  if (!target || isTally(new URL(target))) throw new Error("endpoint refusé");
  const response = await fetchImpl(target, {
    method: "POST",
    body: feedbackFormData(draft),
    headers: { Accept: "application/json" },
    credentials: "omit",
  });
  if (!response.ok) throw new Error("envoi refusé");
}

function readBuildEnv(): FeedbackEnv {
  const env = import.meta.env as { [key: string]: unknown } | undefined;
  if (!env) return { url: "", email: "" };
  return {
    url: typeof env.VITE_FEEDBACK_URL === "string" ? env.VITE_FEEDBACK_URL.trim() : "",
    email: typeof env.VITE_FEEDBACK_EMAIL === "string" ? env.VITE_FEEDBACK_EMAIL.trim() : "",
  };
}

function lengthOf(value: readonly unknown[] | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function count(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), 1_000_000);
}

function versionToken(value: string): string {
  const trimmed = value.trim();
  if (!VERSION.test(trimmed) || trimmed.length > 40) return "inconnue";
  return trimmed;
}

function clampNote(note: number): number | null {
  if (!Number.isInteger(note) || note < 1 || note > 5) return null;
  return note;
}

function cleanText(value: string): string {
  return value.split(String.fromCharCode(0)).join("").replaceAll("\r\n", "\n").trim().slice(0, TEXT_MAX);
}

function safeEmail(email: string): string {
  return EMAIL.test(email) ? email : FEEDBACK_EMAIL_PLACEHOLDER;
}

function httpsUrl(raw: string): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

function isTally(url: URL): boolean {
  return url.hostname === "tally.so" || url.hostname === "www.tally.so";
}
