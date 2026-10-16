import { useEffect, useRef, useState } from "react";
import { useClock, useData } from "../game/context";
import { downloadCsv, planningToCsv } from "../game/csv";
import { optimizePlan, type PlanResult } from "../game/optimizer";
import { reviewIssues } from "../game/review";
import { scheduleFleet } from "../game/schedule";
import { formatKm } from "../lib/format";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import { LomacoExportPanel } from "./LomacoExport";
import { PlanningExport } from "./PlanningExport";
import { LomacoImportDialog } from "./LomacoImport";
import { RouteSheetsDialog } from "./RouteSheets";

export function GameDialogs() {
  const data = useData();
  const clock = useClock();
  return (
    <>
      <OptimizerDialog open={data.modal === "optimizer"} nowMin={data.live ? clock.nowMin : -1} />
      <RouteSheetsDialog open={data.modal === "sheets"} />
      <LomacoImportDialog open={data.modal === "import"} />
      <Modal
        open={data.modal === "lomaco"}
        onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
        title="Exporter"
        description="Planning CSV ou Excel, puis les feuilles à réimporter dans Lomaco. Aucun envoi : le fichier reste dans ce navigateur."
      >
        <PlanningExport />
        <LomacoExportPanel />
        <ul className="mb-4 space-y-1 text-sm">
          {data.crews.map((crew) => {
            const count = data.transports.filter(
              (transport) => transport.crewId === crew.id && !transport.cancelled,
            ).length;
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
        <p className="mb-3 text-xs text-muted">
          Les courses non placées sont dans le fichier avec le statut a_traiter. Les km estimés sont marqués estime.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => data.dispatch({ type: "CLOSE_MODAL" })}>
            Fermer
          </Button>
          <Button
            onClick={() => {
              downloadCsv(
                `ambux-planning-${data.missionIso}.csv`,
                planningToCsv({
                  crews: data.crews,
                  transports: data.transports,
                  patients: data.patientById,
                  locations: data.locMap,
                  schedules: data.schedules,
                  blocks: data.blocks,
                  missionIso: data.missionIso,
                }),
              );
              data.dispatch({ type: "NOTE_EXPORT" });
              data.dispatch({ type: "CLOSE_MODAL" });
            }}
          >
            Télécharger le CSV
          </Button>
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
        title="Préparer demain"
        description="Ambux construit le planning du lendemain. La simulation en direct est facultative."
      >
        <ol className="list-decimal space-y-2 pl-4 text-sm leading-relaxed">
          <li>Importer lit les exports Lomaco (xlsx, xls, csv), puis Générer le planning pose les tournées.</li>
          <li>Générer le planning affecte les équipages, pose la pause repas et compte les trajets à vide.</li>
          <li>
            Sur la timeline, déplacez une prise en charge : le carré marine est l'heure prévue, l'écart s'affiche en
            orange. Revenir à l'heure prévue recale le rendez-vous.
          </li>
          <li>
            Un allongé ne va pas en VSL. Un chevauchement affiche Conflit horaire. Une pause repas manquante est
            signalée sur la ligne.
          </li>
          <li>Exporter écrit une feuille par équipage (CSV, Excel ou PDF).</li>
          <li>Équipages, véhicules, patients et demande sont dans Réglages, rubrique Données. Le mode sombre aussi.</li>
        </ol>
        <div className="mt-4 rounded-xl bg-paper p-3">
          <p className="text-sm font-semibold">Démo</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Simuler la journée rejoue l'horloge et les appels. Elle ne remplace pas le planning.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {data.live ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    data.dispatch({ type: "SET_LIVE", live: false });
                    data.dispatch({ type: "CLOSE_MODAL" });
                  }}
                >
                  Quitter la simulation
                </Button>
                {data.phase === "playing" && (
                  <Button onClick={() => data.dispatch({ type: "OPEN_MODAL", modal: "closeDay" })}>
                    Clôturer la journée
                  </Button>
                )}
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  data.dispatch({ type: "SET_LIVE", live: true });
                  data.dispatch({ type: "CLOSE_MODAL" });
                }}
              >
                Simuler la journée
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                data.dispatch({ type: "CLOSE_MODAL" });
                data.dispatch({ type: "SET_VIEW", view: "feuille" });
              }}
            >
              Feuille équipage
            </Button>
          </div>
        </div>
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
          rules: current.data.rules,
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
      title="Générer le planning"
      description="Tolérance dure, pause repas, dialyse liée et DEA. Ce qui ne tient pas reste dans À contrôler."
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
                <Compare
                  label="Km à vide"
                  yours={formatKm(data.metrics.emptyKm)}
                  algo={formatKm(result.metrics.emptyKm)}
                />
                <Compare
                  label="Transports planifiés"
                  yours={`${data.metrics.placed} / ${data.metrics.total}`}
                  algo={`${result.metrics.placed} / ${result.metrics.total}`}
                />
                <Compare
                  label="Hors créneau"
                  yours={String(data.metrics.lateCount)}
                  algo={String(result.metrics.lateCount)}
                />
                <Compare
                  label="À traiter"
                  yours={String(data.issues.filter((issue) => issue.kind === "non_place").length)}
                  algo={String(result.unassignedIds.length)}
                />
              </tbody>
            </table>
          </div>
          <ProposedIssues result={result} />
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
            <Button onClick={() => data.dispatch({ type: "APPLY_STOPS", stops: result.stops, meals: result.meals })}>
              Appliquer ce planning
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function ProposedIssues({ result }: { result: PlanResult }) {
  const data = useData();
  const transports = data.transports.map((transport) => {
    const stop = result.stops.find((item) => item.transportId === transport.id);
    if (!stop) return { ...transport, crewId: undefined, departMin: undefined };
    return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
  });
  const blocks = [...data.blocks.filter((block) => block.kind !== "repas"), ...result.meals];
  const schedules = scheduleFleet(data.crews, transports, blocks, data.locMap);
  const issues = reviewIssues({
    crews: data.crews,
    transports,
    blocks,
    rules: data.rules,
    schedules,
    patients: data.patientById,
  })
    .filter((issue) => issue.kind !== "km_estime")
    .slice(0, 8);
  if (!issues.length) return <p className="mt-3 text-sm text-emerald-800">Rien à contrôler sur ce planning.</p>;
  return (
    <div className="mt-3">
      <h3 className="text-sm font-semibold">À contrôler</h3>
      <ul className="mt-1 max-h-36 space-y-1 overflow-auto text-xs">
        {issues.map((issue) => (
          <li key={issue.id} className="rounded-lg bg-amber-50 px-2 py-1 text-amber-950">
            {issue.title}
          </li>
        ))}
      </ul>
    </div>
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
