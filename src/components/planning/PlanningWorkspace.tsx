import { Minus, Plus } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useClock, useData } from "../../game/context";
import { loadWorkspace, subscribeWorkspace } from "../../game/workspace";
import { displayedDepart, previewOnGrid, snap5 } from "../../game/schedule";
import { DAY_START } from "../../game/types";
import heroPng from "../../assets/hero/hero.png";
import { formatKm, formatMin, personName, postureLabel } from "../../lib/format";
import { Button } from "../ui/button";
import {
  announceAim,
  announceCancel,
  announceDrop,
  announceEdge,
  announceGrab,
  announceNoCrew,
  announceRefuse,
  CONFLICT_MESSAGE,
  dragCommitKey,
  dragRelease,
  dragReturnsHome,
  ganttEdgeDelta,
  ganttEdgeRect,
  HOLD_MS,
  isKeyboardDrag,
  keyboardDrag,
  nextKeyboardAim,
  noteDrag,
  previewCacheKey,
  RETURN_MS,
  sameAssignment,
  SCROLL_SLOP,
  scrollGanttEdge,
  type DragState,
} from "./drag";
import { DPad, type PadDir } from "./DPad";
import { GanttBoard } from "./GanttBoard";
import { closeTimelineSheet, setTimelineQuery, useTimelineUi } from "./timelineUi";

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
    typeof window !== "undefined" && window.matchMedia("(max-width: 1024px)").matches ? 3.2 : 3.4,
  );
  const [drag, setDrag] = useState<DragState | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [gesture, setGesture] = useState<"idle" | "pending" | "scroll" | "drag">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [live, setLive] = useState("");
  const dragRef = useRef<DragState | null>(null);
  const dragNodeRef = useRef<HTMLButtonElement | null>(null);
  const commitKeyRef = useRef<string | null>(null);
  const startRef = useRef<(transportId: string, event: ReactPointerEvent<HTMLElement>) => void>(() => {});
  const onStart = useCallback((transportId: string, event: ReactPointerEvent<HTMLElement>) => {
    startRef.current(transportId, event);
  }, []);
  /** Pointer events coupés par iOS, le doigt est encore là : touchmove et touchend suivent. */
  const touchLost = useRef(false);
  const pending = useRef<Hold | null>(null);
  const captureRef = useRef<{ el: HTMLElement; pointerId: number } | null>(null);
  const queued = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);
  const edgeLoop = useRef(0);
  const returnRef = useRef<{ id: string; dx: number; dy: number; started: boolean } | null>(null);
  const returnTimer = useRef(0);
  const returnFrame = useRef(0);
  const returnGen = useRef(0);
  const queueReturnRef = useRef<(drag: DragState) => void>(() => {});
  const abortRef = useRef<() => void>(() => {});
  const finishRef = useRef<() => void>(() => {});
  const liveRef = useRef<(message: string) => void>(() => {});
  const keyboardApi = useRef<{
    grab: (id: string) => void;
    move: (dir: PadDir, shift: boolean) => void;
    drop: () => void;
  }>({
    grab: () => {},
    move: () => {},
    drop: () => {},
  });
  const bag = useRef({ data, clock, pxPerMin });
  const nudgeRef = useRef<(dir: PadDir, coalesce: boolean) => void>(() => {});
  liveRef.current = setLive;
  useEffect(() => {
    bag.current = { data, clock, pxPerMin };
  });
  useEffect(() => () => closeTimelineSheet(), []);
  useEffect(() => {
    setNote(null);
  }, [data.selectedId]);

  queueReturnRef.current = (drag) => {
    if (drag.dx === 0 && drag.dy === 0) return;
    if (returnTimer.current) {
      window.clearTimeout(returnTimer.current);
      returnTimer.current = 0;
    }
    if (returnFrame.current) {
      window.cancelAnimationFrame(returnFrame.current);
      returnFrame.current = 0;
    }
    returnGen.current += 1;
    returnRef.current = { id: drag.transportId, dx: drag.dx, dy: drag.dy, started: false };
    setReturningId(drag.transportId);
  };

  const cancelReturn = () => {
    returnGen.current += 1;
    const back = returnRef.current;
    returnRef.current = null;
    if (returnTimer.current) {
      window.clearTimeout(returnTimer.current);
      returnTimer.current = 0;
    }
    if (returnFrame.current) {
      window.cancelAnimationFrame(returnFrame.current);
      returnFrame.current = 0;
    }
    if (back) clearDragPaint(null, back.id);
    setReturningId((id) => (id === back?.id ? null : id));
  };

  const begin = (transportId: string, pointerId: number, x: number, y: number, el: HTMLElement) => {
    if (isKeyboardDrag(dragRef.current)) setLive("");
    cancelReturn();
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
    commitKeyRef.current = dragCommitKey(next);
    noteDrag("commits");
    touchLost.current = false;
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
    paintDrag(dragNodeRef.current, next.transportId, next.dx, next.dy);
    noteDrag("frames");
    const key = dragCommitKey(next);
    if (key !== commitKeyRef.current) {
      commitKeyRef.current = key;
      noteDrag("commits");
      setDrag(next);
    }
    if (moved) kickEdge();
  };

  const kickEdge = () => {
    if (edgeLoop.current) return;
    const current = dragRef.current;
    if (!current?.moved) return;
    const scroller = document.querySelector(".gantt-scroll");
    if (!(scroller instanceof HTMLElement)) return;
    const { dx, dy } = ganttEdgeDelta(current.x, current.y, ganttEdgeRect(scroller));
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
    const fingers = new Set<number>();
    const queue = (x: number, y: number) => {
      if (!dragRef.current) return;
      queued.current = { x, y };
      if (frame.current) return;
      frame.current = window.requestAnimationFrame(() => {
        frame.current = 0;
        const point = queued.current;
        queued.current = null;
        if (point) applyMove(point.x, point.y);
      });
    };
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
      if (!current || event.pointerId !== current.pointerId || touchLost.current) return;
      if (event.cancelable) event.preventDefault();
      queue(event.clientX, event.clientY);
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
    const finish = () => {
      const current = dragRef.current;
      if (!current) return;
      flush();
      const latest = dragRef.current ?? current;
      dragRef.current = null;
      commitKeyRef.current = null;
      touchLost.current = false;
      setDrag(null);
      setPendingId(null);
      setGesture("idle");
      releaseCapture();
      setNote(null);
      const release = dragRelease(latest, samePlaceOf(latest, bag.current.data));
      if (dragReturnsHome(latest, release)) queueReturnRef.current(latest);
      else clearDragPaint(dragNodeRef.current, latest.transportId);
      commit(latest, bag.current);
    };
    finishRef.current = finish;
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
      finish();
    };
    const abort = () => {
      const hold = pending.current;
      if (hold) window.clearTimeout(hold.timer);
      pending.current = null;
      touchLost.current = false;
      stopEdge();
      if (frame.current) {
        window.cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      queued.current = null;
      if (dragRef.current) {
        const latest = dragRef.current;
        const keyboard = isKeyboardDrag(latest);
        dragRef.current = null;
        commitKeyRef.current = null;
        setDrag(null);
        releaseCapture();
        if (latest.dx !== 0 || latest.dy !== 0) queueReturnRef.current(latest);
        else clearDragPaint(dragNodeRef.current, latest.transportId);
        if (keyboard) liveRef.current(announceCancel());
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
      // iOS annule le pointer quand il croit prendre le défilement, le doigt encore posé.
      if (matchesDrag && event.pointerType === "touch" && fingers.has(event.pointerId)) {
        touchLost.current = true;
        return;
      }
      abort();
    };
    const remember = (event: TouchEvent) => {
      for (let i = 0; i < event.changedTouches.length; i++) {
        const touch = event.changedTouches.item(i);
        if (touch) fingers.add(touch.identifier);
      }
    };
    const forget = (event: TouchEvent) => {
      for (let i = 0; i < event.changedTouches.length; i++) {
        const touch = event.changedTouches.item(i);
        if (touch) fingers.delete(touch.identifier);
      }
    };
    // Posé au montage, non passif : iOS ignore un preventDefault branché après le contact,
    // et ignore touch-action changé pendant que le doigt est là. Rien n'est bloqué pendant l'appui long.
    const onTouchMove = (event: TouchEvent) => {
      const current = dragRef.current;
      if (!current) return;
      if (event.cancelable) event.preventDefault();
      if (!touchLost.current) return;
      const touch = touchById(event.touches, current.pointerId);
      if (!touch) return;
      queue(touch.clientX, touch.clientY);
    };
    const onTouchEnd = (event: TouchEvent) => {
      const current = dragRef.current;
      const lifted = current ? touchById(event.changedTouches, current.pointerId) : undefined;
      forget(event);
      if (!lifted) return;
      // Le pointerup suit d'habitude. S'il ne vient pas, le doigt levé termine quand même.
      queued.current = { x: lifted.clientX, y: lifted.clientY };
      finish();
    };
    const onTouchCancel = (event: TouchEvent) => {
      const id = dragRef.current?.pointerId ?? pending.current?.pointerId;
      const hit = id != null && touchById(event.changedTouches, id);
      forget(event);
      if (!hit) return;
      abort();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchstart", remember, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchCancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchstart", remember);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchCancel);
      if (pending.current) window.clearTimeout(pending.current.timer);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      if (returnFrame.current) window.cancelAnimationFrame(returnFrame.current);
      if (returnTimer.current) window.clearTimeout(returnTimer.current);
      stopEdge();
      abortRef.current = () => {};
    };
  }, []);

  useLayoutEffect(() => {
    const current = dragRef.current;
    if (current) {
      paintDrag(dragNodeRef.current, current.transportId, current.dx, current.dy);
      return;
    }
    const back = returnRef.current;
    if (!back || back.started) return;
    const gen = returnGen.current;
    const node = dragTarget(null, back.id);
    if (!(node instanceof HTMLElement)) {
      back.started = true;
      setReturningId((id) => (id === back.id ? null : id));
      return;
    }
    back.started = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.style.transition = "none";
    node.style.zIndex = "25";
    node.style.transform = `translate(${back.dx}px, ${back.dy}px)`;
    void node.offsetWidth;
    node.style.transition = reduce ? "none" : `transform ${RETURN_MS}ms ease-out`;
    const finishReturn = () => {
      if (returnGen.current !== gen) return;
      const el = node.isConnected ? node : dragTarget(null, back.id);
      if (el) {
        el.style.transform = "";
        el.style.zIndex = "";
        el.style.transition = "";
      }
      if (returnRef.current?.id === back.id) returnRef.current = null;
      setReturningId((id) => (id === back.id ? null : id));
    };
    const go = () => {
      returnFrame.current = 0;
      if (returnGen.current !== gen) return;
      const el = node.isConnected ? node : dragTarget(null, back.id);
      if (!el) {
        finishReturn();
        return;
      }
      el.style.transform = "translate(0px, 0px)";
      returnTimer.current = window.setTimeout(finishReturn, RETURN_MS + 220);
    };
    if (reduce) go();
    else returnFrame.current = window.requestAnimationFrame(go);
  });

  useEffect(() => {
    const onFocusIn = (event: FocusEvent) => {
      const current = dragRef.current;
      if (!isKeyboardDrag(current)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target === document.body || target === document.documentElement) return;
      const block = document.querySelector(`[data-transport-id="${current.transportId}"]`);
      if (block?.contains(target)) return;
      abortRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (event.key === "Escape") {
        const dragging = Boolean(dragRef.current) || Boolean(pending.current);
        abortRef.current();
        if (!dragging) bag.current.data.dispatch({ type: "SELECT", id: undefined });
        return;
      }
      if (isKeyboardDrag(dragRef.current)) {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        const dir = arrowDir(event.key);
        if (dir) {
          event.preventDefault();
          keyboardApi.current.move(dir, event.shiftKey);
          return;
        }
        if (event.key === "Enter" && !event.repeat) {
          event.preventDefault();
          keyboardApi.current.drop();
          return;
        }
        if (event.key === " ") {
          event.preventDefault();
          return;
        }
        return;
      }
      if (
        (event.key === "Enter" || event.key === " ") &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        target instanceof Element
      ) {
        const block = target.closest(".gantt-block");
        if (block instanceof HTMLElement && block.dataset.transportId) {
          event.preventDefault();
          keyboardApi.current.grab(block.dataset.transportId);
          return;
        }
      }
      const dir = arrowDir(event.key);
      if (!dir || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!bag.current.data.selectedId) return;
      event.preventDefault();
      nudgeRef.current(dir, event.repeat);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focusin", onFocusIn);
    };
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
      buzz();
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
  startRef.current = start;

  nudgeRef.current = (dir, coalesce) => nudgeMission(dir, coalesce, data, clock.nowMin, setNote);

  keyboardApi.current = {
    grab(id: string) {
      const { data: current, clock: now } = bag.current;
      if (dragRef.current && !isKeyboardDrag(dragRef.current)) return;
      const transport = current.transportById.get(id);
      if (!transport) return;
      const leg = [...current.schedules.values()]
        .flatMap((schedule) => schedule.legs)
        .find((item) => item.transportId === id);
      const raw = leg?.departMin ?? transport.departMin ?? transport.appointmentMin ?? transport.windowStart;
      const depart = snap5(raw);
      const crew = current.crews.find((item) => item.id === transport.crewId);
      const patient = current.patientById.get(transport.patientId);
      const patientLabel = patient ? personName(patient) : "Patient";
      if (!crew) {
        setLive("La course n'est sur aucun équipage.");
        return;
      }
      const preview = previewOnGrid(
        crew,
        transport,
        depart,
        current.transports,
        current.blocks,
        current.locMap,
        now.nowMin,
        current.rules,
      );
      if (!preview.ok && preview.reason === "started") {
        current.dispatch({ type: "TOAST", message: preview.message, tone: "warn" });
        current.dispatch({ type: "SELECT", id });
        setLive(announceRefuse(preview.message));
        return;
      }
      current.dispatch({ type: "SELECT", id });
      setNote(null);
      const sentence = announceGrab(patientLabel, formatMin(displayedDepart(raw)), crew.code);
      const next = keyboardDrag(id, crew.id, depart, preview);
      dragRef.current = next;
      commitKeyRef.current = dragCommitKey(next);
      setPendingId(null);
      setDrag(next);
      setGesture("drag");
      setLive(!preview.ok ? `${sentence} ${preview.message}` : sentence);
    },
    move(dir: PadDir, shift: boolean) {
      const currentDrag = dragRef.current;
      if (!isKeyboardDrag(currentDrag) || !currentDrag.hoverCrewId || currentDrag.hoverMinute == null) return;
      const { data: current, clock: now, pxPerMin: scale } = bag.current;
      const crews = current.crews.filter((crew) => !current.crewFilter || crew.id === current.crewFilter);
      const aim = { crewId: currentDrag.hoverCrewId, departMin: snap5(currentDrag.hoverMinute) };
      const nextAim = nextKeyboardAim(crews, aim, dir, shift);
      if (nextAim === "no-crew") {
        setLive(announceNoCrew());
        return;
      }
      if (nextAim === "edge") {
        setLive(announceEdge(dir === "left" ? "left" : "right"));
        return;
      }
      const crew = current.crews.find((item) => item.id === nextAim.crewId);
      const transport = current.transportById.get(currentDrag.transportId);
      if (!crew || !transport) return;
      const preview = previewOnGrid(
        crew,
        transport,
        nextAim.departMin,
        current.transports,
        current.blocks,
        current.locMap,
        now.nowMin,
        current.rules,
      );
      const time = formatMin(preview.ok ? preview.departMin : nextAim.departMin);
      const next = keyboardDrag(currentDrag.transportId, nextAim.crewId, nextAim.departMin, preview);
      dragRef.current = next;
      commitKeyRef.current = dragCommitKey(next);
      setDrag(next);
      setLive(announceAim(time, crew.code, preview.ok ? undefined : preview.message));
      if (nextAim.crewId !== aim.crewId) {
        document
          .querySelector(`[data-track][data-crew-id="${nextAim.crewId}"]`)
          ?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      revealMinute(preview.ok ? preview.departMin : nextAim.departMin, scale);
    },
    drop() {
      const currentDrag = dragRef.current;
      if (!isKeyboardDrag(currentDrag)) return;
      const { data: current } = bag.current;
      const release = dragRelease(currentDrag, samePlaceOf(currentDrag, current));
      const crew = current.crews.find((item) => item.id === currentDrag.hoverCrewId);
      const time = formatMin(
        currentDrag.preview?.ok ? currentDrag.preview.departMin : snap5(currentDrag.hoverMinute ?? DAY_START),
      );
      const refusal = currentDrag.preview && !currentDrag.preview.ok ? currentDrag.preview.message : CONFLICT_MESSAGE;
      setLive(announceDrop(release, time, crew?.code ?? "", refusal));
      const id = currentDrag.transportId;
      finishRef.current();
      const focusBlock = () => {
        const node = document.querySelector(`[data-transport-id="${id}"]`);
        if (!(node instanceof HTMLElement) || document.activeElement === node) return;
        node.focus({ preventScroll: true });
        node.scrollIntoView({ block: "nearest", inline: "nearest" });
      };
      window.requestAnimationFrame(focusBlock);
      window.setTimeout(focusBlock, 0);
    },
  };

  const enterprise = useSyncExternalStore(
    subscribeWorkspace,
    () => loadWorkspace()?.mode === "entreprise",
    () => false,
  );
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (dragRef.current || pending.current) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".da-detail, .gantt-block, [data-dpad], .shell-menu, .shell-top, [role='dialog']")) return;
      if (!bag.current.data.selectedId) return;
      bag.current.data.dispatch({ type: "SELECT", id: undefined });
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);
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

  return (
    <div
      className="da-gantt-scene relative flex h-full min-h-0 flex-col"
      data-gesture={gesture}
      data-keyboard={isKeyboardDrag(drag) ? "1" : undefined}
    >
      <div className="da-gantt-photo" style={{ backgroundImage: `url(${heroPng})` }} aria-hidden="true" />
      <div className="da-gantt-veil" aria-hidden="true" />
      <p className="sr-only" aria-live="polite" aria-atomic="true" data-live="keyboard">
        {live}
      </p>
      <GanttBoard
        drag={drag}
        pendingId={pendingId}
        returningId={returningId}
        pxPerMin={pxPerMin}
        query={ui.query}
        onStart={onStart}
        dragNodeRef={dragNodeRef}
      />
      {selected && !drag && (
        <aside className="da-detail" aria-label="Détail de la course">
          <p className="da-detail-title">
            <span className="truncate">{selectedPatient ? personName(selectedPatient) : "Course"}</span>
            <span>
              {" · "}
              {postureLabel(selected.posture)}
              {" · RDV "}
              {formatMin(selected.appointmentMin ?? selected.windowStart)}
            </span>
          </p>
          {selectedLeg && (
            <p className="da-detail-line">
              vide {selectedLeg.deadheadMin} min / PEC {selectedLeg.pecMin} min / trajet {selectedLeg.loadedMin} min /
              dépose {selectedLeg.dropoffMin} min · {formatKm(selectedLeg.deadheadKm + selectedLeg.loadedKm, 1)}
              {selectedLeg.kmEstimated ? " · estimé" : ""}
            </p>
          )}
          {(selected.stayMin ?? 0) > 0 && (
            <p className="da-detail-line" data-stay={selected.stayMin}>
              Attente à l'établissement : {selected.stayMin} min
            </p>
          )}
          {shownDepart != null && plannedMin != null && (
            <p className="da-detail-line dpad-times" data-pickup-times>
              Prise en charge {formatMin(shownDepart)} · prévue {formatMin(plannedMin)}
            </p>
          )}
          <div className="da-detail-actions">
            <Button
              size="sm"
              className="da-detail-primary h-11"
              onClick={() => data.dispatch({ type: "BEST_SLOT", transportId: selected.id })}
            >
              Meilleur créneau
            </Button>
            <Button
              size="sm"
              className="h-11"
              variant="secondary"
              onClick={() => data.dispatch({ type: "UNASSIGN", transportId: selected.id })}
            >
              Retirer
            </Button>
            <Button
              size="sm"
              className="h-11"
              variant="secondary"
              onClick={() => data.dispatch({ type: "SNAP_BACK", transportId: selected.id })}
            >
              Heure prévue
            </Button>
            {shownDepart != null && plannedMin != null && (
              <DPad
                selectedId={selected.id}
                departLabel={formatMin(shownDepart)}
                plannedLabel={formatMin(plannedMin)}
                reason={note}
                onNudge={(dir, coalesce) => nudgeRef.current(dir, coalesce)}
              />
            )}
          </div>
        </aside>
      )}
      {!enterprise && <p className="da-fictif">Exemple fictif. Aucune donnée patient réelle.</p>}
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
            Un tap sélectionne la course et affiche la croix. Maintenez : le bloc se soulève, puis glissez. Le planning
            défile si le doigt part avant, et plus vite au bord. Le fantôme teal ou corail montre l'heure calée ; un
            refus porte le motif. Reposer au même endroit n'est pas une modification. Échap, ou relâcher hors de la
            grille, annule. Les flèches de la croix décalent de 5 minutes ou changent de véhicule. Entrée ou Espace
            saisit le bloc : gauche et droite de 5 minutes, Maj de 15, haut et bas changent d'équipage, Entrée pose,
            Échap annule. Le rendez-vous reste dans l'infobulle et le détail.
          </p>
        </Sheet>
      )}
      {ui.sheet === "review" && <ReviewSheet onClose={closeTimelineSheet} />}
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

