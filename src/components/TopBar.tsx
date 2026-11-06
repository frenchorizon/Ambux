import { CircleHelp, Ellipsis, FileText, Pause, Play, Redo2, Search, Send, Sparkles, Undo2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { FeedbackButton } from "./feedback/FeedbackForm";
import { screenFromApp } from "../feedback/channel";
import { useClock, useData } from "../game/context";
import { listDrafts } from "../game/persist";
import { loadWorkspace, subscribeWorkspace } from "../game/workspace";
import { DAY_END, DAY_START, type Speed } from "../game/types";
import { formatMin, shortDate } from "../lib/format";
import { useNarrow } from "../lib/useMedia";
import { cn } from "../lib/utils";
import { setTimelineSheet } from "./planning/timelineUi";
import { Button } from "./ui/button";

const SPEEDS: Speed[] = [1, 2, 4];

export function TopBar({ onChangeMode }: { onChangeMode: () => void }) {
  const clock = useClock();
  const data = useData();
  const { view, dispatch, issues, live, missionIso, missionLabel, canUndo, canRedo, undo, redo } = data;
  const narrow = useNarrow();
  const enterprise = useSyncExternalStore(
    subscribeWorkspace,
    () => loadWorkspace()?.mode === "entreprise",
    () => false,
  );
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

  const dateField = (
    <label className="relative inline-flex h-11 min-w-0 flex-1 items-center rounded-lg px-1">
      <span className="truncate text-[15px] font-medium">
        {narrow ? shortDate(missionIso) : planningTitle(missionLabel)}
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
  );

  return (
    <header className={cn("shell-top glass relative", menu ? "z-[80]" : "z-30")}>
      <div className="flex min-h-14 items-center gap-1.5 px-2 sm:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {dateField}
          {!narrow && <DraftVersion missionIso={missionIso} courses={data.transports.length} />}
        </div>
        {!narrow && (
          <>
            <ModeChip onChange={onChangeMode} />
            <IconButton label="Annuler" disabled={!canUndo} onClick={undo}>
              <Undo2 size={18} />
            </IconButton>
            <IconButton label="Rétablir" disabled={!canRedo} onClick={redo}>
              <Redo2 size={18} />
            </IconButton>
          </>
        )}
        {live && (
          <>
            <button
              type="button"
              className="shell-live"
              onClick={() => dispatch({ type: "PAUSE" })}
              aria-label={clock.paused ? "Reprendre" : "Mettre en pause"}
            >
              {clock.paused ? <Play size={16} /> : <Pause size={16} />}
              {formatMin(clock.nowMin, "floor")}
            </button>
            <button
              type="button"
              className="shell-icon text-[13px] font-medium"
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
              className="shell-search"
              aria-label="Rechercher"
              onClick={() => setTimelineSheet("find")}
            >
              <Search size={18} />
              {!narrow && <span>Rechercher</span>}
            </button>
            <button
              type="button"
              data-tour="controle"
              className="shell-icon text-[13px] font-medium"
              aria-label={`À contrôler, ${reviewCount}`}
              onClick={() => setTimelineSheet("review")}
            >
              <span className={cn("shell-count", reviewCount > 0 && "shell-count-alert")}>{reviewCount}</span>
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
          className="shell-icon"
          aria-label="Autres actions"
          aria-expanded={menu}
          onClick={() => setMenu((value) => !value)}
        >
          <Ellipsis size={18} />
        </button>
      </div>
      {live && (
        <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-teal" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {narrow && (
        <div className={cn("flex items-center gap-2 px-2 pb-2", enterprise && "flex-wrap")}>
          <IconButton label="Annuler" disabled={!canUndo} onClick={undo}>
            <Undo2 size={18} />
          </IconButton>
          <IconButton label="Rétablir" disabled={!canRedo} onClick={redo}>
            <Redo2 size={18} />
          </IconButton>
          <DraftVersion missionIso={missionIso} courses={data.transports.length} />
          <button
            type="button"
            className="shell-chip-btn"
            onClick={() => dispatch({ type: "OPEN_MODAL", modal: "import" })}
          >
            Importer
          </button>
          <button
            type="button"
            className="shell-chip-btn"
            onClick={() => dispatch({ type: "OPEN_MODAL", modal: "lomaco" })}
          >
            Exporter
          </button>
          <ModeChip compact onChange={onChangeMode} />
        </div>
      )}
      {menu && (
        <div role="group" aria-label="Autres actions" className="shell-menu glass-opaque">
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

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="shell-icon" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function MenuButton({ label, onClick, icon }: { label: string; onClick: () => void; icon?: ReactNode }) {
  return (
    <button type="button" className="shell-menu-item" onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function DraftVersion({ missionIso, courses }: { missionIso: string; courses: number }) {
  const [version, setVersion] = useState<number | null>(null);
  useEffect(() => {
    const id = window.setTimeout(() => setVersion(listDrafts()[0]?.version ?? null), 0);
    return () => window.clearTimeout(id);
  }, [missionIso, courses]);
  if (version == null) return null;
  return (
    <span className="version-chip" title={`Brouillon v${version}`}>
      v{version}
    </span>
  );
}

function ModeChip({ onChange, compact = false }: { onChange: () => void; compact?: boolean }) {
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  const { phase, view } = useData();
  if (!profile) return null;
  const enterprise = profile.mode === "entreprise";
  const label = enterprise ? profile.companyName || "Entreprise" : "Exemple";
  const feedback = enterprise ? <FeedbackButton ecran={screenFromApp(phase, view)} /> : null;
  if (compact) {
    return (
      <span className={cn("mode-banner mode-banner-inline", enterprise && "is-enterprise")}>
        <button type="button" aria-label="Changer" title="Changer de mode" onClick={onChange}>
          <span>{label}</span>
        </button>
        {feedback}
      </span>
    );
  }
  return (
    <span className={cn("mode-banner mode-banner-inline", enterprise && "is-enterprise")}>
      <span className="truncate">
        <span className="sr-only">Mode </span>
        {label}
      </span>
      {feedback}
      <button type="button" onClick={onChange}>
        Changer
      </button>
    </span>
  );
}

function planningTitle(label: string): string {
  const body = label.replace(/\s+\d{4}$/, "").trim();
  if (!body) return "Planning";
  const lower = body.charAt(0).toLocaleLowerCase("fr-FR") + body.slice(1);
  return `Planning du ${lower}`;
}
