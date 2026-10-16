import { useMemo, useState, type ReactNode } from "react";
import { useClock, useData } from "../../game/context";
import type { Leg } from "../../game/schedule";
import type { TimeBlock, Transport } from "../../game/types";
import { formatKm, formatMin, personName, postureLabel, vehicleLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import { printSheets } from "../RouteSheets";
import { useNarrow } from "../../lib/useMedia";

export function CrewSheet() {
  const data = useData();
  const clock = useClock();
  const narrow = useNarrow();
  const [crewId, setCrewId] = useState(data.crews[0]?.id ?? "");
  const crew = data.crews.find((item) => item.id === crewId) ?? data.crews[0];

  const schedule = crew ? data.schedules.get(crew.id) : undefined;
  const meal = crew ? data.blocks.find((block) => block.crewId === crew.id && block.kind === "repas") : undefined;
  const rows = useMemo(() => buildRows(schedule?.legs ?? [], meal), [meal, schedule?.legs]);
  const focus = pickFocus(rows, data.live ? clock.nowMin : -1);

  if (!crew) {
    return <p className="p-6 text-sm text-muted">Aucun équipage sur ce planning fictif.</p>;
  }

  const frame = (
    <article className="flex h-full min-h-0 flex-col bg-card text-ink" aria-labelledby="feuille-title">
      <header className="border-b border-line px-4 pb-3 pt-4">
        <button type="button" className="mb-2 text-sm font-semibold text-brand" onClick={() => data.dispatch({ type: "SET_VIEW", view: "gantt" })}>
          Retour au planning
        </button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Feuille de route · fictif</p>
        <h1 id="feuille-title" className="font-display text-2xl">{crew.code}</h1>
        <p className="text-sm text-muted">
          {vehicleLabel(crew.vehicleType)} {crew.plate} · {crew.driver}
          {crew.mate ? ` · ${crew.mate}` : ""}
        </p>
        <p className="mt-1 text-xs text-muted">{data.missionLabel} · {formatMin(crew.shiftStart)}–{formatMin(crew.shiftEnd)}</p>
        <button type="button" className="mt-2 text-sm font-semibold text-brand" onClick={() => printSheets(data, crew.id)}>
          Imprimer cette feuille
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {crew.dea && <Chip>DEA à bord</Chip>}
          {meal ? <Chip>Repas {formatMin(meal.startMin)}–{formatMin(meal.endMin)}</Chip> : <Chip>Repas non posé</Chip>}
        </div>
        <label className="mt-3 block text-xs font-semibold text-muted">
          Équipage
          <select
            className="mt-1 h-10 w-full rounded-xl border border-line bg-paper px-2 text-sm text-ink"
            value={crew.id}
            onChange={(event) => setCrewId(event.target.value)}
          >
            {data.crews.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.driver}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {focus?.kind === "leg" ? <Hero leg={focus.leg} transport={data.transportById.get(focus.leg.transportId)} data={data} live={data.live} /> : (
          <p className="rounded-2xl bg-ice px-4 py-5 text-sm">Aucune course sur cette feuille.</p>
        )}
        <ol className="mt-4 space-y-2">
          {rows.map((row) =>
            row.kind === "meal" ? (
              <li key={row.block.id} className="rounded-xl border border-dashed border-line px-3 py-2 text-sm">
                <span className="font-semibold tabular-nums">{formatMin(row.block.startMin)}</span>
                <span className="text-muted"> · Repas jusqu'à {formatMin(row.block.endMin)}</span>
              </li>
            ) : (
              <LegRow key={row.leg.transportId} leg={row.leg} data={data} active={focus?.kind === "leg" && focus.leg.transportId === row.leg.transportId} />
            ),
          )}
        </ol>
        <p className="mt-4 text-xs text-muted">
          Retour dépôt {formatKm(schedule?.returnKm ?? 0, 1)}
          {(schedule?.legs ?? []).some((leg) => leg.kmEstimated) ? " · certains kilomètres sont estimés" : ""}
        </p>
      </div>
      <footer className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-muted">
        Aide à la lecture pour l'équipage. Ce n'est pas un bon de transport, ni une pièce à présenter à un organisme. Patients inventés.
      </footer>
    </article>
  );

  if (narrow) return <div className="h-full bg-card">{frame}</div>;
  return (
    <div className="flex h-full items-center justify-center bg-paper p-6">
      <div className="h-[min(100%,820px)] w-[390px] overflow-hidden rounded-[2rem] border border-line shadow-xl">{frame}</div>
    </div>
  );
}

function Hero({
  leg,
  transport,
  data,
  live,
}: {
  leg: Leg;
  transport: Transport | undefined;
  data: ReturnType<typeof useData>;
  live: boolean;
}) {
  const patient = transport ? data.patientById.get(transport.patientId) : undefined;
  const from = transport ? data.locMap.get(transport.pickupId) : undefined;
  const to = transport ? data.locMap.get(transport.dropoffId) : undefined;
  return (
    <section className="rounded-2xl bg-navy px-4 py-4 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200">{live ? "Prochaine course" : "Première prise en charge"}</p>
      <p className="mt-1 font-display text-4xl tabular-nums">{formatMin(leg.departMin)}</p>
      <p className="mt-2 text-lg font-semibold">{patient ? personName(patient) : "Course"}</p>
      <p className="text-sm text-sky-100">{transport ? postureLabel(transport.posture) : ""}</p>
      <p className="mt-3 text-sm leading-relaxed">
        {from ? `${from.short}, ${from.city}` : "Départ"}
        <span className="text-sky-200"> → </span>
        {to ? `${to.short}, ${to.city}` : "Arrivée"}
      </p>
      {leg.kmEstimated && <p className="mt-2 text-xs text-amber-200">Km estimé, non opposable.</p>}
    </section>
  );
}

function LegRow({ leg, data, active }: { leg: Leg; data: ReturnType<typeof useData>; active: boolean }) {
  const transport = data.transportById.get(leg.transportId);
  const patient = transport ? data.patientById.get(transport.patientId) : undefined;
  const to = transport ? data.locMap.get(transport.dropoffId) : undefined;
  return (
    <li className={cn("rounded-xl border px-3 py-2 text-sm", active ? "border-brand bg-ice" : "border-line")}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tabular-nums">{formatMin(leg.departMin)}</span>
        <span className="text-xs text-muted">{formatKm(leg.loadedKm, 1)}{leg.kmEstimated ? " · estimé" : ""}</span>
      </div>
      <div>{patient ? personName(patient) : "Course"}</div>
      <div className="text-xs text-muted">{to ? `${to.short}, ${to.city}` : ""}</div>
    </li>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return <span className="rounded-full bg-ice px-2 py-1 text-[11px] font-semibold text-navy">{children}</span>;
}

type Row = { kind: "leg"; leg: Leg; at: number } | { kind: "meal"; block: TimeBlock; at: number };

function buildRows(legs: Leg[], meal: TimeBlock | undefined): Row[] {
  const rows: Row[] = legs.map((leg) => ({ kind: "leg", leg, at: leg.departMin }));
  if (meal) rows.push({ kind: "meal", block: meal, at: meal.startMin });
  rows.sort((a, b) => a.at - b.at);
  return rows;
}

function pickFocus(rows: Row[], nowMin: number): Extract<Row, { kind: "leg" }> | undefined {
  const legs = rows.filter((row): row is Extract<Row, { kind: "leg" }> => row.kind === "leg");
  if (nowMin < 0) return legs[0];
  return legs.find((row) => row.leg.endMin >= nowMin) ?? legs.at(-1);
}
