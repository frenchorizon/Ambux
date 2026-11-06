import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { DEMO_MEASURE } from "../../data/demoFacts";
import { useData } from "../../game/context";
import { MISSION_DATE } from "../../game/types";
import { toggleTheme, useDark } from "../../lib/theme";
import { FeedbackDialog } from "../feedback/FeedbackForm";
import { BetaNotice } from "../legal/Legal";
import { Logo } from "../Sidebar";
import { Button } from "../ui/button";
import { FleetPanel } from "./FleetPanel";
import { RoiCalculator } from "./RoiCalculator";

const TIERS = [
  {
    name: "Découverte",
    status: "Bêta · gratuit",
    price: "0 €",
    unit: "pendant la bêta",
    points: ["Exemple fictif de Rouen", "Planning, carte, CSV, feuille", "Avis en échange"],
  },
  {
    name: "Poste",
    status: "Indicatif · futur",
    price: "79 €",
    unit: "HT / véhicule / mois · pas en vigueur",
    points: ["Jusqu'à 8 véhicules, un site", "Import et export CSV", "Accompagnement de prise en main"],
  },
  {
    name: "Flotte",
    status: "Indicatif · futur",
    price: "59 €",
    unit: "HT / véhicule / mois · pas en vigueur",
    points: ["De 9 à 20 véhicules", "Même geste, volume plus haut", "Règles d'amplitude et de charge"],
  },
  {
    name: "Groupe",
    status: "Indicatif · futur",
    price: "Sur devis",
    unit: "plusieurs exploitations · pas en vigueur",
    points: ["Sites séparés, pas mélangés", "Import calé sur votre export", "Plusieurs sites, plus tard"],
  },
];

