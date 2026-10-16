import { CircleHelp, Ellipsis, FileText, Pause, Play, Redo2, Search, Send, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useClock, useData } from "../game/context";
import { listDrafts } from "../game/persist";
import { DAY_END, DAY_START, type Speed } from "../game/types";
import { formatMin, shortDate } from "../lib/format";
import { useNarrow } from "../lib/useMedia";
import { cn } from "../lib/utils";
import { setTimelineSheet } from "./planning/timelineUi";
import { Button } from "./ui/button";

const SPEEDS: Speed[] = [1, 2, 4];

export function TopBar() {
  const clock = useClock();
  const { view, dispatch, issues, live, missionIso, missionLabel, canUndo, canRedo, undo, redo } = useData();
  const narrow = useNarrow();
  const [menu, setMenu] = useState(false);
  const reviewCount = issues.filter((issue) => issue.kind !== "km_estime").length;
  const progress = Math.min(1, Math.max(0, (clock.nowMin - DAY_START) / (DAY_END - DAY_START)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      )
        return;
      if (!live) return;
      if (event.code === "Space") {
        event.preventDefault();
        dispatch({ type: "PAUSE" });
      } else if (event.key === "1") dispatch({ type: "SET_SPEED", speed: 1 });
      else if (event.key === "2") dispatch({ type: "SET_SPEED", speed: 2 });
      else if (event.key === "4") dispatch({ type: "SET_SPEED", speed: 4 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch, live]);

  return (
    <header className={cn("relative border-b border-line bg-card", menu ? "z-[80]" : "z-30")}>
      <div className="flex h-14 items-center gap-1.5 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 px-1">
          <label className="relative inline-flex h-11 min-w-0 shrink items-center rounded-lg px-1">
            <span className="truncate text-xs font-semibold sm:text-sm">
              {narrow ? shortDate(missionIso) : missionLabel}
            </span>
            <input
              type="date"
              aria-label="Date de mission"
              value={missionIso}
              onChange={(event) => {
                if (event.target.value) dispatch({ type: "SET_MISSION", iso: event.target.value });
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          {!narrow && <DraftVersion />}
          <button
            type="button"
            className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-ice disabled:opacity-30"
            aria-label="Annuler"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-xl hover:bg-ice disabled:opacity-30"
            aria-label="Rétablir"
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 size={16} />
          </button>
        </div>
        {live && (
          <>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-1 rounded-xl bg-ice px-2 text-sm font-semibold tabular-nums text-navy"
              onClick={() => dispatch({ type: "PAUSE" })}
              aria-label={clock.paused ? "Reprendre" : "Mettre en pause"}
            >
              {clock.paused ? <Play size={16} /> : <Pause size={16} />}
              {formatMin(clock.nowMin, "floor")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-sm font-semibold hover:bg-ice"
              aria-label={`Vitesse ×${clock.speed}`}
              onClick={() => {
                const next = SPEEDS[(SPEEDS.indexOf(clock.speed) + 1) % SPEEDS.length] ?? 1;
                dispatch({ type: "SET_SPEED", speed: next });
              }}
            >
              ×{clock.speed}
            </button>
          </>
        )}
        {view === "gantt" && (
          <>
            <button
              type="button"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink hover:bg-ice"
              aria-label="Rechercher"
              onClick={() => setTimelineSheet("find")}
            >
              <Search size={18} />
            </button>
            <button
              type="button"
              data-tour="controle"
              className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold hover:bg-ice"
              aria-label={`À contrôler, ${reviewCount}`}
              onClick={() => setTimelineSheet("review")}
            >
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs",
                  reviewCount ? "bg-amber-100 text-amber-900" : "bg-ice text-muted",
                )}
              >
                {reviewCount}
              </span>
            </button>
          </>
        )}
        <Button
          className="h-11 shrink-0 px-3"
          data-tour="generer"
          onClick={() => {
            dispatch({ type: "NOTE_OPTIMIZER" });
            dispatch({ type: "OPEN_MODAL", modal: "optimizer" });
          }}
        >
          <Sparkles size={16} />
          <span className="hidden sm:inline">Générer le planning</span>
          <span className="sm:hidden">Générer</span>
        </Button>
        <button
          type="button"
          data-tour="plus"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl hover:bg-ice"
          aria-label="Autres actions"
          aria-expanded={menu}
          onClick={() => setMenu((value) => !value)}
        >
          <Ellipsis size={18} />
        </button>
      </div>
      {live && (
        <div className="h-1 bg-ice">
          <div className="h-full bg-brand" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {narrow && (
        <div className="flex gap-2 px-2 pb-2">
          <button
            type="button"
            className="h-11 flex-1 rounded-xl bg-ice text-sm font-semibold"
            onClick={() => dispatch({ type: "OPEN_MODAL", modal: "import" })}
          >
            Importer
          </button>
          <button
            type="button"
            className="h-11 flex-1 rounded-xl bg-ice text-sm font-semibold"
            onClick={() => dispatch({ type: "OPEN_MODAL", modal: "lomaco" })}
          >
            Exporter
          </button>
        </div>
      )}
      {menu && (
        <div
          role="group"
          aria-label="Autres actions"
          className="absolute right-2 top-full z-50 mt-1 w-56 rounded-2xl border border-line bg-card p-1 shadow-xl"
        >
          <MenuButton
            icon={<FileText size={16} />}
            label="Importer"
            onClick={() => {
              setMenu(false);
              dispatch({ type: "OPEN_MODAL", modal: "import" });
            }}
          />
          <MenuButton
            icon={<FileText size={16} />}
            label="Feuilles de route"
            onClick={() => {
              setMenu(false);
              dispatch({ type: "OPEN_MODAL", modal: "sheets" });
            }}
          />
          <MenuButton
            icon={<Send size={16} />}
            label="Exporter"
            onClick={() => {
              setMenu(false);
              dispatch({ type: "OPEN_MODAL", modal: "lomaco" });
            }}
          />
          <MenuButton
            icon={<CircleHelp size={16} />}
            label="Aide"
            onClick={() => {
              setMenu(false);
              dispatch({ type: "OPEN_MODAL", modal: "help" });
            }}
          />
        </div>
      )}
    </header>
  );
}

function MenuButton({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button
      type="button"
      className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium hover:bg-ice"
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function DraftVersion() {
  const latest = listDrafts()[0];
  if (!latest) return null;
  return <span className="text-xs font-semibold text-muted">v{latest.version}</span>;
}
