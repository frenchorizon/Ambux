import { ChartNoAxesGantt, Clock, Heart, Map, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { useData } from "../game/context";
import { loadWorkspace } from "../game/workspace";
import type { ViewId } from "../game/types";
import { useDark } from "../lib/theme";
import { cn } from "../lib/utils";
import { useNarrow } from "../lib/useMedia";

const PRIMARY: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: "gantt", label: "Timeline", icon: <ChartNoAxesGantt size={18} /> },
  { id: "carte", label: "Carte", icon: <Map size={18} /> },
  { id: "file", label: "À placer", icon: <Clock size={18} /> },
  { id: "synthese", label: "Synthèse", icon: <Heart size={18} /> },
  { id: "reglages", label: "Réglages", icon: <Settings size={18} /> },
];

export function Logo({
  light = false,
  compact = false,
  wordmark = false,
}: {
  light?: boolean;
  compact?: boolean;
  wordmark?: boolean;
}) {
  if (wordmark) {
    return <div className={cn("font-display text-lg leading-none", light ? "text-white" : "text-ink")}>Ambux</div>;
  }
  return (
    <div className={cn("flex items-center", compact ? "gap-1.5" : "gap-2.5")}>
      <svg viewBox="0 0 32 32" className={cn("shrink-0", compact ? "h-7 w-7" : "h-9 w-9")} aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--color-brand)" />
        <path
          d="M6.5 21.5c3.4-7 6.6-7 9.4-2.6 1.8 2.8 3.6 3.1 9.6-1.2"
          fill="none"
          stroke="#b9d4ff"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="24.6" cy="18.2" r="1.7" fill="#7eb6ff" />
        <path d="M16 6.6v5.8M13.1 9.5h5.8" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <div className={compact ? "min-w-0" : undefined}>
        <div
          className={cn(
            "font-display leading-none",
            compact ? "text-[15px]" : "text-lg",
            light ? "text-white" : "text-ink",
          )}
        >
          Ambux
        </div>
        {!compact && (
          <div className={cn("mt-1 text-[13px] font-medium", light ? "text-white/75" : "text-muted")}>Régulateur</div>
        )}
      </div>
    </div>
  );
}

function useShellCounts() {
  const { calls, metrics } = useData();
  const callsPending = calls.filter((call) => call.spawned && !call.resolved).length;
  return { callsPending, queue: metrics.unassigned };
}

export function NavList({ onPick }: { onPick?: () => void }) {
  const { view, dispatch } = useData();
  const counts = useShellCounts();
  return (
    <nav className="flex flex-col gap-1" aria-label="Navigation">
      {PRIMARY.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={view === item.id}
          count={badgeCount(item.id, counts)}
          onPick={onPick}
          dispatch={dispatch}
        />
      ))}
    </nav>
  );
}

function badgeCount(id: ViewId, counts: { callsPending: number; queue: number }): number {
  if (id === "file") return counts.queue;
  if (id === "gantt") return counts.callsPending;
  return 0;
}

function NavButton({
  item,
  active,
  count,
  onPick,
  dispatch,
}: {
  item: { id: ViewId; label: string; icon: ReactNode };
  active: boolean;
  count: number;
  onPick?: () => void;
  dispatch: ReturnType<typeof useData>["dispatch"];
}) {
  return (
    <button
      type="button"
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      onClick={() => {
        dispatch({ type: "SET_VIEW", view: item.id });
        onPick?.();
      }}
      data-tour={item.id === "carte" ? "carte" : undefined}
      className="nav-item"
      title={item.label}
    >
      {item.icon}
      <span className="nav-label">{item.label}</span>
      {count > 0 && (
        <span className={cn("nav-badge", item.id === "gantt" && "nav-badge-alert")} aria-hidden>
          {count}
        </span>
      )}
    </button>
  );
}

export function Sidebar() {
  const narrow = useNarrow();
  const dark = useDark();
  const { dispatch } = useData();
  const enterprise = loadWorkspace()?.mode === "entreprise";
  if (narrow) return null;
  return (
    <aside className="shell-side glass">
      <div className="px-1 pb-3">
        <Logo light={dark} wordmark />
      </div>
      <NavList />
      <button
        type="button"
        className="shell-back"
        title="Retour à l'accueil"
        onClick={() => dispatch({ type: "REPLAY" })}
      >
        <span className="sr-only">Retour à l'accueil</span>
        <span aria-hidden="true">←</span>
      </button>
      {enterprise ? <p className="shell-note">Dans ce navigateur.</p> : null}
    </aside>
  );
}

export function BottomNav() {
  const narrow = useNarrow();
  const { view, dispatch } = useData();
  const counts = useShellCounts();
  if (!narrow) return null;
  return (
    <nav className="shell-tabs glass" aria-label="Navigation">
      {PRIMARY.map((item) => {
        const active = view === item.id;
        const count = badgeCount(item.id, counts);
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            data-tour={item.id === "carte" ? "carte" : undefined}
            onClick={() => dispatch({ type: "SET_VIEW", view: item.id })}
            className="shell-tab"
          >
            <span className="relative">
              {item.icon}
              {count > 0 && (
                <span className={cn("nav-badge nav-badge-float", item.id === "gantt" && "nav-badge-alert")} aria-hidden>
                  {count}
                </span>
              )}
            </span>
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
