import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";

export type PadDir = "up" | "down" | "left" | "right";

const REPEAT_ARM_MS = 380;
const REPEAT_EVERY_MS = 140;

export function DPad({
  selectedId,
  departLabel,
  plannedLabel,
  reason,
  onNudge,
}: {
  selectedId: string;
  departLabel: string;
  plannedLabel: string;
  reason: string | null;
  onNudge: (dir: PadDir, coalesce: boolean) => void;
}) {
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);
  const padRef = useRef<HTMLDivElement>(null);
  const moveRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const repeatRef = useRef<{ timeout: number; interval: number } | null>(null);
  const nudgeRef = useRef(onNudge);
  nudgeRef.current = onNudge;

  useEffect(() => () => stopRepeat(repeatRef), []);

  if (hiddenFor === selectedId) return null;

  const stop = () => stopRepeat(repeatRef);

  const press = (dir: PadDir) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* évènement synthétique */
    }
    stopRepeat(repeatRef);
    nudgeRef.current(dir, false);
    const timeout = window.setTimeout(() => {
      nudgeRef.current(dir, true);
      const interval = window.setInterval(() => nudgeRef.current(dir, true), REPEAT_EVERY_MS);
      if (repeatRef.current) repeatRef.current.interval = interval;
    }, REPEAT_ARM_MS);
    repeatRef.current = { timeout, interval: 0 };
  };

  const onHandleDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = padRef.current?.getBoundingClientRect();
    if (!rect) return;
    moveRef.current = { pointerId: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* évènement synthétique */
    }
  };

  const onHandleMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = moveRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const rect = padRef.current?.getBoundingClientRect();
    const width = rect?.width ?? 220;
    const height = rect?.height ?? 240;
    const left = Math.min(window.innerWidth - width - 4, Math.max(4, event.clientX - current.dx));
    const top = Math.min(window.innerHeight - height - 4, Math.max(4, event.clientY - current.dy));
    setPlaced({ left, top });
  };

  const onHandleUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (moveRef.current?.pointerId !== event.pointerId) return;
    moveRef.current = null;
  };

  return createPortal(
    <div
      ref={padRef}
      className={placed ? "dpad dpad-placed" : "dpad"}
      data-dpad
      style={placed ? { left: placed.left, top: placed.top } : undefined}
      role="group"
      aria-label="Déplacer la course"
    >
      <div className="dpad-cross">
        <div className="dpad-glow" aria-hidden />
        <button type="button" className="dpad-btn dpad-up" aria-label="Véhicule précédent" onPointerDown={press("up")} onPointerUp={stop} onPointerCancel={stop} onContextMenu={(event) => event.preventDefault()}>
          <Triangle dir="up" />
        </button>
        <button type="button" className="dpad-btn dpad-left" aria-label="5 minutes plus tôt" onPointerDown={press("left")} onPointerUp={stop} onPointerCancel={stop} onContextMenu={(event) => event.preventDefault()}>
          <Triangle dir="left" />
        </button>
        <div
          className="dpad-handle"
          role="button"
          aria-label="Déplacer la croix"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
        <button type="button" className="dpad-btn dpad-right" aria-label="5 minutes plus tard" onPointerDown={press("right")} onPointerUp={stop} onPointerCancel={stop} onContextMenu={(event) => event.preventDefault()}>
          <Triangle dir="right" />
        </button>
        <button type="button" className="dpad-btn dpad-down" aria-label="Véhicule suivant" onPointerDown={press("down")} onPointerUp={stop} onPointerCancel={stop} onContextMenu={(event) => event.preventDefault()}>
          <Triangle dir="down" />
        </button>
        <button type="button" className="dpad-close" aria-label="Fermer la croix" onClick={() => setHiddenFor(selectedId)}>
          ×
        </button>
      </div>
      <p className="dpad-times">
        Prise en charge {departLabel} · prévue {plannedLabel}
      </p>
      {reason && (
        <p className="dpad-reason" role="status">
          {reason}
        </p>
      )}
    </div>,
    document.body,
  );
}

function stopRepeat(repeatRef: { current: { timeout: number; interval: number } | null }) {
  const current = repeatRef.current;
  if (!current) return;
  window.clearTimeout(current.timeout);
  if (current.interval) window.clearInterval(current.interval);
  repeatRef.current = null;
}

function Triangle({ dir }: { dir: PadDir }) {
  const turn = dir === "right" ? 90 : dir === "down" ? 180 : dir === "left" ? 270 : 0;
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" style={{ transform: `rotate(${turn}deg)` }} aria-hidden>
      <polygon points="12,4 21,19 3,19" fill="#ffffff" />
    </svg>
  );
}
