import { Clock3, Gauge, Route, ClipboardList } from "lucide-react";
import type { ReactNode } from "react";
import { useClock, useData } from "../game/context";
import { formatKm, formatPct, formatRegulation } from "../lib/format";
import { Hint } from "./ui/tooltip";

export function KpiBar() {
  const { metrics } = useData();
  const { regulationMs } = useClock();
  return (
    <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <Kpi
        icon={<Route size={16} />}
        label="Km à vide"
        value={formatKm(metrics.emptyKm)}
        hint="Kilomètres prévisionnels sans patient, retour dépôt inclus."
        detail={`${formatPct(metrics.emptyRatio)} des km`}
      />
      <Kpi
        icon={<ClipboardList size={16} />}
        label="Transports planifiés"
        value={`${metrics.placed} / ${metrics.total}`}
        hint="Courses affectées à un équipage, hors annulations."
        detail={
          metrics.unassigned
            ? `${metrics.unassigned} non affecté${metrics.unassigned > 1 ? "s" : ""}`
            : "Tout est affecté"
        }
      />
      <Kpi
        icon={<Clock3 size={16} />}
        label="Temps de régulation"
        value={formatRegulation(regulationMs)}
        hint="Temps réel passé au poste, pauses comprises. L'horloge du jeu, elle, est accélérée."
        detail="horloge réelle"
      />
      <Kpi
        icon={<Gauge size={16} />}
        label="Taux de remplissage"
        value={formatPct(metrics.fillRate)}
        hint="Temps productif (trajet patient + prise en charge) divisé par le temps d'équipage disponible."
        detail="temps productif"
      />
    </section>
  );
}

function Kpi({
  icon,
  label,
  value,
  detail,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  hint: string;
}) {
  return (
    <Hint label={hint}>
      <article className="flex items-start gap-3 rounded-xl border border-line bg-white px-3 py-2.5 text-left shadow-sm">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ice text-brand">
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
          <span className="block truncate text-xl font-semibold tabular-nums text-ink">{value}</span>
          <span className="block text-[11px] text-muted">{detail}</span>
        </span>
      </article>
    </Hint>
  );
}
