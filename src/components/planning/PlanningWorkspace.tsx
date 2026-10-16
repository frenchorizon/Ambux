import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useClock, useData } from "../../game/context";
import { previewPlacement } from "../../game/schedule";
import { DAY_START } from "../../game/types";
import { formatKm, formatMin, personName, postureLabel } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import type { DragState } from "./drag";
import { GanttBoard } from "./GanttBoard";
import { closeTimelineSheet, setTimelineQuery, useTimelineUi } from "./timelineUi";

export function PlanningWorkspace() {
  const data = useData();
  const clock = useClock();
  const ui = useTimelineUi();
  const [pxPerMin, setPxPerMin] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches ? 3.2 : 2.4,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<{ id: string; x: number; y: number; timer: number } | null>(null);
  const bag = useRef({ data, clock, pxPerMin });
  useEffect(() => {
    bag.current = { data, clock, pxPerMin };
  });
  useEffect(() => () => closeTimelineSheet(), []);

  const begin = (transportId: string, x: number, y: number) => {
    const next: DragState = {
      transportId,
      x,
      y,
      originX: x,
      originY: y,
      moved: false,
      overUnassigned: false,
    };
    dragRef.current = next;
    setDrag(next);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const hold = pending.current;
      if (hold && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 12) {
        window.clearTimeout(hold.timer);
        pending.current = null;
        return;
      }
      const current = dragRef.current;
      if (!current) return;
      const moved = current.moved || Math.hypot(event.clientX - current.originX, event.clientY - current.originY) > 8;
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
            bag.current.data.rules,
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
    const up = () => {
      const hold = pending.current;
      if (hold) {
        window.clearTimeout(hold.timer);
        pending.current = null;
        bag.current.data.dispatch({ type: "SELECT", id: hold.id });
        return;
      }
      const current = dragRef.current;
      if (!current) return;
      dragRef.current = null;
      setDrag(null);
      commit(current, bag.current);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const start = (transportId: string, event: ReactPointerEvent<HTMLElement>) => {
    const leg = [...data.schedules.values()].flatMap((schedule) => schedule.legs).find((item) => item.transportId === transportId);
    if (leg && leg.departMin <= clock.nowMin) {
      data.dispatch({ type: "TOAST", message: "Course déjà engagée : l'équipage est parti.", tone: "warn" });
      data.dispatch({ type: "SELECT", id: transportId });
      return;
    }
    if (event.pointerType !== "touch") {
      event.preventDefault();
      begin(transportId, event.clientX, event.clientY);
      return;
    }
    const timer = window.setTimeout(() => {
      pending.current = null;
      begin(transportId, event.clientX, event.clientY);
      navigator.vibrate?.(12);
    }, 420);
    pending.current = { id: transportId, x: event.clientX, y: event.clientY, timer };
  };

  const selected = data.selectedId ? data.transportById.get(data.selectedId) : undefined;
  const selectedPatient = selected ? data.patientById.get(selected.patientId) : undefined;
  const selectedLeg = selected
    ? [...data.schedules.values()].flatMap((schedule) => schedule.legs).find((leg) => leg.transportId === selected.id)
    : undefined;

  return (
    <div className={cn("relative flex h-full min-h-0 flex-col", drag?.moved && "touch-none")}>
      <GanttBoard drag={drag} pxPerMin={pxPerMin} query={ui.query} onStart={start} />
      {selected && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{selectedPatient ? personName(selectedPatient) : "Course"}</div>
            <div className="truncate text-xs text-muted">
              {postureLabel(selected.posture)} · RDV {formatMin(selected.appointmentMin ?? selected.windowStart)}
            </div>
            {selectedLeg && (
              <p className="text-[12px] leading-snug text-ink">
                vide {selectedLeg.deadheadMin} min / PEC {selectedLeg.pecMin} min / trajet {selectedLeg.loadedMin} min / dépose {selectedLeg.dropoffMin} min · {formatKm(selectedLeg.deadheadKm + selectedLeg.loadedKm, 1)}
                {selectedLeg.kmEstimated ? " · estimé" : ""}
              </p>
            )}
          </div>
          <Button size="sm" className="h-11" variant="secondary" onClick={() => data.dispatch({ type: "SNAP_BACK", transportId: selected.id })}>
            Heure prévue
          </Button>
          <Button size="sm" className="h-11" variant="secondary" onClick={() => data.dispatch({ type: "BEST_SLOT", transportId: selected.id })}>
            Meilleur créneau
          </Button>
          <Button size="sm" className="h-11" variant="ghost" onClick={() => data.dispatch({ type: "UNASSIGN", transportId: selected.id })}>
            Retirer
          </Button>
        </div>
      )}
      {ui.sheet === "find" && (
        <Sheet title="Chercher et afficher" onClose={closeTimelineSheet}>
          <label className="block text-sm font-semibold">
            Patient ou dossier
            <input
              value={ui.query}
              autoFocus
              onChange={(event) => setTimelineQuery(event.target.value)}
              placeholder="Nom, dossier"
              className="mt-1 h-12 w-full rounded-xl border border-line bg-paper px-3 text-base"
            />
          </label>
          <label className="mt-3 block text-sm font-semibold">
            Équipage
            <select
              value={data.crewFilter ?? ""}
              onChange={(event) => data.dispatch({ type: "SET_CREW_FILTER", crewId: event.target.value || undefined })}
              className="mt-1 h-12 w-full rounded-xl border border-line bg-paper px-3 text-base"
            >
              <option value="">Tous les équipages</option>
              {data.crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.code} · {crew.driver}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Zoom</span>
            <div className="flex items-center gap-2">
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line" onClick={() => setPxPerMin((value) => Math.max(1.05, value - 0.35))} aria-label="Dézoomer">
                <Minus size={18} />
              </button>
              <span className="w-12 text-center text-sm font-semibold tabular-nums">{Math.round(pxPerMin * 100)}%</span>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line" onClick={() => setPxPerMin((value) => Math.min(6, value + 0.35))} aria-label="Zoomer">
                <Plus size={18} />
              </button>
            </div>
          </div>
          {data.live && (
            <Button className="mt-4 w-full" variant={data.followNow ? "navy" : "secondary"} onClick={() => data.dispatch({ type: "TOGGLE_FOLLOW" })}>
              {data.followNow ? "Le planning suit l'heure" : "Suivre l'heure"}
            </Button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Au doigt, maintenez une course pour la déplacer. Un tap ouvre les actions. La pastille marine est l'heure prévue.
          </p>
        </Sheet>
      )}
      {ui.sheet === "review" && <ReviewSheet onClose={closeTimelineSheet} />}
      {drag?.moved && (
        <div className="pointer-events-none fixed z-[65] -translate-x-1/2 -translate-y-14 rounded-lg bg-navy px-2 py-1 text-xs font-semibold text-white shadow-lg" style={{ left: drag.x, top: drag.y }}>
          {labelFor(drag.transportId, data.transportById, data.patientById)}
          {drag.preview && !drag.preview.ok ? ` · ${drag.preview.reason === "incompatible" ? "Incompatibilité" : "Conflit horaire"}` : ""}
        </div>
      )}
    </div>
  );
}

export function ReviewSheet({ onClose }: { onClose: () => void }) {
  const { issues, dispatch } = useData();
  const shown = issues.filter((issue) => issue.kind !== "km_estime");
  const estimated = issues.find((issue) => issue.kind === "km_estime");
  return (
    <Sheet title={`À contrôler · ${shown.length}`} onClose={onClose}>
      {estimated && <p className="mb-3 text-sm text-muted">{estimated.title}</p>}
      <ul className="max-h-[50vh] space-y-1 overflow-auto">
        {shown.length === 0 && <li className="text-sm text-muted">Rien à contrôler sur ce planning fictif.</li>}
        {shown.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              className={cn(
                "min-h-11 w-full rounded-xl px-3 py-2 text-left text-sm",
                issue.level === "bloquant" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-950",
              )}
              onClick={() => {
                if (issue.transportId) dispatch({ type: "SELECT", id: issue.transportId });
                if (issue.crewId) dispatch({ type: "SET_CREW_FILTER", crewId: issue.crewId });
                onClose();
              }}
            >
              {issue.title}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/40 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="absolute inset-0" aria-label="Fermer" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-auto rounded-t-3xl bg-card p-4 shadow-2xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" className="h-11 rounded-xl px-3 text-sm font-semibold text-muted" onClick={onClose}>
            Fermer
          </button>
        </div>
        {children}
      </div>
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
