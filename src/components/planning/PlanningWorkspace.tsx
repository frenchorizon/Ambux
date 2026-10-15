import { Minus, Plus, Crosshair } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useClock, useData } from "../../game/context";
import { previewPlacement } from "../../game/schedule";
import { DAY_START } from "../../game/types";
import { formatMin, personName, postureLabel } from "../../lib/format";
import { useNarrow } from "../../lib/useMedia";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import type { DragState } from "./drag";
import { GanttBoard } from "./GanttBoard";
import { MapPanel } from "./MapPanel";
import { UnassignedPanel } from "./UnassignedPanel";

type Pane = "plan" | "carte" | "file";

export function PlanningWorkspace() {
  const data = useData();
  const clock = useClock();
  const narrow = useNarrow();
  const [pane, setPane] = useState<Pane>("plan");
  const [pxPerMin, setPxPerMin] = useState(1.7);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const bag = useRef({ data, clock, pxPerMin });
  useEffect(() => {
    bag.current = { data, clock, pxPerMin };
  });

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const moved = current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 5;
      if (!moved) return;
      const hover = readHover(event.clientX, event.clientY, bag.current.pxPerMin);
      let preview = undefined;
      if (hover.hoverCrewId) {
        const crew = bag.current.data.crews.find((item) => item.id === hover.hoverCrewId);
        const transport = bag.current.data.transportById.get(current.transportId);
        if (crew && transport) {
          preview = previewPlacement(
            crew,
            transport,
            hover.hoverMinute ?? DAY_START,
            bag.current.data.transports,
            bag.current.data.blocks,
            bag.current.data.locMap,
            bag.current.clock.nowMin,
          );
        }
      }
      const next: DragState = {
        ...current,
        x: event.clientX,
        y: event.clientY,
        moved: true,
        hoverCrewId: hover.hoverCrewId,
        hoverMinute: hover.hoverMinute,
        overUnassigned: hover.overUnassigned,
        preview,
      };
      dragRef.current = next;
      setDrag(next);
    };
    const up = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      move(event);
      const final = dragRef.current ?? current;
      dragRef.current = null;
      setDrag(null);
      commit(final, bag.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const start = (transportId: string, event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    const leg = [...data.schedules.values()].flatMap((schedule) => schedule.legs).find((item) => item.transportId === transportId);
    if (leg && leg.departMin <= clock.nowMin) {
      data.dispatch({ type: "TOAST", message: "Course déjà engagée : l'équipage est parti.", tone: "warn" });
      data.dispatch({ type: "SELECT", id: transportId });
      return;
    }
    const next: DragState = {
      transportId,
      x: event.clientX,
      y: event.clientY,
      originX: event.clientX,
      originY: event.clientY,
      moved: false,
      overUnassigned: false,
    };
    dragRef.current = next;
    setDrag(next);
  };

  const selected = data.selectedId ? data.transportById.get(data.selectedId) : undefined;
  const selectedPatient = selected ? data.patientById.get(selected.patientId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-1.5 text-xs">
        {narrow && (
          <div className="flex rounded-lg bg-ice p-0.5">
            {(
              [
                ["plan", "Planning"],
                ["carte", "Carte"],
                ["file", "À placer"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPane(id)}
                className={cn("rounded-md px-2 py-1 font-semibold", pane === id ? "bg-white text-navy shadow-sm" : "text-muted")}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <span className="hidden text-muted sm:inline">Glisser une course : le pastille marine est l'heure prévue, l'écart s'affiche en orange. Hachures « à vide » entre deux prises en charge.</span>
        <RulesChip />
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-ice" onClick={() => setPxPerMin((value) => Math.max(1.05, value - 0.25))} aria-label="Dézoomer">
            <Minus size={14} />
          </button>
          <span className="w-10 text-center font-semibold tabular-nums">{Math.round(pxPerMin * 100)}%</span>
          <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-ice" onClick={() => setPxPerMin((value) => Math.min(4.2, value + 0.25))} aria-label="Zoomer">
            <Plus size={14} />
          </button>
          <Button
            size="sm"
            variant={data.followNow ? "navy" : "secondary"}
            onClick={() => data.dispatch({ type: "TOGGLE_FOLLOW" })}
          >
            <Crosshair size={13} /> Suivre l'heure
          </Button>
          {data.crewFilter && (
            <Button size="sm" variant="ghost" onClick={() => data.dispatch({ type: "SET_CREW_FILTER" })}>
              Tous les équipages
            </Button>
          )}
        </div>
      </div>
      {selected && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-ice/60 px-3 py-1.5 text-xs">
          <span className="font-semibold">{selectedPatient ? personName(selectedPatient) : "Course"}</span>
          <span className="text-muted">
            {postureLabel(selected.posture)} · RDV {formatMin(selected.appointmentMin ?? selected.windowStart)} · tolérance ±{selected.toleranceMin ?? data.rules.toleranceMin} min
          </span>
          <Button size="sm" variant="secondary" onClick={() => data.dispatch({ type: "SNAP_BACK", transportId: selected.id })}>
            Revenir à l'heure prévue
          </Button>
          <Button size="sm" variant="secondary" onClick={() => data.dispatch({ type: "BEST_SLOT", transportId: selected.id })}>
            Meilleur créneau
          </Button>
          <Button size="sm" variant="ghost" onClick={() => data.dispatch({ type: "UNASSIGN", transportId: selected.id })}>
            Désaffecter
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className={cn("min-h-0", narrow ? (pane === "plan" ? "flex-1" : "hidden") : "min-h-[240px] flex-1")}>
            <GanttBoard drag={drag} pxPerMin={pxPerMin} onStart={start} />
          </div>
          <div className={cn("min-h-0 border-t border-line", narrow ? (pane === "carte" ? "flex-1" : "hidden") : "h-[250px]")}>
            <MapPanel />
          </div>
        </div>
        <div className={cn("min-h-0 border-line lg:w-[320px] lg:border-l", narrow ? (pane === "file" ? "flex-1" : "hidden") : "flex")}>
          <UnassignedPanel drag={drag} onStart={start} />
        </div>
      </div>
      {drag?.moved && (
        <div className="pointer-events-none fixed z-[65] -translate-x-1/2 -translate-y-10 rounded-lg bg-navy px-2 py-1 text-[11px] font-semibold text-white shadow-lg" style={{ left: drag.x, top: drag.y }}>
          {labelFor(drag.transportId, data.transportById, data.patientById)}
          {drag.preview && !drag.preview.ok ? ` · ${drag.preview.reason === "incompatible" ? "Incompatibilité" : "Conflit horaire"}` : ""}
        </div>
      )}
    </div>
  );
}

function labelFor(
  id: string,
  transports: { get(id: string): { patientId: string } | undefined },
  patients: { get(id: string): { firstName: string; lastName: string } | undefined },
) {
  const transport = transports.get(id);
  const patient = transport ? patients.get(transport.patientId) : undefined;
  return patient ? personName(patient) : "Course";
}

function RulesChip() {
  const { rules, dispatch } = useData();
  return (
    <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted">
      <span>Repas</span>
      <input
        type="number"
        min={0}
        max={60}
        value={rules.mealMin}
        onChange={(event) => dispatch({ type: "SET_RULES", rules: { mealMin: Number(event.target.value) } })}
        className="h-7 w-12 rounded border border-line bg-white px-1"
        aria-label="Durée de la pause repas"
      />
      <span>min</span>
      <input
        type="time"
        value={formatMin(rules.mealFrom)}
        onChange={(event) => dispatch({ type: "SET_RULES", rules: { mealFrom: parseTime(event.target.value) } })}
        className="h-7 rounded border border-line bg-white px-1"
        aria-label="Début de la fenêtre repas"
      />
      <input
        type="time"
        value={formatMin(rules.mealTo)}
        onChange={(event) => dispatch({ type: "SET_RULES", rules: { mealTo: parseTime(event.target.value) } })}
        className="h-7 rounded border border-line bg-white px-1"
        aria-label="Fin de la fenêtre repas"
      />
      <span>Tolérance ±</span>
      <input
        type="number"
        min={5}
        max={60}
        value={rules.toleranceMin}
        onChange={(event) => dispatch({ type: "SET_RULES", rules: { toleranceMin: Number(event.target.value) } })}
        className="h-7 w-12 rounded border border-line bg-white px-1"
        aria-label="Tolérance horaire"
      />
      <span>min</span>
    </div>
  );
}

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 12 * 60;
  return hours * 60 + minutes;
}

function readHover(x: number, y: number, pxPerMin: number): { hoverCrewId?: string; hoverMinute?: number; overUnassigned: boolean } {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.closest("[data-unassigned]")) return { overUnassigned: true };
    const track = element.closest("[data-track]");
    if (track instanceof HTMLElement && track.dataset.crewId) {
      const rect = track.getBoundingClientRect();
      return {
        hoverCrewId: track.dataset.crewId,
        hoverMinute: DAY_START + (x - rect.left) / pxPerMin,
        overUnassigned: false,
      };
    }
  }
  return { overUnassigned: false };
}

function commit(
  drag: DragState,
  bag: {
    data: ReturnType<typeof useData>;
    clock: ReturnType<typeof useClock>;
  },
) {
  const { data } = bag;
  if (!drag.moved) {
    data.dispatch({ type: "SELECT", id: drag.transportId });
    return;
  }
  if (drag.overUnassigned) {
    data.dispatch({ type: "UNASSIGN", transportId: drag.transportId });
    return;
  }
  if (drag.preview?.ok && drag.hoverCrewId) {
    data.dispatch({
      type: "ASSIGN",
      transportId: drag.transportId,
      crewId: drag.hoverCrewId,
      departMin: drag.preview.departMin,
    });
    return;
  }
  if (drag.preview && !drag.preview.ok) {
    data.dispatch({ type: "TOAST", message: drag.preview.message, tone: "warn" });
  }
}