export function Landing() {
  const { dispatch } = useData();
  const dark = useDark();
  const [ask, setAsk] = useState(false);
  const [feedback, setFeedback] = useState(false);
  return (
    <div className="min-h-dvh bg-transparent text-ink">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2"
      >
        Aller au contenu
      </a>
      <header className="glass sticky top-0 z-40 border-b border-line/80">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Logo />
          <nav className="ml-auto hidden items-center gap-5 text-sm font-semibold text-muted sm:flex">
            <a href="#mesure" className="hover:text-ink">
              Mesure
            </a>
            <a href="#calculateur" className="hover:text-ink">
              Calculateur
            </a>
            <a href="#plus-tard" className="hover:text-ink">
              Plus tard
            </a>
            <a href="#exemple" className="hover:text-ink">
              Exemple
            </a>
          </nav>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-card"
            onClick={() => toggleTheme()}
            aria-label={dark ? "Passer en mode clair" : "Passer en mode sombre"}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <Button onClick={() => oneClick(dispatch)}>Planning en 1 clic</Button>
        </div>
      </header>
      <main id="contenu">
        <section className="mx-auto grid max-w-6xl items-end gap-10 px-4 py-14 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
              Bêta publique · transport sanitaire · France
            </p>
            <h1 className="mt-3 max-w-xl font-display text-5xl leading-[1.05] font-light text-navy sm:text-6xl">
              Le planning de demain, déjà posé.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Ambux est la bêta d'un logiciel de génération de planning pour les sociétés de transport sanitaire.
              L'ambition est d'en faire la référence nationale, en s'intégrant aux logiciels déjà en place — Lomaco et
              les autres — sans les remplacer. Pendant cette bêta publique, l'accès est gratuit. En échange, un avis.
              Aucun abonnement n'est en vigueur.
            </p>
            <div className="mt-4 max-w-lg">
              <BetaNotice tone="inline" />
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => oneClick(dispatch)}>
                Planning de demain en 1 clic
              </Button>
              <Button size="lg" variant="secondary" type="button" onClick={() => setFeedback(true)}>
                Donner mon avis
              </Button>
              <Button size="lg" variant="secondary" onClick={() => setAsk(true)}>
                Noter ma société
              </Button>
            </div>
            <p className="mt-4 max-w-lg text-xs leading-relaxed text-muted">
              Exemple au {MISSION_DATE}, patients inventés, dépôt fictif du Petit-Quevilly. Aucune donnée de santé
              réelle. Pas un dispositif médical, pas un conseil juridique, pas un kilomètre facturable. Le bandeau en
              haut passe de l'exemple fictif à votre société.
            </p>
          </div>
          <aside className="glass p-5 shadow-sm" id="mesure">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Exemple fictif · 3 ambulances et 3 VSL
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Stat k="Courses posées" v={DEMO_MEASURE.placed} />
              <Stat k="Hors créneau" v={DEMO_MEASURE.late} />
              <Stat k="Km à vide, naïf" v={DEMO_MEASURE.naiveEmptyKm} />
              <Stat k="Km à vide, Ambux" v={DEMO_MEASURE.ambuxEmptyKm} />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Illustration de la bêta, pas le planning de votre société. Planning initial : premier équipage compatible,
              dans l'ordre des rendez-vous, mêmes règles dures. {DEMO_MEASURE.naiveEmptyKm} km à vide,{" "}
              {DEMO_MEASURE.ambuxEmptyKm} km avec Ambux. Distances estimées : avec le routier public, les kilomètres
              bougent. Une course qui ne tient pas reste dans « À contrôler ».
            </p>
          </aside>
        </section>

        <section className="border-y border-line bg-card">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-3">
            <Step
              n="01"
              title="La demande de demain"
              text="Le fichier vient de votre logiciel de régulation — export Lomaco, CSV ou Excel — ou d'une saisie. Chaque ligne douteuse est refusée, avec le motif."
            />
            <Step
              n="02"
              title="Un planning qui dit non"
              text="Tolérance, pause repas, amplitude de 11 h, DEA sur l'ambulance. Ce qui ne passe pas reste à contrôler."
            />
            <Step
              n="03"
              title="La feuille, puis le CSV"
              text="Le conducteur lit sa tournée. Vous exportez le planning retenu pour le réinjecter dans le logiciel d'origine. Le fichier reste dans ce navigateur."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <RoiCalculator />
        </section>

        <section id="plus-tard" className="scroll-mt-20 border-t border-line bg-card">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl text-navy sm:text-4xl">Pas un tarif en vigueur</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Pendant la bêta, l'accès est gratuit. L'échange demandé est un avis, par « Donner mon avis ». Les montants
              ci-dessous sont indicatifs et futurs : hors taxes, non contractuels, pas en vigueur. Ils ne décrivent pas
              une offre à souscrire, ni une licence Lomaco, ni un hébergement de données de santé.
            </p>
            <div className="mt-8 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {TIERS.map((tier) => (
                <article key={tier.name} className="glass flex flex-col p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">{tier.status}</p>
                  <h3 className="mt-2 font-semibold">{tier.name}</h3>
                  <p className="mt-3 font-display text-4xl font-light text-navy">{tier.price}</p>
                  <p className="text-xs text-muted">{tier.unit}</p>
                  <ul className="mt-4 space-y-2 text-sm">
                    {tier.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="exemple" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
            <div>
              <h2 className="font-display text-3xl text-navy sm:text-4xl">Regarder l'exemple</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Un clic charge une journée fictive, calcule, puis dessine les tournées sur la carte de Rouen. Vous
                pouvez aussi choisir la flotte. Le brouillon reste dans ce navigateur. Votre société se prépare depuis
                le bandeau.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" onClick={() => oneClick(dispatch)}>
                  Planning de demain en 1 clic
                </Button>
              </div>
            </div>
            <FleetPanel />
          </div>
        </section>
      </main>
      <footer className="border-t border-line px-4 py-8 text-center text-xs text-muted">
        <p>
          Ambux · bêta publique · génération de planning pour le transport sanitaire en France · intégration aux
          logiciels en place, dont Lomaco. Accès gratuit pendant la bêta. {MISSION_DATE} · patients fictifs. Pas encore
          un service payant.
        </p>
        <div className="mt-2">
          <BetaNotice tone="inline" />
        </div>
        <nav aria-label="Pages légales" className="mt-2 flex flex-wrap items-center justify-center gap-x-4">
          <button
            type="button"
            className="inline-flex min-h-11 items-center font-semibold text-brand"
            onClick={() => setFeedback(true)}
          >
            Donner mon avis
          </button>
          <a className="inline-flex min-h-11 items-center font-semibold text-brand" href="#mentions-legales">
            Mentions légales
          </a>
          <a className="inline-flex min-h-11 items-center font-semibold text-brand" href="#confidentialite">
            Politique de confidentialité
          </a>
        </nav>
      </footer>
      {ask && <DemoAsk onClose={() => setAsk(false)} />}
      {feedback ? <FeedbackDialog ecran="accueil" onClose={() => setFeedback(false)} /> : null}
    </div>
  );
}

