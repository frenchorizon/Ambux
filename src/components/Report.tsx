import { useEffect, useState } from "react";
import { useClock, useData } from "../game/context";
import { optimizePlan, type PlanResult } from "../game/optimizer";
import { DAY_START, MISSION_DATE } from "../game/types";
import { formatKm, formatPct, formatRegulation, personName } from "../lib/format";
import { Button } from "./ui/button";

export function Report() {
  const data = useData();
  const clock = useClock();
  const [bench, setBench] = useState<PlanResult | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancel = false;
    const timer = window.setTimeout(() => {
      try {
        const plan = optimizePlan({
          crews: data.crews,
          transports: data.transports,
          blocks: data.blocks,
          locations: data.locations,
          nowMin: DAY_START,
          seed: data.seed + 11,
        });
        if (!cancel) setBench(plan);
      } catch {
        if (!cancel) setFailed(true);
      }
    }, 60);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [data.blocks, data.crews, data.locations, data.seed, data.transports]);

  const late = data.transports
    .map((transport) => {
      const leg = [...data.schedules.values()]
        .flatMap((schedule) => schedule.legs)
        .find((item) => item.transportId === transport.id);
      return leg && leg.lateMin >= 5 ? { transport, late: leg.lateMin } : null;
    })
    .filter((item): item is { transport: (typeof data.transports)[number]; late: number } => Boolean(item))
    .sort((a, b) => b.late - a.late)
    .slice(0, 5);

  return (
    <div className="min-h-dvh bg-paper px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Bilan de régulation</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Journée clôturée</h1>
            <p className="mt-1 max-w-xl text-sm text-muted">
              {data.issues.length
                ? `${data.issues.length} point${data.issues.length > 1 ? "s" : ""} à contrôler.`
                : "Rien à contrôler sur la feuille engagée."}
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Km à vide"
            value={formatKm(data.metrics.emptyKm)}
            detail={`départ ${formatKm(data.stats.baselineEmptyKm)}`}
          />
          <Stat
            label="Transports planifiés"
            value={`${data.metrics.placed} / ${data.metrics.total}`}
            detail={`au poste : ${data.stats.baselinePlaced}`}
          />
          <Stat
            label="Hors créneau"
            value={String(data.metrics.lateCount)}
            detail={`${Math.round(data.metrics.lateMin)} min au-delà de la tolérance`}
          />
          <Stat label="Temps de régulation" value={formatRegulation(clock.regulationMs)} detail="horloge réelle" />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <article className="glass p-4">
            <h2 className="font-semibold">Votre feuille / référence algorithme</h2>
            <p className="mt-1 text-xs text-muted">Même demande, planning reconstruit par la recherche locale.</p>
            {!bench && !failed && <p className="mt-4 text-sm text-muted">Calcul de la référence…</p>}
            {failed && <p className="mt-4 text-sm text-alert">La référence n'a pas pu être calculée.</p>}
            {bench && (
              <table className="mt-3 w-full text-sm">
                <tbody>
                  <Row label="Km à vide" a={formatKm(data.metrics.emptyKm)} b={formatKm(bench.metrics.emptyKm)} />
                  <Row
                    label="Taux de remplissage"
                    a={formatPct(data.metrics.fillRate)}
                    b={formatPct(bench.metrics.fillRate)}
                  />
                  <Row label="Courses placées" a={String(data.metrics.placed)} b={String(bench.metrics.placed)} />
                  <Row label="Hors créneau" a={String(data.metrics.lateCount)} b={String(bench.metrics.lateCount)} />
                </tbody>
              </table>
            )}
            {bench && (
              <p className="mt-3 text-sm">
                {bench.metrics.emptyKm + 1 < data.metrics.emptyKm
                  ? `L'algorithme économise ${formatKm(data.metrics.emptyKm - bench.metrics.emptyKm)} à vide sur cette demande.`
                  : "Le planning affiché rejoint l'heuristique, ou fait mieux, sur les kilomètres à vide."}
              </p>
            )}
          </article>
          <article className="glass p-4">
            <h2 className="font-semibold">Ce que la journée a demandé</h2>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Mouvements manuels : {data.stats.moves}</li>
              <li>
                Optimiseur consulté : {data.stats.optimizerUsed ? "oui" : "non"}
                {data.stats.optimizerApplied ? ", plan appliqué" : ""}
              </li>
              <li>
                Appels traités : {data.stats.callsHandled} · manqués : {data.stats.callsMissed}
              </li>
              <li>Exports CSV : {data.stats.lomacoSends}</li>
              <li>Remplissage : {formatPct(data.metrics.fillRate)}</li>
            </ul>
            {late.length > 0 && (
              <>
                <h3 className="mt-4 text-sm font-semibold">Retards les plus nets</h3>
                <ul className="mt-1 space-y-1 text-sm text-muted">
                  {late.map((item) => {
                    const patient = data.patientById.get(item.transport.patientId);
                    return (
                      <li key={item.transport.id}>
                        {patient ? personName(patient) : "Patient"} · +{Math.round(item.late)} min
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </article>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => data.dispatch({ type: "REVIEW", view: "tomorrow" })}>
            Préparer le planning de demain
          </Button>
          <Button variant="secondary" onClick={() => data.dispatch({ type: "REPLAY" })}>
            Retour à l'accueil
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">{MISSION_DATE} · la simulation ne remplace pas le planning exporté.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="glass p-3">
      <div className="text-[13px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{detail}</div>
    </article>
  );
}

function Row({ label, a, b }: { label: string; a: string; b: string }) {
  return (
    <tr className="border-t border-line">
      <td className="py-1.5">{label}</td>
      <td className="text-right tabular-nums">{a}</td>
      <td className="text-right font-semibold tabular-nums text-brand">{b}</td>
    </tr>
  );
}
