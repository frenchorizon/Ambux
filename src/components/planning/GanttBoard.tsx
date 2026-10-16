import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useClock, useData } from "../../game/context";
import { displayedDepart, snap5, visualParts, type Leg } from "../../game/schedule";
import { DAY_END, DAY_START, type Crew, type Transport } from "../../game/types";
import { deviationLabel, formatKm, formatMin, kindLabel, personName, postureLabel } from "../../lib/format";
import { mealIssue } from "../../game/breaks";
import { useNarrow } from "../../lib/useMedia";
import { cn } from "../../lib/utils";
import type { DragState } from "./drag";

export function GanttBoard({
  drag,
  pendingId,
  pxPerMin,
  query,
  onStart,
}: {
  drag: DragState | null;
  pendingId: string | null;
  pxPerMin: number;
  query: string;
  onStart: (transportId: string, event: PointerEvent<HTMLElement>) => void;
}) {
  const data = useData();
  const { nowMin } = useClock();
  const narrow = useNarrow();
  const label = narrow ? 104 : 156;
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = (DAY_END - DAY_START) * pxPerMin;
  const [tip, setTip] = useState<{ x: number; y: number; transportId: string } | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !data.followNow) return;
    const left = label + (nowMin - DAY_START) * pxPerMin - node.clientWidth * 0.35;
    node.scrollLeft = Math.max(0, left);
  }, [data.followNow, label, nowMin, pxPerMin]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const blockOnly = (event: Event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".gantt-block")) event.preventDefault();
    };
    node.addEventListener("selectstart", blockOnly);
    node.addEventListener("contextmenu", blockOnly);
    return () => {
      node.removeEventListener("selectstart", blockOnly);
      node.removeEventListener("contextmenu", blockOnly);
    };
  }, []);

  const tipTransport = tip ? data.transportById.get(tip.transportId) : undefined;
  const tipLeg = tipTransport
    ? [...data.schedules.values()]
        .flatMap((schedule) => schedule.legs)
        .find((leg) => leg.transportId === tipTransport.id)
    : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white">
      <div ref={scrollRef} className="gantt-scroll min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: label + width }}>
          <div className="sticky top-0 z-30 flex border-b border-line bg-white">
            <div
              className="sticky left-0 z-40 flex items-end border-r border-line bg-white px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
              style={{ width: label }}
            >
              Équipage
            </div>
            <div className="relative h-9" style={{ width }}>
              {hours().map((hour) => (
                <div
                  key={hour}
                  className="absolute top-0 flex h-full items-end border-l border-line/80 pb-1 pl-1 text-[11px] font-semibold text-muted"
                  style={{ left: (hour * 60 - DAY_START) * pxPerMin }}
                >
                  {String(hour).padStart(2, "0")} h
                </div>
              ))}
            </div>
          </div>
          {data.crews
            .filter((crew) => !data.crewFilter || crew.id === data.crewFilter)
            .map((crew) => (
              <CrewRow
                key={crew.id}
                crew={crew}
                width={width}
                label={label}
                pxPerMin={pxPerMin}
                query={query}
                drag={drag}
                pendingId={pendingId}
                onStart={onStart}
                onTip={(next) => setTip(next)}
              />
            ))}
          {data.live && (
            <div
              className="pointer-events-none absolute bottom-0 z-20 w-px bg-rose-500"
              style={{ left: label + (nowMin - DAY_START) * pxPerMin, top: 36 }}
            >
              <span className="absolute -left-5 top-0 rounded bg-rose-500 px-1 py-0.5 text-[10px] font-bold text-white">
                {formatMin(nowMin, "floor")}
              </span>
            </div>
          )}
        </div>
      </div>
      {tip && tipTransport && !drag?.moved && !narrow && (
        <div
          className="pointer-events-none fixed z-[60] w-64 rounded-xl border border-line bg-white p-3 text-xs shadow-xl"
          style={{
            left: Math.min(tip.x + 12, window.innerWidth - 280),
            top: Math.min(tip.y + 12, window.innerHeight - 180),
          }}
        >
          <TipBody transport={tipTransport} leg={tipLeg} />
        </div>
      )}
    </div>
  );
}