function buzz() {
  try {
    navigator.vibrate?.(10);
  } catch {
    /* iOS : vibrate absent ou refusé. */
  }
}

function dragTarget(node: HTMLElement | null, transportId: string): HTMLElement | null {
  if (node?.isConnected) return node;
  if (typeof document === "undefined") return null;
  const found = document.querySelector(`[data-transport-id="${transportId}"]`);
  return found instanceof HTMLElement ? found : null;
}

function paintDrag(node: HTMLElement | null, transportId: string, dx: number, dy: number) {
  const target = dragTarget(node, transportId);
  if (!target) return;
  target.style.transition = "none";
  target.style.zIndex = "25";
  target.style.transform = `translate(${dx}px, ${dy}px)`;
}

function clearDragPaint(node: HTMLElement | null, transportId: string) {
  const target = dragTarget(node, transportId);
  if (!target) return;
  target.style.zIndex = "";
  target.style.transform = "";
  target.style.transition = "";
}

function samePlaceOf(drag: DragState, data: ReturnType<typeof useData>): boolean {
  if (!drag.preview?.ok || !drag.hoverCrewId) return false;
  const transport = data.transportById.get(drag.transportId);
  const leg = [...data.schedules.values()]
    .flatMap((schedule) => schedule.legs)
    .find((item) => item.transportId === drag.transportId);
  return sameAssignment(
    transport?.crewId,
    leg?.departMin ?? transport?.departMin,
    drag.hoverCrewId,
    drag.preview.departMin,
  );
}