function oneClick(dispatch: ReturnType<typeof useData>["dispatch"]): void {
  sessionStorage.setItem("ambux.cinema", "1");
  dispatch({ type: "START", amb: 3, vsl: 3, density: "normale", seed: 20261015 });
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl bg-paper px-3 py-3">
      <div className="text-[13px] font-medium uppercase tracking-wide text-muted">{k}</div>
      <div className="mt-1 text-2xl font-light tracking-tight tabular-nums">{v}</div>
    </div>
  );
}

function Step({ n, title, text }: { n: string; title: string; text: string }) {
  return (
    <article>
      <div className="font-display text-2xl text-brand">{n}</div>
      <h2 className="mt-2 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
    </article>
  );
}

function DemoAsk({ onClose }: { onClose: () => void }) {
  const [sent, setSent] = useState(false);
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="societe-title"
    >
      <form
        className="glass w-full max-w-md p-6 shadow-xl"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          try {
            localStorage.setItem(
              "ambux.demo-ask",
              JSON.stringify({
                societe: String(data.get("societe") ?? ""),
                ville: String(data.get("ville") ?? ""),
                vehicules: String(data.get("vehicules") ?? ""),
                email: String(data.get("email") ?? ""),
                at: new Date().toISOString(),
              }),
            );
          } catch {
            /* quota */
          }
          setSent(true);
        }}
      >
        <h2 id="societe-title" className="font-display text-3xl text-navy">
          Noter ma société
        </h2>
        <p className="mt-2 text-sm text-muted">
          Le formulaire reste dans ce navigateur. Aucun e-mail n'est envoyé, aucun commercial n'est prévenu. La bêta est
          déjà ouverte : ce formulaire ne la débloque pas.
        </p>
        {sent ? (
          <p className="mt-4 text-sm font-semibold" role="status">
            Noté ici, et nulle part ailleurs. L'exemple se lance en un clic. L'avis se donne à part.
          </p>
        ) : (
          <div className="mt-4 grid gap-2">
            <input
              required
              name="societe"
              placeholder="Société"
              aria-label="Société"
              className="h-11 rounded-xl border border-line bg-paper px-3"
            />
            <input
              required
              name="ville"
              placeholder="Ville"
              aria-label="Ville"
              className="h-11 rounded-xl border border-line bg-paper px-3"
            />
            <input
              required
              name="vehicules"
              type="number"
              min={1}
              max={80}
              placeholder="Nombre de véhicules"
              aria-label="Nombre de véhicules"
              className="h-11 rounded-xl border border-line bg-paper px-3"
            />
            <input
              required
              name="email"
              type="email"
              placeholder="E-mail"
              aria-label="E-mail"
              className="h-11 rounded-xl border border-line bg-paper px-3"
            />
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Fermer
          </Button>
          {!sent && <Button type="submit">Enregistrer ici</Button>}
        </div>
      </form>
    </div>
  );
}