function CrewRow({
  crew,
  width,
  label,
  pxPerMin,
  query,
  drag,
  pendingId,
  onStart,
  onTip,
}: {
  crew: Crew;
  width: number;
  label: number;
  pxPerMin: number;
  query: string;
  drag: DragState | null;
  pendingId: string | null;
  onStart: (transportId: string, event: PointerEvent<HTMLElement>) => void;
  onTip: (tip: { x: number; y: number; transportId: string } | null) => void;
}) {
  const { schedules, blocks, transports, selectedId, patientById, rules } = useData();
  const schedule = schedules.get(crew.id);
  const crewBlocks = blocks.filter((block) => block.crewId === crew.id);
  const meal = crewBlocks.find((block) => block.kind === "repas");
  const mealWarn = mealIssue(meal, rules);
  const needle = query.trim().toLowerCase();
  const legs = (schedule?.legs ?? []).filter((leg) => {
    if (!needle) return true;
    const transport = transports.find((item) => item.id === leg.transportId);
    const patient = transport ? patientById.get(transport.patientId) : undefined;
    const name = patient ? personName(patient).toLowerCase() : "";
    return name.includes(needle) || (transport?.dossier.toLowerCase().includes(needle) ?? false);
  });
  if (needle && legs.length === 0) return null;
  const hot = drag?.hoverCrewId === crew.id;
  const bad = hot && drag.preview && !drag.preview.ok;
  const rowH = label < 120 ? 76 : 64;
  const barH = label < 120 ? 44 : 34;
  const barTop = Math.round((rowH - barH) / 2);
  const family = crew.driver.split(" ").slice(-1)[0] ?? crew.driver;
  return (
    <div className="flex border-b border-line">
      <div
        className="sticky left-0 z-20 flex items-center gap-1.5 border-r border-line bg-white px-1.5"
        style={{ width: label, height: rowH }}
        title={`${crew.driver}${crew.mate ? ` · ${crew.mate}` : ""} · ${formatMin(crew.shiftStart)}–${formatMin(crew.shiftEnd)}`}
      >
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: crew.color }} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight">{crew.code}</span>
          <span className="block truncate text-[11px] leading-tight text-ink">{family}</span>
          {mealWarn && <span className="block truncate text-[10px] text-amber-800">{mealWarn}</span>}
        </span>
      </div>
      <div
        data-track
        data-crew-id={crew.id}
        data-vehicle={crew.vehicleType}
        className={cn("relative", hot && !bad && "bg-emerald-50/70", bad && "bg-rose-50")}
        style={{ width, height: rowH }}
      >
        {hours().map((hour) => (
          <div
            key={hour}
            className="absolute inset-y-0 border-l border-line/70"
            style={{ left: (hour * 60 - DAY_START) * pxPerMin }}
          />
        ))}
        {crewBlocks.map((block) => (
          <div
            key={block.id}
            title={block.kind === "repas" ? "Pause repas obligatoire" : block.label}
            className={cn(
              "absolute flex items-center overflow-hidden rounded-md px-1 text-[10px] font-semibold",
              block.kind === "repas"
                ? "border border-amber-500 bg-amber-100 text-amber-950"
                : "border border-dashed border-slate-400 bg-slate-200/90 text-slate-700",
            )}
            style={{
              top: barTop,
              height: barH,
              left: (block.startMin - DAY_START) * pxPerMin,
              width: Math.max(8, (block.endMin - block.startMin) * pxPerMin),
            }}
          >
            {block.kind === "repas" ? "Repas" : block.label}
          </div>
        ))}
        {schedule && schedule.returnKm > 0.2 && (
          <div
            title={`Retour dépôt à vide · ${formatKm(schedule.returnKm, 1)}`}
            className="seg-deadhead absolute overflow-hidden rounded-md border border-slate-300"
            style={{
              top: barTop,
              height: barH,
              left: (schedule.returnStart - DAY_START) * pxPerMin,
              width: Math.max(8, (schedule.returnEnd - schedule.returnStart) * pxPerMin),
              backgroundColor: "#dbe4ee",
            }}
          />
        )}
        {legs.map((leg) => {
          const transport = transports.find((item) => item.id === leg.transportId);
          if (!transport) return null;
          const patient = patientById.get(transport.patientId);
          const left = (leg.departMin - DAY_START) * pxPerMin;
          const span = Math.max(1, leg.endMin - leg.departMin);
          const bar = Math.max(5, span * pxPerMin);
          const selected = selectedId === transport.id;
          const dragging = drag?.transportId === transport.id;
          const pending = pendingId === transport.id && !dragging;
          const off = Math.abs(leg.deviationMin) >= 5;
          const parts = visualParts(leg);
          const name = patient?.lastName.toUpperCase() ?? "Course";
          return (
            <span key={leg.transportId} className="contents">
              <button
                type="button"
                draggable={false}
                className={cn(
                  "gantt-block absolute rounded-md border border-black/15 text-left text-[11px] font-semibold text-white shadow-sm",
                  pending && "gantt-pending",
                  dragging && "gantt-dragging",
                  leg.conflict || leg.incompatible
                    ? "ring-2 ring-rose-600"
                    : leg.lateMin >= 1
                      ? "ring-2 ring-amber-500"
                      : "",
                  selected && "outline outline-2 outline-offset-1 outline-navy",
                )}
                style={{
                  left,
                  width: bar,
                  top: barTop,
                  height: barH,
                  background: "color-mix(in srgb, var(--crew) 16%, transparent)",
                  ["--crew" as string]: crew.color,
                  transform: dragging ? `translate(${drag.dx}px, ${drag.dy}px) scale(1.045)` : undefined,
                  zIndex: dragging ? 25 : undefined,
                }}
                data-armed={dragging && !drag.moved ? "1" : undefined}
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
                data-transport-id={transport.id}
                data-posture={transport.posture}
                data-depart={displayedDepart(leg.departMin)}
                data-end={Math.round(leg.endMin)}
                data-appointment={Math.round(transport.appointmentMin ?? transport.windowStart)}
                onPointerDown={(event) => onStart(transport.id, event)}
                onMouseEnter={(event) => onTip({ x: event.clientX, y: event.clientY, transportId: transport.id })}
                onMouseLeave={() => onTip(null)}
              >
                <span className="gantt-hit" aria-hidden />
                <span className="gantt-block-clip">
                  {parts.map((part) => {
                    const minutes = part.end - part.start;
                    const wide = minutes * pxPerMin > 42;
                    return (
                      <span
                        key={part.kind}
                        data-seg={part.kind}
                        data-minutes={Math.round(minutes)}
                        className={cn(
                          "absolute inset-y-0 overflow-hidden",
                          part.kind === "vide" && "seg-vide",
                          part.kind === "pec" && "seg-pec",
                          part.kind === "charge" && "seg-charge",
                        )}
                        style={{
                          left: `${((part.start - leg.departMin) / span) * 100}%`,
                          width: `${(minutes / span) * 100}%`,
                        }}
                      >
                        {part.kind === "charge" && wide && (
                          <span className="pointer-events-none absolute inset-0 flex items-center px-1">
                            <span className="truncate">
                              {name}
                              {transport.priority === "urgent" ? " · URG" : ""}
                            </span>
                          </span>
                        )}
                      </span>
                    );
                  })}
                  {leg.kmEstimated && (
                    <span
                      title="Durée estimée : le routage n'a pas répondu"
                      className="pointer-events-none absolute right-0.5 top-0.5 z-10 h-1.5 w-1.5 rounded-full bg-rose-600"
                    />
                  )}
                </span>
              </button>
              {off && (
                <span
                  key={`dev-${leg.transportId}`}
                  className="pointer-events-none absolute z-10 rounded bg-amber-500 px-1 text-[10px] font-bold leading-4 text-white"
                  style={{ left: left + Math.max(0, bar - 42), top: 2 }}
                >
                  {deviationLabel(leg.deviationMin)}
                </span>
              )}
            </span>
          );
        })}
        {legs.map((leg) => {
          const transport = transports.find((item) => item.id === leg.transportId);
          if (!transport) return null;
          const planned = transport.appointmentMin ?? transport.windowStart;
          return (
            <div
              key={`ghost-${leg.transportId}`}
              title={`Heure prévue ${formatMin(planned)}`}
              className="pointer-events-none absolute top-1 z-10 h-3 w-px bg-navy"
              style={{ left: (planned - DAY_START) * pxPerMin }}
            >
              <span className="absolute -left-1 top-0 h-2 w-2 rounded-sm bg-navy" />
            </div>
          );
        })}
        {drag?.moved && drag.hoverCrewId === crew.id && drag.preview?.ok && (
          <div
            data-preview="ok"
            className="pointer-events-none absolute rounded-md border-2 border-white/80 opacity-80"
            style={{
              top: barTop,
              height: barH,
              left: (drag.preview.departMin - DAY_START) * pxPerMin,
              width: Math.max(8, (drag.preview.leg.endMin - drag.preview.departMin) * pxPerMin),
              background: crew.color,
            }}
          />
        )}
        {drag?.moved && drag.hoverCrewId === crew.id && drag.preview && !drag.preview.ok && (
          <div
            data-preview="invalid"
            data-reason={drag.preview.message}
            title={drag.preview.message}
            className="pointer-events-none absolute rounded-md border-2 border-rose-700 bg-rose-400/80"
            style={{
              top: barTop,
              height: barH,
              left: (snap5(drag.hoverMinute ?? DAY_START) - DAY_START) * pxPerMin,
              width: Math.max(8, ghostSpan(schedules, drag.transportId) * pxPerMin),
            }}
          />
        )}
      </div>
    </div>
  );
}

