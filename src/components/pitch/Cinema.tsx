import { useEffect, useMemo, useState } from "react";
import { MapContainer, Polyline } from "react-leaflet";
import { Basemap } from "../planning/Basemap";
import { useData } from "../../game/context";
import { optimizePlan, type PlanResult } from "../../game/optimizer";
import { scheduleFleet } from "../../game/schedule";
import type { Crew, Transport } from "../../game/types";
import { formatKm } from "../../lib/format";
import { pathBetween, useRoutingVersion, warmPaths } from "../../lib/routing";
import { Button } from "../ui/button";

export function Cinema({ onClose }: { onClose: () => void }) {
  const data = useData();
  const version = useRoutingVersion();
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(0);
  const reduced = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setPlan(
          optimizePlan({
            crews: data.crews,
            transports: data.transports,
            blocks: data.blocks,
            locations: data.locations,
            nowMin: -1,
            seed: data.seed,
            rules: data.rules,
          }),
        );
      } catch {
        setError("Le calcul n'a pas abouti.");
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [data.blocks, data.crews, data.locations, data.rules, data.seed, data.transports]);

  const visible = !plan ? 0 : reduced ? data.crews.length : shown;

  useEffect(() => {
    if (!plan || reduced) return;
    const id = window.setInterval(() => {
      setShown((value) => {
        if (value >= data.crews.length) {
          window.clearInterval(id);
          return value;
        }
        return value + 1;
      });
    }, 420);
    return () => window.clearInterval(id);
  }, [plan, data.crews.length, reduced]);

  const placed = plan
    ? Math.round((Math.min(visible, data.crews.length) / Math.max(1, data.crews.length)) * plan.metrics.placed)
    : 0;

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-navy text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cinema-title"
    >
      <div className="flex items-end justify-between gap-4 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200">Données fictives · Rouen</p>
          <h2 id="cinema-title" className="font-display text-3xl sm:text-4xl">
            Planning de demain
          </h2>
        </div>
        <div className="text-right">
          <div className="font-display text-4xl tabular-nums">{plan ? placed : "…"}</div>
          <div className="text-xs text-sky-100/80">{plan ? `courses sur ${plan.metrics.total}` : "calcul"}</div>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <MapContainer
          center={[49.443, 1.09]}
          zoom={12}
          zoomControl={false}
          className="h-full w-full"
          attributionControl
        >
          <Basemap />
          {plan && <Reveal plan={plan} shown={visible} version={version} />}
        </MapContainer>
        <div className="pointer-events-none absolute bottom-4 left-4 right-4 flex flex-wrap gap-2">
          <Pill>{plan ? formatKm(plan.metrics.emptyKm) + " à vide" : "Calcul des tournées…"}</Pill>
          <Pill>{plan ? `${plan.metrics.lateCount} hors créneau` : "Règles dures"}</Pill>
          <Pill>{plan ? `${plan.unassignedIds.length} à traiter` : "Pause, charge, amplitude"}</Pill>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="max-w-xl text-xs leading-relaxed text-sky-100/75">
          {error ??
            "Les traits apparaissent équipage par équipage. Kilomètres de ce calcul, estimés tant que le routier n'a pas répondu. Rien n'est facturable."}
        </p>
        <Button
          disabled={!plan}
          onClick={() => {
            if (!plan) return;
            data.dispatch({ type: "APPLY_STOPS", stops: plan.stops, meals: plan.meals });
            onClose();
          }}
        >
          Ouvrir le planning
        </Button>
      </div>
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return <span className="rounded-full bg-navy/85 px-3 py-1 text-xs font-semibold shadow">{children}</span>;
}

function Reveal({ plan, shown, version }: { plan: PlanResult; shown: number; version: number }) {
  const data = useData();
  const lines = useMemo(() => {
    void version;
    const transports: Transport[] = data.transports.map((transport) => {
      const stop = plan.stops.find((item) => item.transportId === transport.id);
      if (!stop) return { ...transport, crewId: undefined, departMin: undefined };
      return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
    });
    const blocks = [...data.blocks.filter((block) => block.kind !== "repas"), ...plan.meals];
    const schedules = scheduleFleet(data.crews, transports, blocks, data.locMap);
    const pairs: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }[] = [];
    const drawn: { id: string; color: string; positions: [number, number][] }[] = [];
    data.crews.forEach((crew, index) => {
      if (index >= shown) return;
      const schedule = schedules.get(crew.id);
      if (!schedule) return;
      for (const leg of schedule.legs) {
        const transport = data.transportById.get(leg.transportId);
        if (!transport) continue;
        pushLeg(drawn, pairs, crew, leg.fromId, transport.pickupId, `${leg.transportId}-vide`, true, data);
        pushLeg(drawn, pairs, crew, transport.pickupId, transport.dropoffId, `${leg.transportId}-charge`, false, data);
      }
    });
    warmPaths(pairs);
    return drawn;
  }, [data, plan.meals, plan.stops, shown, version]);

  return (
    <>
      {lines.map((line) => (
        <Polyline
          key={line.id}
          positions={line.positions}
          pathOptions={{ color: line.color, weight: 4, opacity: 0.9, className: "route-live" }}
        />
      ))}
    </>
  );
}

function pushLeg(
  drawn: { id: string; color: string; positions: [number, number][] }[],
  pairs: { from: { lat: number; lng: number }; to: { lat: number; lng: number } }[],
  crew: Crew,
  fromId: string,
  toId: string,
  id: string,
  empty: boolean,
  data: ReturnType<typeof useData>,
): void {
  const from = data.locMap.get(fromId);
  const to = data.locMap.get(toId);
  if (!from || !to) return;
  pairs.push({ from, to });
  const path = pathBetween(from, to);
  drawn.push({
    id: `${crew.id}-${id}`,
    color: empty ? "#94a3b8" : crew.color,
    positions: path.line.map((point) => [point.lat, point.lng]),
  });
}
