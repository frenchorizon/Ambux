import { Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useClock, useData } from "../../game/context";
import { displayedDepart, previewOnGrid, snap5 } from "../../game/schedule";
import { DAY_START } from "../../game/types";
import { formatKm, formatMin, personName, postureLabel } from "../../lib/format";
import { Button } from "../ui/button";
import { ganttEdgeDelta, previewCacheKey, sameAssignment, scrollGanttEdge, type DragState } from "./drag";
import { DPad, type PadDir } from "./DPad";
import { GanttBoard } from "./GanttBoard";
import { closeTimelineSheet, setTimelineQuery, useTimelineUi } from "./timelineUi";

const HOLD_MS = 420;
const SCROLL_SLOP = 18;
const DRAG_SLOP = 8;

type Hold = {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  timer: number;
  mode: "pending" | "scroll";
  el: HTMLElement;
};

export function PlanningWorkspace() {
  const data = useData();
  const clock = useClock();
  const ui = useTimelineUi();
  const [pxPerMin, setPxPerMin] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches ? 3.2 : 2.4,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<"idle" | "pending" | "scroll" | "drag">("idle");
  const [note, setNote] = useState<string | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const pending = useRef<Hold | null>(null);
  const captureRef = useRef<{ el: HTMLElement; pointerId: number } | null>(null);
  const queued = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const edgeLoop = useRef(0);
  const abortRef = useRef<() => void>(() => {});
  const bag = useRef({ data, clock, pxPerMin });
  const nudgeRef = useRef<(dir: PadDir, coalesce: boolean) => void>(() => {});
  useEffect(() => {
    bag.current = { data, clock, pxPerMin };
  });
  useEffect(() => () => closeTimelineSheet(), []);
  useEffect(() => {
    setNote(null);
  }, [data.selectedId]);

  const begin = (transportId: string, pointerId: number, x: number, y: number, el: HTMLElement) => {
    const next: DragState = {
      transportId,
      pointerId,
      x,
      y,
      originX: x,
      originY: y,
      dx: 0,
      dy: 0,
      moved: false,
      overUnassigned: false,
    };
    dragRef.current = next;
    captureRef.current = { el, pointerId };
    setPendingId(null);
    setNote(null);
    setDrag(next);
    setGesture("drag");
    try {
      el.setPointerCapture(pointerId);
    } catch {
      /* Les PointerEvent synthétiques n'ont pas de capture. Les écouteurs window restent. */
    }
  };

  const applyMove = (x: number, y: number) => {
    const current = dragRef.current;
    if (!current) return;
    const dx = x - current.originX;
    const dy = y - current.originY;
    const moved = current.moved || Math.hypot(dx, dy) > DRAG_SLOP;
    const hover = moved ? readHover(x, y, bag.current.pxPerMin) : { overUnassigned: false as const };
    let preview = current.preview;
    let previewKey = current.previewKey;
    if (moved && hover.hoverCrewId != null && hover.hoverMinute != null) {
      const key = previewCacheKey(hover.hoverCrewId, hover.hoverMinute);
      if (key !== current.previewKey) {
        const crew = bag.current.data.crews.find((item) => item.id === hover.hoverCrewId);
        const transport = bag.current.data.transportById.get(current.transportId);
        if (crew && transport) {
          preview = previewOnGrid(
            crew,
            transport,
            hover.hoverMinute,
            bag.current.data.transports,
            bag.current.data.blocks,
            bag.current.data.locMap,
            bag.current.clock.nowMin,
            bag.current.data.rules,
          );
          previewKey = key;
        }
      }
    } else if (moved) {
      preview = undefined;
      previewKey = undefined;
    }
    const next: DragState = {
      ...current,
      x,
      y,
      dx,
      dy,
      moved,
      hoverCrewId: moved ? hover.hoverCrewId : current.hoverCrewId,
      hoverMinute: moved ? hover.hoverMinute : current.hoverMinute,
      overUnassigned: moved ? hover.overUnassigned : current.overUnassigned,
      preview: moved ? preview : current.preview,
      previewKey: moved ? previewKey : current.previewKey,
    };
    dragRef.current = next;
    setDrag(next);
    if (moved) kickEdge();
  };

  const kickEdge = () => {
    if (edgeLoop.current) return;
    const current = dragRef.current;
    if (!current?.moved) return;
    const scroller = document.querySelector(".gantt-scroll");
    if (!(scroller instanceof HTMLElement)) return;
    const { dx, dy } = ganttEdgeDelta(current.x, current.y, scroller.getBoundingClientRect());
    if (!dx && !dy) return;
    const step = () => {
      edgeLoop.current = 0;
      const latest = dragRef.current;
      if (!latest?.moved) return;
      if (!scrollGanttEdge(latest.x, latest.y)) return;
      applyMove(latest.x, latest.y);
    };
    edgeLoop.current = window.requestAnimationFrame(step);
  };

  const stopEdge = () => {
    if (!edgeLoop.current) return;
    window.cancelAnimationFrame(edgeLoop.current);
    edgeLoop.current = 0;
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const hold = pending.current;
      if (hold && event.pointerId === hold.pointerId) {
        if (hold.mode === "pending" && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > SCROLL_SLOP) {
          window.clearTimeout(hold.timer);
          hold.mode = "scroll";
          setPendingId(null);
          setGesture("scroll");
        }
        return;
      }
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      if (event.cancelable) event.preventDefault();
      queued.current = { x: event.clientX, y: event.clientY };
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = 0;
        const point = queued.current;
        queued.current = null;
        if (point) applyMove(point.x, point.y);
      });
    };
    const releaseCapture = () => {
      const captured = captureRef.current;
      captureRef.current = null;
      if (!captured) return;
      try {
        if (captured.el.hasPointerCapture?.(captured.pointerId)) captured.el.releasePointerCapture(captured.pointerId);
      } catch {
        /* capture absente */
      }
    };
    const flush = () => {
      stopEdge();
      if (frame.current) {
        window.cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      const point = queued.current;
      queued.current = null;
      if (point) applyMove(point.x, point.y);
    };
    const up = (event: PointerEvent) => {
      const hold = pending.current;
      if (hold && event.pointerId === hold.pointerId) {
        window.clearTimeout(hold.timer);
        pending.current = null;
        setPendingId(null);
        setGesture("idle");
        if (hold.mode === "pending") bag.current.data.dispatch({ type: "SELECT", id: hold.id });
        return;
      }
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      flush();
      const latest = dragRef.current ?? current;
      dragRef.current = null;
      setDrag(null);
      setPendingId(null);
      setGesture("idle");
      releaseCapture();
      setNote(null);
      commit(latest, bag.current);
    };
    const abort = () => {
      const hold = pending.current;
      if (hold) window.clearTimeout(hold.timer);
      pending.current = null;
      stopEdge();
      if (frame.current) {
        window.cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      queued.current = null;
      if (dragRef.current) {
        dragRef.current = null;
        setDrag(null);
        releaseCapture();
      }
      setPendingId(null);
      setGesture("idle");
    };
    abortRef.current = abort;
    const cancel = (event: PointerEvent) => {
      const hold = pending.current;
      const current = dragRef.current;
      const matchesHold = Boolean(hold && event.pointerId === hold.pointerId);
      const matchesDrag = Boolean(current && event.pointerId === current.pointerId);
      if (!matchesHold && !matchesDrag) return;
      abort();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      if (pending.current) window.clearTimeout(pending.current.timer);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      stopEdge();
      abortRef.current = () => {};
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        const field = event.target;
        if (field instanceof HTMLElement && field.closest("input, textarea, select, [contenteditable='true']")) return;
        abortRef.current();
        return;
      }
      const dir = arrowDir(event.key);
      if (!dir) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!bag.current.data.selectedId) return;
      event.preventDefault();
      nudgeRef.current(dir, event.repeat);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const start = (transportId: string, event: ReactPointerEvent<HTMLElement>) => {
    const leg = [...data.schedules.values()]
      .flatMap((schedule) => schedule.legs)
      .find((item) => item.transportId === transportId);
    if (leg && leg.departMin <= clock.nowMin) {
      data.dispatch({ type: "TOAST", message: "Course déjà engagée : l'équipage est parti.", tone: "warn" });
      data.dispatch({ type: "SELECT", id: transportId });
      return;
    }
    if (event.pointerType !== "touch") {
      event.preventDefault();
      begin(transportId, event.pointerId, event.clientX, event.clientY, event.currentTarget);
      return;
    }
    const timer = window.setTimeout(() => {
      const hold = pending.current;
      if (!hold || hold.timer !== timer || hold.mode !== "pending") return;
      pending.current = null;
      begin(hold.id, hold.pointerId, hold.x, hold.y, hold.el);
    }, HOLD_MS);
    pending.current = {
      id: transportId,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      timer,
      mode: "pending",
      el: event.currentTarget,
    };
    setPendingId(transportId);
    setGesture("pending");
  };

  nudgeRef.current = (dir, coalesce) => nudgeMission(dir, coalesce, data, clock.nowMin, setNote);

  const selected = data.selectedId ? data.transportById.get(data.selectedId) : undefined;
  const selectedPatient = selected ? data.patientById.get(selected.patientId) : undefined;
  const selectedLeg = selected
    ? [...data.schedules.values()].flatMap((schedule) => schedule.legs).find((leg) => leg.transportId === selected.id)
    : undefined;
  const plannedMin = selected ? (selected.appointmentMin ?? selected.windowStart) : undefined;
  const draggingSelection =
    drag && selected && drag.transportId === selected.id && drag.preview?.ok ? drag.preview : undefined;
  const liveDepart = draggingSelection ? draggingSelection.departMin : selectedLeg?.departMin;
  const shownDepart = liveDepart == null ? undefined : displayedDepart(liveDepart);
  const dragged = drag?.moved ? data.transportById.get(drag.transportId) : undefined;
  const draggedPlan = dragged ? (dragged.appointmentMin ?? dragged.windowStart) : undefined;

  return (
    <div className="relative flex h-full min-h-0 flex-col" data-gesture={gesture}>
      <GanttBoard drag={drag} pendingId={pendingId} pxPerMin={pxPerMin} query={ui.query} onStart={start} />
      {selected && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">
              {selectedPatient ? personName(selectedPatient) : "Course"}
            </div>
            <div className="truncate text-xs text-muted">
              {postureLabel(selected.posture)} · RDV {formatMin(selected.appointmentMin ?? selected.windowStart)}
            </div>
            {selectedLeg && (
              <p className="text-[12px] leading-snug text-ink">
                vide {selectedLeg.deadheadMin} min / PEC {selectedLeg.pecMin} min / trajet {selectedLeg.loadedMin} min /
                dépose {selectedLeg.dropoffMin} min · {formatKm(selectedLeg.deadheadKm + selectedLeg.loadedKm, 1)}
                {selectedLeg.kmEstimated ? " · estimé" : ""}
              </p>
            )}
            {(selected.stayMin ?? 0) > 0 && (
              <p className="text-[12px] font-semibold text-ink" data-stay={selected.stayMin}>
                Attente à l'établissement : {selected.stayMin} min
              </p>
            )}
            {shownDepart != null && plannedMin != null && (
              <p className="text-[12px] font-semibold text-navy" data-pickup-times>
                Prise en charge {formatMin(shownDepart)} · prévue {formatMin(plannedMin)}
              </p>
            )}
          </div>
          <Button
            size="sm"
            className="h-11"
            variant="secondary"
            onClick={() => data.dispatch({ type: "SNAP_BACK", transportId: selected.id })}
          >
            Heure prévue
          </Button>
          <Button
            size="sm"
            className="h-11"
            variant="secondary"
            onClick={() => data.dispatch({ type: "BEST_SLOT", transportId: selected.id })}
          >
            Meilleur créneau
          </Button>
          <Button
            size="sm"
            className="h-11"
            variant="ghost"
            onClick={() => data.dispatch({ type: "UNASSIGN", transportId: selected.id })}
          >
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
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line"
                onClick={() => setPxPerMin((value) => Math.max(1.05, value - 0.35))}
                aria-label="Dézoomer"
              >
                <Minus size={18} />
              </button>
              <span className="w-12 text-center text-sm font-semibold tabular-nums">{Math.round(pxPerMin * 100)}%</span>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line"
                onClick={() => setPxPerMin((value) => Math.min(6, value + 0.35))}
                aria-label="Zoomer"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
          {data.live && (
            <Button
              className="mt-4 w-full"
              variant={data.followNow ? "navy" : "secondary"}
              onClick={() => data.dispatch({ type: "TOGGLE_FOLLOW" })}
            >
              {data.followNow ? "Le planning suit l'heure" : "Suivre l'heure"}
            </Button>
          )}
          <p className="mt-4 text-xs leading-relaxed text-muted">
            Un tap sélectionne la course et affiche la croix. Maintenez jusqu'à l'anneau bleu pour la glisser : le
            planning défile si le doigt part avant, et au bord pendant le glisser. Un créneau refusé reste en rose avec
            la raison. Reposer au même endroit n'est pas une modification. Échap annule. Les flèches décalent de 5
            minutes ou changent de véhicule. La pastille marine est l'heure prévue.
          </p>
        </Sheet>
      )}
      {ui.sheet === "review" && <ReviewSheet onClose={closeTimelineSheet} />}
      {drag?.moved && (
        <div
          data-drag-label
          className="pointer-events-none fixed z-[65] max-w-[240px] -translate-x-1/2 -translate-y-full rounded-lg bg-navy px-2 py-1 text-xs font-semibold text-white shadow-lg"
          style={{ left: drag.x, top: Math.max(8, drag.y - 12) }}
        >
          <div>{labelFor(drag.transportId, data.transportById, data.patientById)}</div>
          {drag.preview?.ok && (
            <div>
              Prise en charge {formatMin(drag.preview.departMin)}
              {draggedPlan != null ? ` · prévue ${formatMin(draggedPlan)}` : ""}
            </div>
          )}
          {drag.preview && !drag.preview.ok && <div data-drag-reason>{drag.preview.message}</div>}
        </div>
      )}
      {selected && shownDepart != null && plannedMin != null && (
        <DPad
          selectedId={selected.id}
          departLabel={formatMin(shownDepart)}
          plannedLabel={formatMin(plannedMin)}
          reason={note}
          onNudge={(dir, coalesce) => nudgeRef.current(dir, coalesce)}
        />
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
              className="min-h-11 w-full rounded-xl bg-alert-soft px-3 py-2 text-left text-sm text-alert"
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
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button type="button" className="absolute inset-0" aria-label="Fermer" onClick={onClose} />
      <div className="relative max-h-[85vh] w-full max-w-lg overflow-auto rounded-t-3xl border border-line bg-card p-4 shadow-2xl sm:rounded-3xl">
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

function readHover(
  x: number,
  y: number,
  pxPerMin: number,
): { hoverCrewId?: string; hoverMinute?: number; overUnassigned: boolean } {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;
    if (element.closest("[data-dpad], .gantt-block")) continue;
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
  if (drag.preview?.ok && drag.hoverCrewId && drag.preview.departMin % 5 === 0) {
    const transport = data.transportById.get(drag.transportId);
    const leg = [...data.schedules.values()]
      .flatMap((schedule) => schedule.legs)
      .find((item) => item.transportId === drag.transportId);
    if (
      sameAssignment(
        transport?.crewId,
        leg?.departMin ?? transport?.departMin,
        drag.hoverCrewId,
        drag.preview.departMin,
      )
    ) {
      data.dispatch({ type: "SELECT", id: drag.transportId });
      return;
    }
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
    return;
  }
  if (drag.hoverCrewId) {
    data.dispatch({
      type: "TOAST",
      message: "Conflit horaire : le créneau de 5 minutes ne tient pas sur cet équipage.",
      tone: "warn",
    });
  }
}

function arrowDir(key: string): PadDir | null {
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  return null;
}

function nudgeMission(
  dir: PadDir,
  coalesce: boolean,
  data: ReturnType<typeof useData>,
  nowMin: number,
  setNote: (message: string | null) => void,
) {
  const id = data.selectedId;
  if (!id) return;
  const transport = data.transportById.get(id);
  if (!transport) return;
  const crews = data.crews.filter((crew) => !data.crewFilter || crew.id === data.crewFilter);
  const leg = [...data.schedules.values()].flatMap((schedule) => schedule.legs).find((item) => item.transportId === id);
  const currentDepart = leg?.departMin ?? transport.departMin ?? transport.appointmentMin ?? transport.windowStart;
  let crewId = transport.crewId;
  let depart = snap5(currentDepart);
  if (dir === "left") depart = snap5(currentDepart) - 5;
  if (dir === "right") depart = snap5(currentDepart) + 5;
  if (dir === "up" || dir === "down") {
    const index = crews.findIndex((crew) => crew.id === transport.crewId);
    const nextIndex = dir === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= crews.length) {
      setNote("Pas d'autre équipage");
      return;
    }
    crewId = crews[nextIndex]!.id;
  }
  if (!crewId) {
    setNote("La course n'est sur aucun équipage.");
    return;
  }
  const crew = data.crews.find((item) => item.id === crewId);
  if (!crew) {
    setNote("Pas d'autre équipage");
    return;
  }
  const preview = previewOnGrid(crew, transport, depart, data.transports, data.blocks, data.locMap, nowMin, data.rules);
  if (!preview.ok) {
    setNote(preview.message);
    return;
  }
  if (sameAssignment(transport.crewId, currentDepart, crew.id, preview.departMin)) {
    if (dir === "left" || dir === "right") {
      setNote("Conflit horaire : le créneau de 5 minutes ne tient pas sur cet équipage.");
    }
    return;
  }
  setNote(null);
  data.dispatch({
    type: "ASSIGN",
    transportId: id,
    crewId,
    departMin: preview.departMin,
    coalesce,
  });
}
