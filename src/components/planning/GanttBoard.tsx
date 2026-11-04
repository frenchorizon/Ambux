import { memo, useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useClock, useData } from "../../game/context";
import { displayedDepart, snap5, visualParts, type Leg } from "../../game/schedule";
import { DAY_END, DAY_START, type Crew, type Transport } from "../../game/types";
import { deviationLabel, formatKm, formatMin, kindLabel, personName, postureLabel } from "../../lib/format";
import { mealIssue } from "../../game/breaks";
import { useNarrow } from "../../lib/useMedia";
import { cn } from "../../lib/utils";
import { noteDrag, refusalMotif, type DragState } from "./drag";

export function GanttBoard({
  drag,
  pendingId,
  pxPerMin,
  query,
  onStart,
  dragNodeRef,
}: {
  drag: DragState | null;
  pendingId: string | null;
  pxPerMin: number;
  query: string;
  onStart: (transportId: string, event: PointerEvent<HTMLElement>) => void;
  dragNodeRef: { current: HTMLButtonElement | null };
}) {
  const data = useData();
  const { nowMin } = useClock();
  // Après le commit : StrictMode rappelle le corps sans peindre, on ne le compte pas.
  useEffect(() => {
    noteDrag("board");
  });
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

  const dragLive = useRef(drag);
  dragLive.current = drag;
  const onTip = useCallback((next: { x: number; y: number; transportId: string } | null) => {
    if (dragLive.current) return;
    setTip(next);
  }, []);

  const tipTransport = tip ? data.transportById.get(tip.transportId) : undefined;
  const tipLeg = tipTransport
    ? [...data.schedules.values()]
        .flatMap((schedule) => schedule.legs)
        .find((leg) => leg.transportId === tipTransport.id)
    : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-card">
      <div ref={scrollRef} className="gantt-scroll min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: label + width }}>
          <div className="sticky top-0 z-30 flex border-b border-line bg-card">
            <div
              className="sticky left-0 z-40 flex items-end border-r border-line bg-card px-2 pb-2 text-[13px] font-semibold uppercase tracking-wide text-muted"
              style={{ width: label }}
            >
              Équipage
            </div>
            <div className="relative h-9" style={{ width }}>
              {hours().map((hour) => (
                <div
                  key={hour}
                  className="absolute top-0 flex h-full items-end border-l border-line/80 pb-1 pl-1 text-[13px] font-semibold text-muted"
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
                ownsDrag={Boolean(
                  drag?.transportId &&
                  data.schedules.get(crew.id)?.legs.some((leg) => leg.transportId === drag.transportId),
                )}
                dragNodeRef={dragNodeRef}
                onStart={onStart}
                onTip={onTip}
              />
            ))}
          {data.live && (
            <div
              className="pointer-events-none absolute bottom-0 z-20 w-px bg-alert-strong"
              style={{ left: label + (nowMin - DAY_START) * pxPerMin, top: 36 }}
            >
              <span className="absolute -left-5 top-0 rounded bg-alert-strong px-1 py-0.5 text-[13px] font-bold text-white">
                {formatMin(nowMin, "floor")}
              </span>
            </div>
          )}
        </div>
      </div>
      {tip && tipTransport && !drag?.moved && !narrow && (
        <div
          className="pointer-events-none fixed z-[60] w-64 rounded-xl border border-line bg-card p-3 text-xs shadow-xl"
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

type CrewRowProps = {
  crew: Crew;
  width: number;
  label: number;
  pxPerMin: number;
  query: string;
  drag: DragState | null;
  pendingId: string | null;
  ownsDrag: boolean;
  dragNodeRef: { current: HTMLButtonElement | null };
  onStart: (transportId: string, event: PointerEvent<HTMLElement>) => void;
  onTip: (tip: { x: number; y: number; transportId: string } | null) => void;
};

function sameCrewRow(prev: CrewRowProps, next: CrewRowProps): boolean {
  if (prev.crew !== next.crew) return false;
  if (prev.width !== next.width || prev.label !== next.label || prev.pxPerMin !== next.pxPerMin) return false;
  if (prev.query !== next.query || prev.pendingId !== next.pendingId) return false;
  if (prev.onStart !== next.onStart || prev.onTip !== next.onTip || prev.dragNodeRef !== next.dragNodeRef) return false;
  if (prev.ownsDrag !== next.ownsDrag) return false;
  return sameRowDrag(prev.crew.id, prev.drag, next.drag, prev.ownsDrag);
}

function sameRowDrag(crewId: string, prev: DragState | null, next: DragState | null, owns: boolean): boolean {
  if (owns && ((prev?.moved ?? false) !== (next?.moved ?? false) || prev?.transportId !== next?.transportId))
    return false;
  const prevHot = Boolean(prev?.moved && prev.hoverCrewId === crewId);
  const nextHot = Boolean(next?.moved && next.hoverCrewId === crewId);
  if (prevHot !== nextHot) return false;
  if (!prevHot && !nextHot) return true;
  return prev?.previewKey === next?.previewKey && Boolean(prev?.preview?.ok) === Boolean(next?.preview?.ok);
}

const CrewRow = memo(function CrewRow({
  crew,
  width,
  label,
  pxPerMin,
  query,
  drag,
  pendingId,
  dragNodeRef,
  onStart,
  onTip,
}: CrewRowProps) {
  const { schedules, blocks, transports, selectedId, patientById, rules } = useData();
  useEffect(() => {
    noteDrag("row");
  });
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
        className="sticky left-0 z-20 flex items-center gap-1.5 border-r border-line bg-card px-1.5"
        style={{ width: label, height: rowH }}
        title={`${crew.driver}${crew.mate ? ` · ${crew.mate}` : ""} · ${formatMin(crew.shiftStart)}–${formatMin(crew.shiftEnd)}`}
      >
        <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: crew.color }} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight">{crew.code}</span>
          <span className="block truncate text-[13px] leading-tight text-ink">{family}</span>
          {mealWarn && <span className="block truncate text-[13px] text-alert">{mealWarn}</span>}
        </span>
      </div>
      <div
        data-track
        data-crew-id={crew.id}
        data-vehicle={crew.vehicleType}
        className={cn("relative", hot && !bad && "bg-teal/15", bad && "bg-alert-soft")}
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
              "absolute flex items-center overflow-hidden rounded-md px-1 text-[13px] font-semibold",
              block.kind === "repas"
                ? "border border-meal bg-meal text-meal-ink"
                : "border border-dashed border-line bg-ice text-muted",
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
            className="seg-deadhead absolute overflow-hidden rounded-md border border-line"
            style={{
              top: barTop,
              height: barH,
              left: (schedule.returnStart - DAY_START) * pxPerMin,
              width: Math.max(8, (schedule.returnEnd - schedule.returnStart) * pxPerMin),
              backgroundColor: "var(--color-ice)",
            }}
          />
        )}
        {legs.map((leg) => {
          const transport = transports.find((item) => item.id === leg.transportId);
          if (!transport) return null;
          const patient = patientById.get(transport.patientId);
          const shownDepart = displayedDepart(leg.departMin);
          const left = (shownDepart - DAY_START) * pxPerMin;
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
                  "gantt-block absolute rounded-md border border-black/15 text-left text-[13px] font-semibold text-white shadow-sm",
                  pending && "gantt-pending",
                  dragging && "gantt-dragging",
                  (leg.conflict || leg.incompatible || leg.lateMin >= 1) && "ring-2 ring-alert",
                  selected && "outline outline-2 outline-offset-1 outline-navy",
                )}
                ref={
                  dragging
                    ? (node) => {
                        dragNodeRef.current = node;
                      }
                    : undefined
                }
                style={{
                  left,
                  width: bar,
                  top: barTop,
                  height: barH,
                  background: "color-mix(in srgb, var(--crew) 16%, transparent)",
                  ["--crew" as string]: crew.color,
                  zIndex: dragging ? 25 : undefined,
                }}
                data-armed={dragging && !drag.moved ? "1" : undefined}
                onContextMenu={(event) => event.preventDefault()}
                onDragStart={(event) => event.preventDefault()}
                data-transport-id={transport.id}
                data-posture={transport.posture}
                data-depart={shownDepart}
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
                      className="pointer-events-none absolute right-0.5 top-0.5 z-10 h-1.5 w-1.5 rounded-full bg-alert-strong"
                    />
                  )}
                </span>
              </button>
              {off && (
                <span
                  key={`dev-${leg.transportId}`}
                  className="pointer-events-none absolute z-10 rounded bg-alert-strong px-1 text-[13px] font-bold leading-4 text-white"
                  style={{ left: left + Math.max(0, bar - 42), top: 2 }}
                >
                  {deviationLabel(leg.deviationMin)}
                </span>
              )}
              {(transport.stayMin ?? 0) > 0 && (
                <span
                  className="gantt-stay pointer-events-none absolute z-10 max-w-24 truncate text-[13px] font-semibold leading-none text-navy"
                  style={{ left, top: barTop + barH + 1 }}
                  data-stay={transport.stayMin}
                >
                  attente {transport.stayMin} min
                </span>
              )}
            </span>
          );
        })}
        {drag?.moved && drag.hoverCrewId === crew.id && drag.preview && (
          <DragGhost
            drag={drag}
            minutes={ghostSpan(schedules, drag.transportId)}
            pxPerMin={pxPerMin}
            top={barTop}
            height={barH}
          />
        )}
      </div>
    </div>
  );
}, sameCrewRow);

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
        <div className={cn("mt-1 font-semibold", leg.lateMin >= 1 ? "text-alert" : "text-navy")}>
          Écart au rendez-vous : {deviationLabel(leg.deviationMin)}
        </div>
      )}
      {leg?.conflict && <div className="mt-1 font-semibold text-alert">Conflit horaire</div>}
      {leg?.incompatible && <div className="mt-1 font-semibold text-alert">Incompatibilité VSL</div>}
      {transport.note && <div className="mt-1 text-muted">{transport.note}</div>}
    </div>
  );
}

