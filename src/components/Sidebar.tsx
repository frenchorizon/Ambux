import { ChartNoAxesGantt, Inbox, LayoutDashboard, Map, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { useData } from "../game/context";
import type { ViewId } from "../game/types";
import { cn } from "../lib/utils";
import { useNarrow } from "../lib/useMedia";

const PRIMARY: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: "gantt", label: "Timeline", icon: <ChartNoAxesGantt size={18} /> },
  { id: "carte", label: "Carte", icon: <Map size={18} /> },
  { id: "file", label: "À placer", icon: <Inbox size={18} /> },
  { id: "synthese", label: "Synthèse", icon: <LayoutDashboard size={18} /> },
  { id: "reglages", label: "Réglages", icon: <SlidersHorizontal size={18} /> },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? "#1d6fdb" : "#0c2e4d"} />
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
      <div>
        <div className={cn("font-display text-lg leading-none", light ? "text-white" : "text-ink")}>Ambux</div>
        <div className={cn("mt-1 text-[11px] font-medium", light ? "text-sky-100" : "text-muted")}>Régulateur</div>
      </div>
    </div>
  );
}

export function NavList({ onPick }: { onPick?: () => void }) {
  const { view, dispatch, calls } = useData();
  const pending = calls.filter((call) => call.spawned && !call.resolved).length;
  return (
    <nav className="flex flex-col gap-1">
      {PRIMARY.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={view === item.id}
          pending={item.id === "gantt" ? pending : 0}
          onPick={onPick}
          dispatch={dispatch}
        />
      ))}
    </nav>
  );
}

function NavButton({
  item,
  active,
  pending,
  onPick,
  dispatch,
}: {
  item: { id: ViewId; label: string; icon: ReactNode };
  active: boolean;
  pending: number;
  onPick?: () => void;
  dispatch: ReturnType<typeof useData>["dispatch"];
}) {
  return (
    <button
      type="button"
      onClick={() => {
        dispatch({ type: "SET_VIEW", view: item.id });
        onPick?.();
      }}
      data-tour={item.id === "carte" ? "carte" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition-colors",
        active ? "bg-white/15 text-white" : "text-sky-100/80 hover:bg-white/10 hover:text-white",
      )}
    >
      <span className={cn(active ? "text-sky-200" : "text-sky-100/70")}>{item.icon}</span>
      <span className="flex-1">{item.label}</span>
      {pending > 0 && (
        <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pending}</span>
      )}
    </button>
  );
}

export function Sidebar() {
  const narrow = useNarrow();
  const { dispatch } = useData();
  if (narrow) return null;
  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col bg-navy px-3 py-4 text-white">
      <div className="px-2 pb-5">
        <Logo light />
      </div>
      <NavList />
      <button
        type="button"
        className="mt-auto px-2 pt-4 text-left text-[11px] font-semibold text-sky-100/70 hover:text-white"
        onClick={() => dispatch({ type: "REPLAY" })}
      >
        Retour à l'accueil
      </button>
      <p className="px-2 pt-2 text-[11px] leading-relaxed text-sky-100/60">
        Démo locale pour les sociétés de transport sanitaire. Aucune donnée patient réelle.
      </p>
    </aside>
  );
}

export function BottomNav() {
  const narrow = useNarrow();
  const { view, dispatch } = useData();
  if (!narrow) return null;
  return (
    <nav
      className="grid shrink-0 grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation"
    >
      {PRIMARY.map((item) => {
        const active = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-tour={item.id === "carte" ? "carte" : undefined}
            onClick={() => dispatch({ type: "SET_VIEW", view: item.id })}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold",
              active ? "text-brand" : "text-muted",
            )}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
