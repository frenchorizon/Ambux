import { useEffect, useRef, useState } from "react";
import { useClock, useData } from "../game/context";
import { optimizePlan, type PlanResult } from "../game/optimizer";
import { formatKm, formatPct } from "../lib/format";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export function GameDialogs() {
  const data = useData();
  const clock = useClock();
  return (
    <>
      <OptimizerDialog open={data.modal === "optimizer"} nowMin={clock.nowMin} />
      <Modal
        open={data.modal === "lomaco"}
        onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
        title="Valider et envoyer vers Lomaco"
        description="Les feuilles de route du jour sont transmises au logiciel de facturation. Connexion de démonstration, aucun envoi réel."
      >
        <ul className="mb-4 space-y-1 text-sm">
          {data.crews.map((crew) => {
            const count = data.transports.filter((transport) => transport.crewId === crew.id && !transport.cancelled).length;
            return (
              <li key={crew.id} className="flex justify-between rounded-lg bg-paper px-3 py-2">
                <span>
                  {crew.code} · {crew.plate}
                </span>
                <span className="font-semibold">{count} courses</span>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => data.dispatch({ type: "CLOSE_MODAL" })}>
            Annuler
          </Button>
          <Button onClick={() => data.dispatch({ type: "SEND_LOMACO" })}>Envoyer</Button>
        </div>
      </Modal>
      <Modal
        open={data.modal === "closeDay"}
        onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
        title="Clôturer la journée ?"
        description="Le bilan s'affiche avec les kilomètres à vide, les retards et la comparaison à l'algorithme. Vous pourrez ensuite préparer demain."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => data.dispatch({ type: "CLOSE_MODAL" })}>
            Continuer
          </Button>
          <Button onClick={() => data.dispatch({ type: "CLOSE_DAY" })}>Clôturer</Button>
        </div>
      </Modal>
      <Modal
        open={data.modal === "help"}
        onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
        title="Comment réguler"
        description="Vous êtes le régulateur d'Ambux Rouen Métropole, de 6 h à 20 h."
      >
        <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed">
          <li>Glissez une course depuis « Transports non affectés » vers la ligne d'un équipage. Elle se cale sur un créneau libre.</li>
          <li>Hachures claires : trajet à vide. Hachures foncées : patient à bord. Aplat : prise en charge.</li>
          <li>Un patient allongé ne monte pas dans un VSL. Un chevauchement affiche « Conflit horaire ».</li>
          <li>Répondez aux appels : ajout, annulation, retard, panne, pause.</li>
          <li>Optimiser compare votre feuille à une recherche locale. Recalculer resserre les horaires. Lomaco est une démo.</li>
          <li>À 20 h, ou via Clôturer, le bilan s'ouvre. Préparez ensuite le planning du lendemain.</li>
        </ol>
        <p className="mt-3 text-xs text-muted">Raccourcis : espace pour la pause, 1 / 2 / 4 pour la vitesse.</p>
      </Modal>
    </>
  );
}

function OptimizerDialog({ open, nowMin }: { open: boolean; nowMin: number }) {
  const data = useData();
  const [result, setResult] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snap = useRef({ data, nowMin });
  useEffect(() => {
    snap.current = { data, nowMin };
  });

  useEffect(() => {
    if (!open) return;
    const current = snap.current;
    let cancel = false;
    const timer = window.setTimeout(() => {
      try {
        const plan = optimizePlan({
          crews: current.data.crews,
          transports: current.data.transports,
          blocks: current.data.blocks,
          locations: current.data.locations,
          nowMin: current.nowMin,
          seed: current.data.seed,
        });
        if (!cancel) setResult(plan);
      } catch {
        if (!cancel) setError("Le calcul n'a pas abouti. Réessayez.");
      }
    }, 40);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [open]);

  return (
    <Modal
      open={open}
      wide
      onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
      title="Optimiser les tournées"
      description="Recherche locale : insertions et échanges, fenêtres horaires, compatibilité allongé / VSL. Les courses déjà parties ne bougent pas."
    >
      {!result && !error && <p className="text-sm text-muted">Calcul des tournées…</p>}
      {error && <p className="text-sm text-rose-700">{error}</p>}
      {result && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2">Indicateur</th>
                  <th>Votre plan</th>
                  <th>Plan Ambux</th>
                </tr>
              </thead>
              <tbody>
                <Compare label="Km à vide" yours={formatKm(data.metrics.emptyKm)} algo={formatKm(result.metrics.emptyKm)} />
                <Compare
                  label="Transports planifiés"
                  yours={`${data.metrics.placed} / ${data.metrics.total}`}
                  algo={`${result.metrics.placed} / ${result.metrics.total}`}
                />
                <Compare label="Retards" yours={String(data.metrics.lateCount)} algo={String(result.metrics.lateCount)} />
                <Compare label="Taux de remplissage" yours={formatPct(data.metrics.fillRate)} algo={formatPct(result.metrics.fillRate)} />
                <Compare label="Score du plan" yours={`${data.metrics.planScore} / 84`} algo={`${result.metrics.planScore} / 84`} />
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            {result.tested.toLocaleString("fr-FR")} évaluations en {Math.round(result.elapsedMs)} ms.
            {result.metrics.emptyKm + 1 < data.metrics.emptyKm
              ? ` Gain estimé : ${formatKm(data.metrics.emptyKm - result.metrics.emptyKm)} à vide.`
              : " Votre feuille est déjà proche de cette heuristique."}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => data.dispatch({ type: "CLOSE_MODAL" })}>
              Garder mon plan
            </Button>
            <Button onClick={() => data.dispatch({ type: "APPLY_STOPS", stops: result.stops })}>
              Appliquer le plan optimisé
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Compare({ label, yours, algo }: { label: string; yours: string; algo: string }) {
  return (
    <tr className="border-t border-line">
      <td className="py-2 pr-3 font-medium">{label}</td>
      <td className="tabular-nums">{yours}</td>
      <td className="font-semibold tabular-nums text-brand">{algo}</td>
    </tr>
  );
}
