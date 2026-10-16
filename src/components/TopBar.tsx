import { CircleHelp, Ellipsis, FileText, Moon, Pause, Play, Search, Send, Sparkles, Sun } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useClock, useData } from "../game/context";
import { listDrafts } from "../game/persist";
import { DAY_END, DAY_START, MISSION_DATE, type Speed, type ViewId } from "../game/types";
import { formatMin } from "../lib/format";
import { toggleTheme, useDark } from "../lib/theme";
import { useNarrow } from "../lib/useMedia";
import { cn } from "../lib/utils";
import { setTimelineSheet } from "./planning/timelineUi";
import { Button } from "./ui/button";

const SPEEDS: Speed[] = [1, 2, 4];

export function TopBar() {
  const clock = useClock();
  const { view, dispatch, phase, issues, live } = useData();
  const dark = useDark();
  const narrow = useNarrow();
  const [menu, setMenu] = useState(false);
  const reviewCount = issues.filter((issue) => issue.kind !== "km_estime").length;
  const progress = Math.min(1, Math.max(0, (clock.nowMin - DAY_START) / (DAY_END - DAY_START)));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement) return;
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
    <header className="relative z-30 border-b border-line bg-card">
      <div className="flex h-14 items-center gap-1.5 px-2">
        <div className="min-w-0 flex-1 px-1">
          <div className="truncate text-sm font-semibold">{dateLine(narrow)}</div>
        </div>
        {live && (
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1 rounded-xl bg-ice px-2 text-sm font-semibold tabular-nums text-navy"
            onClick={() => dispatch({ type: "PAUSE" })}
            aria-label={clock.paused ? "Reprendre" : "Mettre en pause"}
          >
            {clock.paused ? <Play size={16} /> : <Pause size={16} />}
            {formatMin(clock.nowMin, "floor")}
          </button>
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
              <span className={cn("rounded-full px-2 py-0.5 text-xs", reviewCount ? "bg-amber-100 text-amber-900" : "bg-ice text-muted")}>
                {reviewCount}
              </span>
            </button>
          </>
        )}
        <Button
          className="h-11 px-3"
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
      {menu && (
        <div className="absolute right-2 top-14 z-50 w-64 rounded-2xl border border-line bg-card p-1 shadow-xl">
          <MenuButton icon={<FileText size={16} />} label="Feuilles de route" onClick={() => { setMenu(false); dispatch({ type: "OPEN_MODAL", modal: "sheets" }); }} />
          <MenuButton icon={<Send size={16} />} label="Exporter le CSV" onClick={() => { setMenu(false); dispatch({ type: "OPEN_MODAL", modal: "lomaco" }); }} />
          <MenuButton label="Feuille équipage" onClick={() => go(dispatch, setMenu, "feuille")} />
          <MenuButton label="Demande de demain" onClick={() => go(dispatch, setMenu, "tomorrow")} />
          <MenuButton label="Équipages" onClick={() => go(dispatch, setMenu, "crews")} />
          <MenuButton label="Véhicules" onClick={() => go(dispatch, setMenu, "vehicles")} />
          <MenuButton label="Patients" onClick={() => go(dispatch, setMenu, "patients")} />
          {live ? (
            <>
              <div className="flex gap-1 px-2 py-1">
                {SPEEDS.map((speed) => (
                  <button key={speed} type="button" className={cn("h-10 flex-1 rounded-lg text-sm font-semibold", clock.speed === speed ? "bg-navy text-white" : "bg-ice")} onClick={() => dispatch({ type: "SET_SPEED", speed })}>
                    ×{speed}
                  </button>
                ))}
              </div>
              {phase === "playing" && (
                <MenuButton label="Clôturer la journée" onClick={() => { setMenu(false); dispatch({ type: "OPEN_MODAL", modal: "closeDay" }); }} />
              )}
              <MenuButton label="Quitter la simulation" onClick={() => { setMenu(false); dispatch({ type: "SET_LIVE", live: false }); }} />
            </>
          ) : (
            <MenuButton label="Simuler la journée" onClick={() => { setMenu(false); dispatch({ type: "SET_LIVE", live: true }); }} />
          )}
          <MenuButton icon={dark ? <Sun size={16} /> : <Moon size={16} />} label={dark ? "Mode clair" : "Mode sombre"} onClick={() => { setMenu(false); toggleTheme(); }} />
          <MenuButton icon={<CircleHelp size={16} />} label="Aide" onClick={() => { setMenu(false); dispatch({ type: "OPEN_MODAL", modal: "help" }); }} />
          <MenuButton label="Retour à l'accueil" onClick={() => { setMenu(false); dispatch({ type: "REPLAY" }); }} />
        </div>
      )}
    </header>
  );
}

function MenuButton({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium hover:bg-ice" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function go(dispatch: ReturnType<typeof useData>["dispatch"], setMenu: (value: boolean) => void, view: ViewId) {
  setMenu(false);
  dispatch({ type: "SET_VIEW", view });
}

function dateLine(narrow: boolean): string {
  const latest = listDrafts()[0];
  const date = narrow ? "16 oct. 2026" : MISSION_DATE;
  return latest ? `${date} · v${latest.version}` : date;
}