function revealMinute(departMin: number, pxPerMin: number) {
  const scroller = document.querySelector(".gantt-scroll");
  if (!(scroller instanceof HTMLElement)) return;
  const column = scroller.querySelector("[data-crew-column]");
  const label = column instanceof HTMLElement ? column.getBoundingClientRect().width : 0;
  const x = label + (departMin - DAY_START) * pxPerMin;
  const pad = 72;
  const left = scroller.scrollLeft;
  const right = left + scroller.clientWidth;
  if (x < left + label + pad) scroller.scrollLeft = Math.max(0, x - label - pad);
  else if (x > right - pad) scroller.scrollLeft = x - scroller.clientWidth + pad;
}

function touchById(list: TouchList, id: number): Touch | undefined {
  for (let i = 0; i < list.length; i++) {
    const touch = list.item(i);
    if (touch?.identifier === id) return touch;
  }
  return undefined;
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

function commit(drag: DragState, bag: { data: ReturnType<typeof useData> }) {
  const { data } = bag;
  const release = dragRelease(drag, samePlaceOf(drag, data));
  if (release === "select" || release === "same") {
    data.dispatch({ type: "SELECT", id: drag.transportId });
    return;
  }
  if (release === "unassign") {
    data.dispatch({ type: "UNASSIGN", transportId: drag.transportId });
    return;
  }
  if (release === "assign" && drag.preview?.ok && drag.hoverCrewId) {
    data.dispatch({
      type: "ASSIGN",
      transportId: drag.transportId,
      crewId: drag.hoverCrewId,
      departMin: drag.preview.departMin,
    });
    return;
  }
  if (release === "refuse" && drag.preview && !drag.preview.ok) {
    data.dispatch({ type: "TOAST", message: drag.preview.message, tone: "warn" });
    return;
  }
  if (release === "conflict") {
    data.dispatch({
      type: "TOAST",
      message: CONFLICT_MESSAGE,
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
