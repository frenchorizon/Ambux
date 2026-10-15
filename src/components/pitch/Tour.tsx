import { useEffect, useLayoutEffect, useState } from "react";
import { useData } from "../../game/context";
import { Button } from "../ui/button";

const SEEN = "ambux.tour.v1";

const STEPS = [
  {
    id: "generer",
    title: "Recalculer, si la demande bouge",
    body: "Le planning que vous venez de voir est déjà posé. Ce bouton relance le même calcul, avec les règles dures : tolérance, pause, amplitude, charge, DEA.",
  },
  {
    id: "controle",
    title: "Ce qui ne passe pas reste visible",
    body: "« À contrôler » liste les courses non placées, les séries coupées, les kilomètres estimés. Rien n'est rangé sous le tapis pour faire joli.",
  },
  {
    id: "carte",
    title: "La carte, à côté de la timeline",
    body: "Chaque trait est la tournée d'un équipage. Tant que le routier public n'a pas répondu, la distance est une estimation, signalée comme telle.",
  },
  {
    id: "export",
    title: "Un CSV, pas un envoi",
    body: "Exporter télécharge le planning retenu. Aucun dossier n'est transmis à Lomaco ni à un organisme. La démo s'arrête au fichier.",
  },
  {
    id: "feuille",
    title: "La feuille que lit l'équipage",
    body: "Une colonne, la prochaine course en grand, le repas dans la liste. Ce n'est pas un bon de transport : les patients sont fictifs.",
  },
] as const;

export function Tour({ onDone }: { onDone: () => void }) {
  const { dispatch } = useData();
  const [step, setStep] = useState(0);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const current = STEPS[step]!;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // finish ne dépend que de props stables pour Échap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onDone]);

  useLayoutEffect(() => {
    const node = document.querySelector(`[data-tour="${current.id}"]`);
    if (!(node instanceof HTMLElement)) {
      setBox(null);
      return;
    }
    node.scrollIntoView({ block: "nearest", inline: "nearest" });
    const rect = node.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) {
      setBox(null);
      return;
    }
    setBox({ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 });
  }, [current.id]);

  function finish(openSheet: boolean): void {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {
      /* quota */
    }
    if (openSheet) dispatch({ type: "SET_VIEW", view: "feuille" });
    onDone();
  }

  function next(): void {
    if (step >= STEPS.length - 1) finish(true);
    else setStep((value) => value + 1);
  }

  const below = box ? box.top + box.height + 12 : 0;
  const cardTop = box ? (below + 220 < window.innerHeight ? below : Math.max(12, box.top - 220)) : undefined;
  const cardLeft = box ? Math.min(Math.max(12, box.left), window.innerWidth - 372) : undefined;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      <button type="button" className="absolute inset-0 bg-navy/50" aria-label="Passer la visite" onClick={() => finish(false)} />
      {box && (
        <div
          className="pointer-events-none absolute rounded-xl shadow-[0_0_0_9999px_rgba(7,19,31,0.55)] ring-2 ring-white"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      )}
      <div
        className="absolute z-10 w-[min(360px,calc(100%-24px))] rounded-2xl border border-line bg-card p-4 text-ink shadow-xl"
        style={box ? { top: cardTop, left: cardLeft } : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
          Visite {step + 1} / {STEPS.length}
        </p>
        <h2 id="tour-title" className="mt-1 text-lg font-semibold">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{current.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => finish(false)}>
            Passer
          </Button>
          <Button size="sm" onClick={next} autoFocus>
            {step === STEPS.length - 1 ? "Voir la feuille" : "Suivant"}
          </Button>
        </div>
      </div>
    </div>
  );
}