function TipBody({ transport, leg }: { transport: Transport; leg?: Leg }) {
  const { patientById, locMap } = useData();
  const patient = patientById.get(transport.patientId);
  const from = locMap.get(transport.pickupId);
  const to = locMap.get(transport.dropoffId);
  return (
    <div>
      <div className="font-semibold text-ink">{patient ? personName(patient) : "Patient"}</div>
      <div className="mt-0.5 text-muted">
        {postureLabel(transport.posture)} · {kindLabel(transport.kind)} · {transport.dossier}
      </div>
      <div className="mt-2 text-ink">
        {from?.short ?? "Départ"} → {to?.short ?? "Arrivée"}
      </div>
      <div className="mt-1 text-muted">
        Rendez-vous {formatMin(transport.appointmentMin ?? transport.windowStart)} · tolérance ±
        {transport.toleranceMin ?? 20} min
        {(transport.stayMin ?? 0) > 0 ? ` · attente établissement ${transport.stayMin} min` : ""}
      </div>
      {leg && (
        <div className="mt-1 text-ink">
          vide {leg.deadheadMin} min / PEC {leg.pecMin} min / trajet {leg.loadedMin} min / dépose {leg.dropoffMin} min ·{" "}
          {formatKm(leg.deadheadKm + leg.loadedKm, 1)}
          {leg.kmEstimated ? " · estimé" : ""}
        </div>
      )}
      {leg && Math.abs(leg.deviationMin) >= 1 && (
        <div className={cn("mt-1 font-semibold", leg.lateMin >= 1 ? "text-amber-700" : "text-navy")}>
          Écart au rendez-vous : {deviationLabel(leg.deviationMin)}
        </div>
      )}
      {leg?.conflict && <div className="mt-1 font-semibold text-rose-700">Conflit horaire</div>}
      {leg?.incompatible && <div className="mt-1 font-semibold text-rose-700">Incompatibilité VSL</div>}
      {transport.note && <div className="mt-1 text-muted">{transport.note}</div>}
    </div>
  );
}

function ghostSpan(
  schedules: { values(): Iterable<{ legs: { transportId: string; departMin: number; endMin: number }[] }> },
  transportId: string,
): number {
  for (const schedule of schedules.values()) {
    const leg = schedule.legs.find((item) => item.transportId === transportId);
    if (leg) return Math.max(8, leg.endMin - leg.departMin);
  }
  return 40;
}

function hours(): number[] {
  const list: number[] = [];
  for (let hour = 6; hour <= 20; hour++) list.push(hour);
  return list;
}
