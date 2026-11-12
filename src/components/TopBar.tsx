import { CircleHelp, Ellipsis, FileText, Pause, Play, Redo2, Search, Send, Sparkles, Undo2 } from "lucide-react";
import { matrixSource } from "../lib/routing";
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

  const baselineKm = Number(data.stats.baselineEmptyKm);
  const emptyKm = Number(data.metrics.emptyKm);
  const savedKm = Number.isFinite(baselineKm) && Number.isFinite(emptyKm) ? Math.round(baselineKm - emptyKm) : 0;
  const kmLabel =
    baselineKm > 0
      ? `${savedKm < 0 ? "+" : "−"}${Math.abs(savedKm)} km à vide`
      : `${Math.round(data.metrics.emptyKm)} km à vide`;
  const longDate = missionLabel.replace(/\s+\d{4}$/, "");
  const metaText = narrow
    ? `${weekdayShort(missionIso)} · ${data.metrics.placed} courses · ${kmLabel.replace(" à vide", "")}`
    : `${longDate} · ${data.metrics.placed} courses · ${kmLabel}`;
  const dateField = (
    <div className="da-plan-title min-w-0">
      <p className="da-plan-heading">Demain est posé.</p>
      <p data-plan-meta="" data-courses={data.metrics.placed} data-saved={savedKm}>
        <label className="relative inline-flex items-center">
          <span>{metaText}</span>
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
        <span className="sr-only">{narrow ? shortDate(missionIso) : planningTitle(missionLabel)}</span>
      </p>
    </div>
  );

  return (
    <header className={cn("shell-top glass relative", menu ? "z-[80]" : "z-30")}>
      <div className="da-top-row flex min-h-14 items-center gap-2 px-3">
        {dateField}
        <div className="da-top-actions">
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
          <ModeChip onChange={onChangeMode} missionIso={missionIso} courses={data.transports.length} />
          {!narrow && (
            <div className="da-icon-group">
              <IconButton label="Annuler" disabled={!canUndo} onClick={undo}>
                <Undo2 size={18} />
              </IconButton>
              <IconButton label="Rétablir" disabled={!canRedo} onClick={redo}>
                <Redo2 size={18} />
              </IconButton>
              {view === "gantt" && (
                <button
                  type="button"
                  className="shell-icon"
                  aria-label="Rechercher"
                  onClick={() => setTimelineSheet("find")}
                >
                  <Search size={18} />
                </button>
              )}
            </div>
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
          {view === "gantt" && reviewCount > 0 && (
            <button
              type="button"
              data-tour="controle"
              className="da-check"
              aria-label={`À contrôler, ${reviewCount}`}
              onClick={() => setTimelineSheet("review")}
            >
              {reviewCount} points à vérifier
            </button>
          )}
          {view === "gantt" && reviewCount === 0 && <span data-tour="controle" className="sr-only" />}
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
      </div>
      {live && (
        <div className="mx-3 mb-2 h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-teal" style={{ width: `${progress * 100}%` }} />
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
          {matrixSource() === "estimate" && (
            <p className="routing-banner" role="status">
              Routage dégradé : durées et kilomètres estimés, non opposables. Les courses concernées portent la mention
              « km estimé ».
            </p>
          )}
          {narrow && (
            <>
              <MenuButton
                icon={<Undo2 size={16} />}
                label="Annuler"
                onClick={() => {
                  setMenu(false);
                  undo();
                }}
              />
              <MenuButton
                icon={<Redo2 size={16} />}
                label="Rétablir"
                onClick={() => {
                  setMenu(false);
                  redo();
                }}
              />
              <MenuButton
                icon={<Search size={16} />}
                label="Rechercher"
                onClick={() => {
                  setMenu(false);
                  setTimelineSheet("find");
                }}
              />
            </>
          )}
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

function ModeChip({ onChange, missionIso, courses }: { onChange: () => void; missionIso: string; courses: number }) {
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  const { phase, view } = useData();
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  const enterprise = profile.mode === "entreprise";
  const label = enterprise ? profile.companyName || "Entreprise" : "Exemple";
  const feedback = enterprise ? <FeedbackButton ecran={screenFromApp(phase, view)} /> : null;
  return (
    <span className={cn("mode-banner mode-banner-inline da-exemple", enterprise && "is-enterprise")}>
      <button type="button" className="da-exemple-pill" onClick={() => setOpen((value) => !value)}>
        {label}
      </button>
      {open && (
        <span className="da-exemple-pop">
          <DraftVersion missionIso={missionIso} courses={courses} />
          <button type="button" onClick={onChange}>
            Changer
          </button>
          {feedback}
        </span>
      )}
    </span>
  );
}

function weekdayShort(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
  const days = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
  const months = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${days[date.getUTCDay()]} ${day} ${months[(month || 1) - 1]}`;
}

function planningTitle(label: string): string {
  const body = label.replace(/\s+\d{4}$/, "").trim();
  if (!body) return "Planning";
  const lower = body.charAt(0).toLocaleLowerCase("fr-FR") + body.slice(1);
  return `Planning du ${lower}`;
}