function DragGhost({
  drag,
  minutes,
  pxPerMin,
  top,
  height,
}: {
  drag: DragState;
  minutes: number;
  pxPerMin: number;
  top: number;
  height: number;
}) {
  const preview = drag.preview;
  if (!preview) return null;
  const minute = preview.ok ? preview.departMin : snap5(drag.hoverMinute ?? DAY_START);
  const refused = !preview.ok;
  return (
    <div
      data-ghost=""
      data-preview={refused ? "invalid" : "ok"}
      data-depart={minute}
      data-reason={refused ? preview.message : undefined}
      title={refused ? preview.message : `Prise en charge ${formatMin(minute)}`}
      className="gantt-ghost pointer-events-none absolute"
      style={{
        top,
        height,
        left: (minute - DAY_START) * pxPerMin,
        width: Math.max(8, minutes * pxPerMin),
      }}
    >
      <span className="truncate">{formatMin(minute)}</span>
      {!preview.ok && <span className="truncate">{refusalMotif(preview)}</span>}
    </div>
  );
}

function ghostSpan(
  schedules: { values(): Iterable<{ legs: { transportId: string; departMin: number; endMin: number }[] }> },
  transportId: string,
): number {
  for (const schedule of schedules.values()) {
    const leg = schedule.legs.find((item) => item.transportId === transportId);
    if (leg) return Math.max(1, leg.endMin - leg.departMin);
  }
  return 40;
}

function hours(): number[] {
  const list: number[] = [];
  for (let hour = 6; hour <= 20; hour++) list.push(hour);
  return list;
}
