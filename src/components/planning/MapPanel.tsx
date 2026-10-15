import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";
import { useClock, useData } from "../../game/context";
import type { CrewSchedule } from "../../game/schedule";
import type { Crew, Location } from "../../game/types";
import { lerpCoord, type LatLng } from "../../lib/geo";
import { vehicleLabel } from "../../lib/format";
import { cn } from "../../lib/utils";

interface TimedPoint extends LatLng {
  t: number;
}

export function MapPanel() {
  const { crews, seed } = useData();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const shown = (id: string) => visible[id] !== false;
  return (
    <div className="relative h-full min-h-[220px]">
      <MapContainer
        key={seed}
        center={[49.443, 1.09]}
        zoom={12}
        minZoom={10}
        maxZoom={16}
        zoomControl={false}
        className="h-full w-full"
      >
        <ZoomControl zoomInTitle="Zoom avant" zoomOutTitle="Zoom arrière" />
        <TileLayer
          attribution='&copy; OpenStreetMap &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <ResizeMap />
        <Sites />
        {crews.map((crew) =>
          shown(crew.id) ? <CrewRoute key={crew.id} crew={crew} /> : null,
        )}
      </MapContainer>
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

function CrewRoute({ crew }: { crew: Crew }) {
  const { schedules, transportById, locMap } = useData();
  const { nowMin } = useClock();
  const schedule = schedules.get(crew.id);
  const points = useMemo(
    () => (schedule ? buildTrack(crew, schedule, transportById, locMap) : []),
    [crew, schedule, transportById, locMap],
  );
  if (!schedule || points.length < 2) {
    const base = locMap.get(crew.baseId);
    if (!base) return null;
    return <Vehicle crew={crew} at={base} label="Au dépôt" />;
  }
  const { done, todo } = splitTrack(points, nowMin);
  const here = positionAt(points, nowMin) ?? points[0]!;
  const leg = schedule.legs.find((item) => nowMin >= item.departMin && nowMin < item.endMin);
  const status = leg ? "En course" : nowMin > (schedule.legs.at(-1)?.endMin ?? 0) ? "Retour / dispo" : "En attente";
  return (
    <>
      {done.length > 1 && (
        <Polyline positions={done.map(toPair)} pathOptions={{ color: crew.color, weight: 3, opacity: 0.35 }} />
      )}
      {todo.length > 1 && (
        <>
          <Polyline positions={todo.map(toPair)} pathOptions={{ color: "#ffffff", weight: 7, opacity: 0.9 }} />
          <Polyline positions={todo.map(toPair)} pathOptions={{ color: crew.color, weight: 4, opacity: 0.95 }} />
        </>
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

function buildTrack(
  crew: Crew,
  schedule: CrewSchedule,
  transports: Map<string, { pickupId: string }>,
  locMap: Map<string, Location>,
): TimedPoint[] {
  const points: TimedPoint[] = [];
  for (const leg of schedule.legs) {
    const transport = transports.get(leg.transportId);
    const from = locMap.get(leg.fromId);
    const pickup = transport ? locMap.get(transport.pickupId) : undefined;
    const drop = locMap.get(leg.dropoffId);
    if (!from || !pickup || !drop) continue;
    const loaded = leg.segments.find((segment) => segment.kind === "loaded");
    for (const segment of leg.segments) {
      const atPickup = !loaded || segment.end <= loaded.start + 0.1;
      if (segment.kind === "deadhead") {
        points.push({ t: segment.start, lat: from.lat, lng: from.lng });
        points.push({ t: segment.end, lat: pickup.lat, lng: pickup.lng });
      } else if (segment.kind === "loaded") {
        points.push({ t: segment.start, lat: pickup.lat, lng: pickup.lng });
        points.push({ t: segment.end, lat: drop.lat, lng: drop.lng });
      } else if (atPickup) {
        points.push({ t: segment.start, lat: pickup.lat, lng: pickup.lng });
        points.push({ t: segment.end, lat: pickup.lat, lng: pickup.lng });
      } else {
        points.push({ t: segment.start, lat: drop.lat, lng: drop.lng });
        points.push({ t: segment.end, lat: drop.lat, lng: drop.lng });
      }
    }
  }
  const base = locMap.get(crew.baseId);
  const last = schedule.legs.at(-1);
  if (base && last && schedule.returnKm > 0) {
    const drop = locMap.get(last.dropoffId);
    if (drop) {
      points.push({ t: schedule.returnStart, lat: drop.lat, lng: drop.lng });
      points.push({ t: schedule.returnEnd, lat: base.lat, lng: base.lng });
    }
  }
  return points;
}

function positionAt(points: TimedPoint[], time: number): LatLng | null {
  if (!points.length) return null;
  if (time <= points[0]!.t) return points[0]!;
  const last = points[points.length - 1]!;
  if (time >= last.t) return last;
  for (let index = 1; index < points.length; index++) {
    const next = points[index]!;
    const prev = points[index - 1]!;
    if (time <= next.t) {
      const span = next.t - prev.t;
      const t = span <= 0.001 ? 0 : (time - prev.t) / span;
      return lerpCoord(prev, next, t);
    }
  }
  return last;
}

function splitTrack(points: TimedPoint[], time: number): { done: LatLng[]; todo: LatLng[] } {
  const here = positionAt(points, time);
  const done: LatLng[] = [];
  const todo: LatLng[] = [];
  for (const point of points) {
    if (point.t <= time) done.push(point);
    else todo.push(point);
  }
  if (here) {
    if (!done.length || done[done.length - 1] !== here) done.push(here);
    todo.unshift(here);
  }
  return { done, todo };
}

function toPair(point: LatLng): [number, number] {
  return [point.lat, point.lng];
}
