import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APP_VERSION,
  FEEDBACK_EMAIL,
  FEEDBACK_EMAIL_PLACEHOLDER,
  FEEDBACK_URL,
  FORM_FIELDS,
  TECHNICAL_FIELDS,
  countersOf,
  feedbackChannel,
  feedbackFormData,
  feedbackMailto,
  feedbackPlainText,
  postFeedback,
  resolvedFeedbackUrl,
  screenFromApp,
  tallyHref,
  technicalContext,
  type FeedbackDraft,
} from "../src/feedback/channel.ts";
import type { Phase, ViewId } from "../src/game/types.ts";

const SECRET = {
  patient: "Camille Durand",
  adresse: "12 rue des Lilas",
  equipage: "Léa Bernard",
  plaque: "AB-123-CD",
  phone: "0601020304",
  ville: "Rouen",
  depot: "rue de l'Industrie",
  planning: "08:10 CHU Charles-Nicolle",
};

describe("contexte technique de l'avis", () => {
  it("ne retient que la version, l'écran, le mode et les compteurs", () => {
    const state = {
      version: APP_VERSION,
      ecran: "timeline",
      mode: "demo",
      transports: [
        { id: "t1", patientId: "p1", note: `${SECRET.patient}, ${SECRET.adresse}`, dossier: "DOS-1" },
        { id: "t2", patientId: "p2" },
      ],
      crews: [{ id: "c1", driver: SECRET.equipage, plate: SECRET.plaque, code: "AMB1" }],
      vehicles: [{ id: "v1", name: "VSL 2", plate: "CD-456-EF" }],
      patients: [{ firstName: "Camille", lastName: "Durand", phone: SECRET.phone, address: SECRET.adresse }],
      locations: [{ name: SECRET.adresse, city: SECRET.ville, lat: 49.44, lng: 1.09 }],
      planning: [{ depart: "08:10", patient: SECRET.patient, pickup: SECRET.planning }],
      companyName: "Transports Fictifs",
    };
    const counts = countersOf(state);
    assert.deepEqual(counts, { courses: 2, equipages: 1, vehicules: 1 });
    const ctx = technicalContext({
      version: state.version,
      ecran: state.ecran,
      mode: state.mode,
      ...counts,
    });
    assert.deepEqual(Object.keys(ctx), [...TECHNICAL_FIELDS]);
    assert.deepEqual(ctx, {
      version: APP_VERSION,
      ecran: "timeline",
      mode: "demo",
      courses: 2,
      equipages: 1,
      vehicules: 1,
    });
    const json = JSON.stringify(ctx);
    for (const secret of Object.values(SECRET)) {
      assert.equal(json.includes(secret), false, secret);
    }
    assert.equal(json.toLowerCase().includes("patient"), false);
    assert.equal(json.toLowerCase().includes("adresse"), false);
    assert.equal(json.includes("Transports Fictifs"), false);
  });

  it("refuse un écran ou une version qui porterait un nom", () => {
    const ctx = technicalContext({
      version: `${APP_VERSION} ${SECRET.patient}`,
      ecran: SECRET.patient,
      mode: "Transports Fictifs",
      courses: 3.9,
      equipages: -1,
      vehicules: Number.NaN,
    });
    assert.equal(ctx.version, "inconnue");
    assert.equal(ctx.ecran, "inconnu");
    assert.equal(ctx.mode, "demo");
    assert.equal(ctx.courses, 3);
    assert.equal(ctx.equipages, 0);
    assert.equal(ctx.vehicules, 0);
    assert.equal(JSON.stringify(ctx).includes("Camille"), false);
  });

  it("nomme les écrans sans champ patient", () => {
    const views: ViewId[] = [
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
    ];
    for (const view of views) {
      const screen = screenFromApp("playing", view);
      assert.equal(/patient|adresse|address|planning/i.test(screen), false, view);
    }
    assert.equal(screenFromApp("playing", "patients"), "fiches");
    assert.equal(screenFromApp("briefing", "gantt"), "accueil");
    assert.equal(screenFromApp("report", "reglages"), "bilan");
    const review: Phase = "review";
    assert.equal(screenFromApp(review, "gantt"), "timeline");
  });

  it("prépare le courriel et le formulaire sans les secrets", async () => {
    const ctx = technicalContext({
      version: APP_VERSION,
      ecran: "reglages",
      mode: "entreprise",
      courses: 4,
      equipages: 2,
      vehicules: 2,
    });
    const draft: FeedbackDraft = {
      note: 4,
      texte: "Le geste est clair.",
      capture: new File([new Uint8Array([1, 2, 3])], `${SECRET.patient}.png`, { type: "image/png" }),
      contexte: ctx,
    };
    const href = feedbackMailto(FEEDBACK_EMAIL_PLACEHOLDER, draft);
    assert.equal(href.startsWith(`mailto:${FEEDBACK_EMAIL_PLACEHOLDER}?`), true);
    const body = decodeURIComponent(href.slice(href.indexOf("body=") + 5));
    assert.match(body, /Note : 4\/5/);
    assert.match(body, /Aucune donnée métier n'est jointe/);
    assert.match(body, /Courses : 4/);
    assert.match(body, /Mode : entreprise/);
    for (const secret of Object.values(SECRET)) assert.equal(body.includes(secret), false, secret);

    const form = feedbackFormData(draft);
    assert.deepEqual([...form.keys()].sort(), [...FORM_FIELDS].sort());
    const capture = form.get("capture");
    assert.equal(capture instanceof File, true);
    assert.equal(capture instanceof File ? capture.name : "", "capture");
    const packed = [...form.entries()]
      .filter(([key]) => key !== "capture")
      .map(([key, value]) => `${key}=${String(value)}`)
      .join("\n");
    for (const secret of Object.values(SECRET)) assert.equal(packed.includes(secret), false, secret);

    let seen: FormData | null = null;
    let called = "";
    await postFeedback("https://formspree.io/f/xxxxxxxx", draft, async (url, init) => {
      called = String(url);
      seen = init?.body instanceof FormData ? init.body : null;
      return new Response("{}", { status: 200 });
    });
    assert.equal(called, "https://formspree.io/f/xxxxxxxx");
    assert.equal(seen?.get("texte"), "Le geste est clair.");
    assert.equal(seen?.get("patient"), null);
    await assert.rejects(() => postFeedback("http://formspree.io/f/xxxxxxxx", draft, async () => new Response()));
    await assert.rejects(() => postFeedback("https://tally.so/r/abcd", draft, async () => new Response()));
  });

  it("laisse le canal vide tant que Nicolas n'a pas renseigné d'URL", () => {
    assert.equal(FEEDBACK_URL, "");
    assert.equal(FEEDBACK_EMAIL, FEEDBACK_EMAIL_PLACEHOLDER);
    assert.equal(FEEDBACK_EMAIL.endsWith("@exemple.invalid"), true);
    assert.equal(resolvedFeedbackUrl({ url: "", email: "" }), "");
    assert.equal(resolvedFeedbackUrl({ url: "http://formspree.io/f/x", email: "" }), "");
    assert.equal(resolvedFeedbackUrl({ url: "javascript:alert(1)", email: "" }), "");
    assert.deepEqual(feedbackChannel({ url: "", email: "" }), {
      kind: "mailto",
      email: FEEDBACK_EMAIL_PLACEHOLDER,
      placeholder: true,
    });
    const formspree = feedbackChannel({ url: "https://formspree.io/f/xxxxxxxx", email: "" });
    assert.deepEqual(formspree, { kind: "form", url: "https://formspree.io/f/xxxxxxxx" });
    const tally = feedbackChannel({ url: "https://tally.so/r/abcd", email: "" });
    assert.equal(tally.kind, "tally");
    const href = tallyHref("https://tally.so/r/abcd", {
      note: 1,
      texte: SECRET.patient,
      capture: null,
      contexte: technicalContext({
        version: APP_VERSION,
        ecran: "accueil",
        mode: "demo",
        courses: 0,
        equipages: 0,
        vehicules: 0,
      }),
    });
    assert.ok(href);
    const url = new URL(href ?? "");
    assert.equal(url.searchParams.get("note"), "1");
    assert.equal(url.searchParams.get("texte"), SECRET.patient);
    assert.equal(url.searchParams.get("courses"), "0");
    assert.equal(url.searchParams.get("patient"), null);
    assert.equal(url.searchParams.get("adresse"), null);
    assert.equal(
      feedbackPlainText({
        note: 9,
        texte: "",
        capture: null,
        contexte: technicalContext({
          version: APP_VERSION,
          ecran: "accueil",
          mode: "demo",
          courses: 0,
          equipages: 0,
          vehicules: 0,
        }),
      }).includes("Note : (absente)"),
      true,
    );
  });
});
