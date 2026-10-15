import {
  Building,
  Cable,
  CalendarClock,
  ChartNoAxesGantt,
  Menu,
  Stethoscope,
  Truck,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useData } from "../game/context";
import type { ViewId } from "../game/types";
import { cn } from "../lib/utils";
import { useNarrow } from "../lib/useMedia";
import { Modal } from "./ui/dialog";

const ITEMS: { id: ViewId; label: string; icon: ReactNode }[] = [
  { id: "tomorrow", label: "Planning du lendemain", icon: <CalendarClock size={18} /> },
  { id: "gantt", label: "Timeline Gantt", icon: <ChartNoAxesGantt size={18} /> },
  { id: "crews", label: "Équipages", icon: <Users size={18} /> },
  { id: "vehicles", label: "Véhicules", icon: <Truck size={18} /> },
  { id: "patients", label: "Patients", icon: <Stethoscope size={18} /> },
  { id: "companies", label: "Groupes de sociétés", icon: <Building size={18} /> },
  { id: "lomaco", label: "Synchronisation Lomaco", icon: <Cable size={18} /> },
];

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-9 w-9 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="9" fill={light ? "#1d6fdb" : "#163e66"} />
        <path
          d="M6 22h7.2l2.1-6.4 2.2 4.3H26"
          fill="none"
          stroke="#9ec5ff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23.2" cy="10.5" r="2.2" fill="#7eb6ff" />
        <path d="M15 7.2v5.6M12.2 10h5.6" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <div>
        <div className={cn("text-base font-bold leading-none", light ? "text-white" : "text-ink")}>Ambux</div>
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
      {ITEMS.map((item) => {
        const active = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              dispatch({ type: "SET_VIEW", view: item.id });
              onPick?.();
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
              active ? "bg-white/15 text-white" : "text-sky-100/80 hover:bg-white/10 hover:text-white",
            )}
          >
            <span className={cn(active ? "text-sky-200" : "text-sky-100/70")}>{item.icon}</span>
            <span className="flex-1">{item.label}</span>
            {item.id === "gantt" && pending > 0 && (
              <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{pending}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  const narrow = useNarrow();
  if (narrow) return null;
  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col bg-navy px-3 py-4 text-white">
      <div className="px-2 pb-5">
        <Logo light />
      </div>
      <NavList />
      <p className="mt-auto px-2 pt-4 text-[11px] leading-relaxed text-sky-100/60">
        Démo locale pour les sociétés de transport sanitaire. Aucune donnée patient réelle.
      </p>
    </aside>
  );
}

export function MobileNav() {
  const narrow = useNarrow();
  const [open, setOpen] = useState(false);
  if (!narrow) return null;
  return (
    <>
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-navy hover:bg-ice"
        aria-label="Ouvrir le menu"
        onClick={() => setOpen(true)}
      >
        <Menu size={18} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Navigation">
        <div className="rounded-xl bg-navy p-2">
          <NavList onPick={() => setOpen(false)} />
        </div>
      </Modal>
    </>
  );
}
