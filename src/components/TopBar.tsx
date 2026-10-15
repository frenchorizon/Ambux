import { CircleHelp, FastForward, FileText, Pause, Play, Send, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { useClock, useData } from "../game/context";
import { DEMO_DATE, DAY_END, DAY_START, type Speed } from "../game/types";
import { formatMin } from "../lib/format";
import { cn } from "../lib/utils";
import { MobileNav } from "./Sidebar";
import { Button } from "./ui/button";

const SPEEDS: Speed[] = [1, 2, 4];

export function TopBar() {
  const clock = useClock();
  const { view, dispatch, phase, metrics, live } = useData();
  const progress = Math.min(1, Math.max(0, (clock.nowMin - DAY_START) / (DAY_END - DAY_START)));
  const titles: Record<string, string> = {
    gantt: "Timeline du planning",
    tomorrow: "Demande de demain",
    crews: "Équipages",
    vehicles: "Véhicules",
    patients: "Patients",
    companies: "Groupes de sociétés",
    lomaco: "Synchronisation Lomaco",
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLButtonElement
      ) {
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        dispatch({ type: "PAUSE" });
      } else if (event.key === "1") dispatch({ type: "SET_SPEED", speed: 1 });
      else if (event.key === "2") dispatch({ type: "SET_SPEED", speed: 2 });
      else if (event.key === "4") dispatch({ type: "SET_SPEED", speed: 4 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  return (
    <header className="relative border-b border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <MobileNav />
        <div className="min-w-[140px]">
          <div className="text-sm font-semibold text-ink">{titles[view] ?? "Ambux"}</div>
          <div className="text-[11px] text-muted">{DEMO_DATE}</div>
        </div>
        {live ? (
          <div className="flex items-center gap-1.5 rounded-xl bg-ice px-2 py-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-navy shadow-sm"
              onClick={() => dispatch({ type: "PAUSE" })}
              aria-label={clock.paused ? "Reprendre" : "Mettre en pause"}
            >
              {clock.paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <div className="px-1 text-center">
              <div className="font-mono text-lg font-semibold tabular-nums leading-none text-navy">
                {formatMin(clock.nowMin, "floor")}
              </div>
              <div className="text-[10px] text-muted">simulation</div>
            </div>
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => dispatch({ type: "SET_SPEED", speed })}
                className={cn(
                  "h-8 rounded-lg px-2 text-xs font-bold",
                  clock.speed === speed ? "bg-navy text-white" : "text-navy hover:bg-white",
                )}
              >
                ×{speed}
              </button>
            ))}
            <FastForward size={14} className="hidden text-muted sm:block" />
            <button type="button" className="px-1 text-[11px] font-semibold text-navy" onClick={() => dispatch({ type: "SET_LIVE", live: false })}>
              Quitter
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="rounded-xl border border-line px-2 py-1 text-[11px] font-semibold text-muted hover:bg-ice"
            onClick={() => dispatch({ type: "SET_LIVE", live: true })}
          >
            Simuler la journée
          </button>
        )}
        {metrics.lateCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
            {metrics.lateCount} retard{metrics.lateCount > 1 ? "s" : ""}
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Comment jouer" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "help" })}>
            <CircleHelp size={18} />
          </Button>
          {live && phase === "playing" && (
            <Button size="sm" variant="ghost" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "closeDay" })}>
              Clôturer
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => {
              dispatch({ type: "NOTE_OPTIMIZER" });
              dispatch({ type: "OPEN_MODAL", modal: "optimizer" });
            }}
          >
            <Sparkles size={14} /> Générer le planning
          </Button>
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "sheets" })}>
            <FileText size={14} /> Feuilles de route
          </Button>
          <Button variant="secondary" size="sm" onClick={() => dispatch({ type: "OPEN_MODAL", modal: "lomaco" })}>
            <Send size={14} /> Envoyer vers Lomaco
          </Button>
        </div>
      </div>
      {live && (
        <div className="h-1 bg-ice">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </header>
  );
}
