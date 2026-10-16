import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { Basemap } from "./Basemap";
import { useClock, useData } from "../../game/context";
import type { CrewSchedule, Leg } from "../../game/schedule";
import { DAY_END, DAY_START, type Crew, type Location, type Transport } from "../../game/types";
import type { LatLng } from "../../lib/geo";
import { formatMin, vehicleLabel } from "../../lib/format";
import { matrixSource, pathBetween, pointAlong, useRoutingVersion, warmPaths } from "../../lib/routing";
import { cn } from "../../lib/utils";

export function MapPanel() {
  const { crews, seed, live } = useData();
  const { nowMin } = useClock();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [scrub, setScrub] = useState(8 * 60);
  const time = live ? nowMin : scrub;
  const source = matrixSource();
  const shown = (id: string) => visible[id] !== false;
  return (
    <div className="relative h-full min-h-[220px]">
      <MapContainer
        key={seed}
        center={[49.443, 1.099]}
        zoom={14}
        minZoom={10}
        maxZoom={18}
        zoomControl={false}
        className="h-full w-full"
      >
        <ZoomControl zoomInTitle="Zoom avant" zoomOutTitle="Zoom arrière" />
        <Basemap />
        <ResizeMap />
        <Sites />
        {crews.map((crew) => (shown(crew.id) ? <CrewRoute key={crew.id} crew={crew} time={time} /> : null))}
      </MapContainer>
      <div className="absolute bottom-2 left-2 right-16 z-[500] rounded-xl bg-white/95 px-3 py-2 shadow">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted">
          <span>
            {live ? "Position en simulation" : "Position simulée sur l'itinéraire"} · {formatMin(time, "floor")}
          </span>
          <span>
            {source === "osrm" ? "Routes OSRM" : source === "estimate" ? "Tracés estimés" : "Calcul des routes…"}
          </span>
        </div>
        {!live && (
          <input
            type="range"
            min={DAY_START}
            max={DAY_END}
            value={scrub}
            onChange={(event) => setScrub(Number(event.target.value))}
            className="w-full"
            aria-label="Heure de position des véhicules"
          />
        )}
      </div>
      <div className="absolute left-2 top-2 z-[500] flex max-w-[70%] flex-wrap gap-1">
        {crews.map((crew) => (
          <button
            key={crew.id}
            type="button"
            onClick={() => setVisible((current) => ({ ...current, [crew.id]: !shown(crew.id) }))}
            className={cn(
              "rounded-full border px-2 py-1 text-[11px] font-semibold shadow-sm",
              shown(crew.id) ? "text-white" : "bg-white text-muted",
            )}
            style={shown(crew.id) ? { background: crew.color, borderColor: crew.color } : undefined}
          >
            {crew.code}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const id = window.setTimeout(() => map.invalidateSize(), 120);
    const onResize = () => map.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("resize", onResize);
    };
  }, [map]);
  return null;
}

function Sites() {
  const { locations } = useData();
  const sites = locations.filter((location) => location.kind !== "domicile");
  return (
    <>
      {sites.map((site) => (
        <CircleMarker
          key={site.id}
          center={[site.lat, site.lng]}
          radius={site.kind === "depot" ? 8 : 5}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: site.kind === "depot" ? "#0c2e4d" : "#5c7285",
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top">
            <span className="text-xs">
              {site.name}
              <br />
              {site.city}
            </span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

function CrewRoute({ crew, time }: { crew: Crew; time: number }) {
  const { schedules, transportById, locMap } = useData();
  const version = useRoutingVersion();
  const schedule = schedules.get(crew.id);
  const roads = useMemo(() => {
    void version;
    return schedule ? buildRoads(crew, schedule, transportById, locMap) : [];
  }, [crew, schedule, transportById, locMap, version]);
  useEffect(() => {
    warmPaths(roads.filter((road) => road.moves).map((road) => ({ from: road.from, to: road.to })));
  }, [roads]);
  if (!schedule || !roads.length) {
    const base = locMap.get(crew.baseId);
    if (!base) return null;
    return <Vehicle crew={crew} at={base} label="Au dépôt" />;
  }
  const here = positionOnRoads(roads, time) ?? roads[0]!.from;
  const moving = roads.find((road) => time >= road.t0 && time < road.t1 && road.moves);
  const status = moving ? (moving.empty ? "Trajet à vide" : "Patient à bord") : "À l'arrêt";
  return (
    <>
      {roads.map((road) =>
        road.line.length > 1 ? (
          <Polyline
            key={road.id}
            positions={road.line.map(toPair)}
            pathOptions={{
              color: crew.color,
              weight: road.empty ? 3 : 5,
              opacity: road.empty ? 0.55 : 0.95,
              dashArray: road.empty ? "7 7" : undefined,
            }}
          />
        ) : null,
      )}
      <Vehicle crew={crew} at={here} label={`${vehicleLabel(crew.vehicleType)} · ${status}`} />
    </>
  );
}

function Vehicle({ crew, at, label }: { crew: Crew; at: LatLng; label: string }) {
  return (
    <CircleMarker
      center={[at.lat, at.lng]}
      radius={8}
      pathOptions={{ color: "#ffffff", weight: 2, fillColor: crew.color, fillOpacity: 1 }}
    >
      <Tooltip direction="top" permanent={false}>
        <span className="text-xs">
          {crew.code} · {crew.driver}
          <br />
          {label}
        </span>
      </Tooltip>
    </CircleMarker>
  );
}

interface RoadSlice {
  id: string;
  t0: number;
  t1: number;
  from: LatLng;
  to: LatLng;
  line: LatLng[];
  empty: boolean;
  moves: boolean;
}

function buildRoads(
  crew: Crew,
  schedule: CrewSchedule,
  transports: Map<string, Transport>,
  locMap: Map<string, Location>,
): RoadSlice[] {
  const slices: RoadSlice[] = [];
  for (const leg of schedule.legs) {
    const transport = transports.get(leg.transportId);
    const from = locMap.get(leg.fromId);
    const pickup = transport ? locMap.get(transport.pickupId) : undefined;
    const drop = locMap.get(leg.dropoffId);
    if (!from || !pickup || !drop) continue;
    pushRoad(slices, `dead-${leg.transportId}`, leg, "deadhead", from, pickup, true);
    pushRoad(slices, `load-${leg.transportId}`, leg, "loaded", pickup, drop, false);
  }
  const base = locMap.get(crew.baseId);
  const last = schedule.legs.at(-1);
  if (base && last && schedule.returnKm > 0.15) {
    const drop = locMap.get(last.dropoffId);
    if (drop) {
      const path = pathBetween(drop, base);
      slices.push({
        id: `back-${crew.id}`,
        t0: schedule.returnStart,
        t1: schedule.returnEnd,
        from: drop,
        to: base,
        line: path.line,
        empty: true,
        moves: true,
      });
    }
  }
  return slices;
}

function pushRoad(
  slices: RoadSlice[],
  id: string,
  leg: Leg,
  kind: "deadhead" | "loaded",
  from: LatLng,
  to: LatLng,
  empty: boolean,
): void {
  const segment = leg.segments.find((item) => item.kind === kind);
  if (!segment) return;
  const path = pathBetween(from, to);
  slices.push({
    id,
    t0: segment.start,
    t1: segment.end,
    from,
    to,
    line: path.line,
    empty,
    moves: true,
  });
}

function positionOnRoads(roads: readonly RoadSlice[], time: number): LatLng | null {
  if (!roads.length) return null;
  const active = roads.find((road) => time >= road.t0 && time <= road.t1 && road.moves);
  if (active) {
    const span = active.t1 - active.t0;
    const t = span <= 0.05 ? 0 : (time - active.t0) / span;
    return pointAlong(active.line, t);
  }
  const previous = [...roads].reverse().find((road) => road.t1 <= time);
  if (previous) return previous.to;
  return roads[0]!.from;
}

function toPair(point: LatLng): [number, number] {
  return [point.lat, point.lng];
}
