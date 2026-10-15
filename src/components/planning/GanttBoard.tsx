import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useClock, useData } from "../../game/context";
import type { Leg } from "../../game/schedule";
import { DAY_END, DAY_START, type Crew, type Transport } from "../../game/types";
import { formatKm, formatMin, kindLabel, personName, postureLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import type { DragState } from "./drag";

const LABEL = 188;

export function GanttBoard({
  drag,
  pxPerMin,
  onStart,
}: {
  drag: DragState | null;
  pxPerMin: number;
  onStart: (transportId: string, event: PointerEvent<HTMLElement>) => void;
}) {
  const data = useData();
  const { nowMin } = useClock();
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = (DAY_END - DAY_START) * pxPerMin;
  const [tip, setTip] = useState<{ x: number; y: number; transportId: string } | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !data.followNow) return;
    const left = LABEL + (nowMin - DAY_START) * pxPerMin - node.clientWidth * 0.35;
    node.scrollLeft = Math.max(0, left);
  }, [data.followNow, nowMin, pxPerMin]);

  const tipTransport = tip ? data.transportById.get(tip.transportId) : undefined;
  const tipLeg = tipTransport
    ? [...data.schedules.values()].flatMap((schedule) => schedule.legs).find((leg) => leg.transportId === tipTransport.id)
    : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white">
      <div ref={scrollRef} className="gantt-scroll min-h-0 flex-1 overflow-auto">
        <div className="relative" style={{ width: LABEL + width }}>
          <div className="sticky top-0 z-30 flex border-b border-line bg-white">
            <div
              className="sticky left-0 z-40 flex items-end border-r border-line bg-white px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
              style={{ width: LABEL }}
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
          {data.crews.map((crew) => (
            <CrewRow
              key={crew.id}
              crew={crew}
              width={width}
              pxPerMin={pxPerMin}
              drag={drag}
              onStart={onStart}
              onTip={(next) => setTip(next)}
            />
          ))}
          <div
            className="pointer-events-none absolute bottom-0 z-20 w-px bg-rose-500"
            style={{ left: LABEL + (nowMin - DAY_START) * pxPerMin, top: 36 }}
          >
            <span className="absolute -left-5 top-0 rounded bg-rose-500 px-1 py-0.5 text-[10px] font-bold text-white">
              {formatMin(nowMin, "floor")}
            </span>
          </div>
        </div>
      </div>
      {tip && tipTransport && !drag?.moved && (
        <div
          className="pointer-events-none fixed z-[60] w-64 rounded-xl border border-line bg-white p-3 text-xs shadow-xl"
          style={{ left: Math.min(tip.x + 12, window.innerWidth - 280), top: Math.min(tip.y + 12, window.innerHeight - 180) }}
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
  pxPerMin,
  drag,
  onStart,
  onTip,
}: {
  crew: Crew;
  width: number;
  pxPerMin: number;
  drag: DragState | null;
  onStart: (transportId: string, event: PointerEvent<HTMLElement>) => void;
  onTip: (tip: { x: number; y: number; transportId: string } | null) => void;
}) {
  const { schedules, blocks, transports, crewFilter, selectedId, patientById } = useData();
  const schedule = schedules.get(crew.id);
  const crewBlocks = blocks.filter((block) => block.crewId === crew.id);
  const count = schedule?.legs.length ?? 0;
  const hot = drag?.hoverCrewId === crew.id;
  const bad = hot && drag.preview && !drag.preview.ok && drag.preview.reason === "incompatible";
  return (
    <div className={cn("flex border-b border-line", crewFilter && crewFilter !== crew.id && "opacity-35")}>
      <div
        className="sticky left-0 z-20 flex items-center gap-2 border-r border-line bg-white px-2.5"
        style={{ width: LABEL, height: 46 }}
      >
        <span className="h-7 w-1.5 rounded-full" style={{ background: crew.color }} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-sm font-semibold">{crew.code}</span>
            <Badge className={crew.vehicleType === "ambulance" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"}>
              {crew.vehicleType === "ambulance" ? "AMB" : "VSL"}
            </Badge>
          </span>
          <span className="block truncate text-[11px] text-muted">
            {crew.plate} · {count} course{count > 1 ? "s" : ""}
          </span>
        </span>
      </div>
      <div
        data-track
        data-crew-id={crew.id}
        className={cn("relative", hot && !bad && "bg-emerald-50/70", bad && "bg-rose-50")}
        style={{ width, height: 46 }}
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
            className="absolute top-1.5 flex h-[34px] items-center overflow-hidden rounded-md border border-dashed border-slate-400 bg-slate-200/90 px-1 text-[10px] font-semibold text-slate-700"
            style={{
              left: (block.startMin - DAY_START) * pxPerMin,
              width: Math.max(8, (block.endMin - block.startMin) * pxPerMin),
            }}
          >
            {block.label}
          </div>
        ))}
        {schedule?.legs.map((leg) => {
          const transport = transports.find((item) => item.id === leg.transportId);
          if (!transport) return null;
          const patient = patientById.get(transport.patientId);
          const left = (leg.departMin - DAY_START) * pxPerMin;
          const bar = Math.max(5, (leg.endMin - leg.departMin) * pxPerMin);
          const selected = selectedId === transport.id;
          return (
            <button
              key={leg.transportId}
              type="button"
              className={cn(
                "absolute top-1.5 flex h-[34px] overflow-hidden rounded-md text-left text-[10px] font-semibold text-white shadow-sm",
                leg.conflict || leg.incompatible ? "ring-2 ring-rose-600" : leg.lateMin >= 5 ? "ring-2 ring-amber-400" : "",
                selected && "outline outline-2 outline-offset-1 outline-navy",
              )}
              style={{ left, width: bar, background: crew.color, touchAction: "none" }}
              onPointerDown={(event) => onStart(transport.id, event)}
              onMouseEnter={(event) => onTip({ x: event.clientX, y: event.clientY, transportId: transport.id })}
              onMouseLeave={() => onTip(null)}
            >
              {leg.segments.map((segment) => (
                <span
                  key={`${segment.kind}-${segment.start}`}
                  className={cn(
                    "h-full",
                    segment.kind === "deadhead" && "seg-deadhead",
                    segment.kind === "loaded" && "seg-loaded",
                    segment.kind === "pec" && "seg-pec",
                    segment.kind === "wait" && "seg-wait",
                  )}
                  style={{ width: `${((segment.end - segment.start) / Math.max(1, leg.endMin - leg.departMin)) * 100}%` }}
                />
              ))}
              {bar > 72 && (
                <span className="pointer-events-none absolute inset-0 flex items-center px-1.5">
                  <span className="truncate drop-shadow">
                    {patient?.lastName.toUpperCase() ?? "Course"}
                    {transport.priority === "urgent" ? " · URG" : ""}
                  </span>
                </span>
              )}
            </button>
          );
        })}
        {drag?.moved && drag.hoverCrewId === crew.id && drag.preview?.ok && (
          <div
            className="pointer-events-none absolute top-1.5 h-[34px] rounded-md border-2 border-white/80 opacity-80"
            style={{
              left: (drag.preview.departMin - DAY_START) * pxPerMin,
              width: Math.max(8, (drag.preview.leg.endMin - drag.preview.departMin) * pxPerMin),
              background: crew.color,
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
        Fenêtre {formatMin(transport.windowStart)} – {formatMin(transport.windowEnd)} · prise en charge {transport.serviceMin} min
      </div>
      {leg && (
        <div className="mt-1 text-muted">
          Départ {formatMin(leg.departMin)} · à vide {formatKm(leg.deadheadKm, 1)} · en charge {formatKm(leg.loadedKm, 1)}
        </div>
      )}
      {leg && leg.lateMin >= 5 && <div className="mt-1 font-semibold text-amber-700">Hors fenêtre : +{Math.round(leg.lateMin)} min</div>}
      {leg?.conflict && <div className="mt-1 font-semibold text-rose-700">Conflit horaire</div>}
      {leg?.incompatible && <div className="mt-1 font-semibold text-rose-700">Incompatibilité VSL</div>}
      {transport.note && <div className="mt-1 text-muted">{transport.note}</div>}
    </div>
  );
}

function hours(): number[] {
  const list: number[] = [];
  for (let hour = 6; hour <= 20; hour++) list.push(hour);
  return list;
}
