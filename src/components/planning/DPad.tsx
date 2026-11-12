import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";

export type PadDir = "up" | "down" | "left" | "right";

const REPEAT_ARM_MS = 380;
const REPEAT_EVERY_MS = 140;

const ARROWS: { dir: PadDir; label: string; glyph: string }[] = [
  { dir: "left", label: "5 minutes plus tôt", glyph: "←" },
  { dir: "right", label: "5 minutes plus tard", glyph: "→" },
  { dir: "up", label: "Véhicule précédent", glyph: "↑" },
  { dir: "down", label: "Véhicule suivant", glyph: "↓" },
];

export function DPad({
  reason,
  onNudge,
}: {
  selectedId: string;
  departLabel: string;
  plannedLabel: string;
  reason: string | null;
  onNudge: (dir: PadDir, coalesce: boolean) => void;
}) {
  const repeatRef = useRef<{ timeout: number; interval: number } | null>(null);
  const nudgeRef = useRef(onNudge);
  nudgeRef.current = onNudge;

  useEffect(() => () => stopRepeat(repeatRef), []);

  const press = (dir: PadDir) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    stopRepeat(repeatRef);
    nudgeRef.current(dir, false);
    const timeout = window.setTimeout(() => {
      nudgeRef.current(dir, true);
      const interval = window.setInterval(() => nudgeRef.current(dir, true), REPEAT_EVERY_MS);
      if (repeatRef.current) repeatRef.current.interval = interval;
    }, REPEAT_ARM_MS);
    repeatRef.current = { timeout, interval: 0 };
  };

  const stop = () => stopRepeat(repeatRef);

  return (
    <div data-dpad className="da-arrows" role="group" aria-label="Déplacer la course">
      {ARROWS.map((arrow) => (
        <button
          key={arrow.dir}
          type="button"
          className="da-arrow"
          aria-label={arrow.label}
          onPointerDown={press(arrow.dir)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onContextMenu={(event) => event.preventDefault()}
        >
          {arrow.glyph}
        </button>
      ))}
      {reason ? (
        <p className="dpad-reason" role="status">
          {reason}
        </p>
      ) : null}
    </div>
  );
}

function stopRepeat(repeatRef: { current: { timeout: number; interval: number } | null }) {
  const current = repeatRef.current;
  if (!current) return;
  window.clearTimeout(current.timeout);
  if (current.interval) window.clearInterval(current.interval);
  repeatRef.current = null;
}
