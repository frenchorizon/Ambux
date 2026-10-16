import { Armchair, BedDouble } from "lucide-react";
import { useMemo, useState } from "react";
import { useData } from "../../game/context";
import { formatMin, personName } from "../../lib/format";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { LateCallForm, ReoptButton } from "../imprevus/Imprevus";
import type { DragState } from "./drag";

export function UnassignedPanel({ drag }: { drag?: DragState | null }) {
  const { transports, patientById, locMap, dispatch } = useData();
  const [query, setQuery] = useState("");
  const [late, setLate] = useState(false);
  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return transports
      .filter((transport) => !transport.cancelled && !transport.crewId)
      .filter((transport) => {
        if (!needle) return true;
        const patient = patientById.get(transport.patientId);
        const blob =
          `${patient?.lastName ?? ""} ${patient?.firstName ?? ""} ${locMap.get(transport.pickupId)?.short ?? ""} ${locMap.get(transport.dropoffId)?.short ?? ""}`.toLowerCase();
        return blob.includes(needle);
      })
      .sort((a, b) => a.windowStart - b.windowStart || a.dossier.localeCompare(b.dossier));
  }, [transports, patientById, locMap, query]);

  const groups = new Map<number, typeof items>();
  for (const transport of items) {
    const hour = Math.floor(transport.windowStart / 60);
    const list = groups.get(hour) ?? [];
    list.push(transport);
    groups.set(hour, list);
  }

  return (
    <aside
      data-unassigned
      className={cn(
        "flex h-full min-h-0 flex-col border-line bg-paper",
        drag?.overUnassigned && drag.moved && "bg-amber-50",
      )}
    >
      <div className="border-b border-line px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">À placer</h2>
          <span className="text-xs font-semibold text-brand">{items.length}</span>
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Patient, adresse…"
          className="mt-2 h-12 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:ring-2 focus:ring-brand/30"
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-2 h-11 w-full"
          onClick={() => setLate((value) => !value)}
        >
          Appel tardif
        </Button>
        <ReoptButton />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {late && (
          <div className="mb-3 rounded-xl border border-line bg-white p-3">
            <LateCallForm onDone={() => setLate(false)} />
          </div>
        )}
        {items.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-muted">
            Tous les transports sont affectés. Belle régulation.
          </p>
        )}
        {[...groups.entries()].map(([hour, list]) => (
          <div key={hour} className="mb-3">
            <div className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {String(hour).padStart(2, "0")} h
            </div>
            <div className="flex flex-col gap-1.5">
              {list.map((transport) => {
                const patient = patientById.get(transport.patientId);
                const from = locMap.get(transport.pickupId)?.short ?? "Départ";
                const to = locMap.get(transport.dropoffId)?.short ?? "Arrivée";
                return (
                  <article key={transport.id} className="rounded-xl border border-line bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">
                          {patient ? personName(patient) : "Patient"}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {formatMin(transport.windowStart)} – {formatMin(transport.windowEnd)}
                        </div>
                      </div>
                      <Badge
                        className={
                          transport.posture === "allonge" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"
                        }
                      >
                        {transport.posture === "allonge" ? <BedDouble size={11} /> : <Armchair size={11} />}
                        {transport.posture === "allonge" ? "Allongé" : "Assis"}
                      </Badge>
                    </div>
                    <div className="mt-1 truncate text-[11px] text-ink">
                      {from} → {to}
                    </div>
                    {transport.priority === "urgent" && (
                      <div className="mt-1 text-[11px] font-semibold text-rose-600">Urgent</div>
                    )}
                    <Button
                      variant="secondary"
                      className="mt-3 h-12 w-full"
                      onClick={() => dispatch({ type: "BEST_SLOT", transportId: transport.id })}
                    >
                      Meilleur créneau
                    </Button>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
