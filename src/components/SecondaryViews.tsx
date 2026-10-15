import { useMemo, useState } from "react";
import { COMPANIES, CONVENTIONS } from "../data/world";
import { useClock, useData } from "../game/context";
import { optimizePlan } from "../game/optimizer";
import { DAY_START } from "../game/types";
import { formatKm, formatMin, kindLabel, personName, postureLabel, vehicleLabel } from "../lib/format";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export function CrewsView() {
  const data = useData();
  const { nowMin } = useClock();
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Équipages" text="Les équipes en service sur la métropole. Cliquez une carte pour filtrer la timeline." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.crews.map((crew) => {
          const schedule = data.schedules.get(crew.id);
          const legs = schedule?.legs ?? [];
          const empty = legs.reduce((sum, leg) => sum + leg.deadheadKm, 0) + (schedule?.returnKm ?? 0);
          const current = legs.find((leg) => nowMin >= leg.departMin && nowMin < leg.endMin);
          const block = data.blocks.find((item) => item.crewId === crew.id && nowMin >= item.startMin && nowMin < item.endMin);
          const status = block ? block.label : current ? "En course" : crew.delayUntil > nowMin ? "Retard" : "Disponible";
          return (
            <button
              key={crew.id}
              type="button"
              onClick={() => data.dispatch({ type: "SET_CREW_FILTER", crewId: crew.id })}
              className="rounded-2xl border border-line bg-white p-4 text-left shadow-sm hover:border-brand/40"
            >
              <div className="flex items-center gap-2">
                <span className="h-8 w-1.5 rounded-full" style={{ background: crew.color }} />
                <div>
                  <div className="font-semibold">{crew.code}</div>
                  <div className="text-xs text-muted">{vehicleLabel(crew.vehicleType)} · {crew.vehicleName}</div>
                </div>
                <Badge className="ml-auto bg-ice text-navy">{status}</Badge>
              </div>
              <p className="mt-3 text-sm">{crew.driver} et {crew.mate}</p>
              <p className="text-xs text-muted">{crew.plate} · {formatMin(crew.shiftStart)} – {formatMin(crew.shiftEnd)}</p>
              <p className="mt-2 text-sm font-medium">{legs.length} courses · {formatKm(empty)} à vide</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function VehiclesView() {
  const data = useData();
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Véhicules" text="Ambulances pour le brancard, VSL pour le transport assis." />
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        <table className="w-full text-sm">
          <thead className="bg-paper text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Immatriculation</th>
              <th>Type</th>
              <th>Modèle</th>
              <th>Équipage</th>
              <th>Km prévus</th>
            </tr>
          </thead>
          <tbody>
            {data.crews.map((crew) => {
              const schedule = data.schedules.get(crew.id);
              const km = (schedule?.legs ?? []).reduce((sum, leg) => sum + leg.deadheadKm + leg.loadedKm, 0) + (schedule?.returnKm ?? 0);
              return (
                <tr key={crew.id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{crew.plate}</td>
                  <td>{vehicleLabel(crew.vehicleType)}</td>
                  <td>{crew.vehicleName}</td>
                  <td>{crew.code}</td>
                  <td className="tabular-nums">{formatKm(km)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PatientsView() {
  const data = useData();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.patients.filter((patient) => {
      if (!needle) return true;
      return `${patient.lastName} ${patient.firstName}`.toLowerCase().includes(needle);
    });
  }, [data.patients, query]);
  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <PageTitle title="Patients" text="Identités fictives. Cliquez une course pour la retrouver sur la timeline." />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Nom du patient"
        className="mb-3 h-10 max-w-sm rounded-lg border border-line bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand/30"
      />
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-line bg-white">
        {rows.length === 0 && <p className="p-6 text-sm text-muted">Aucun patient ne correspond.</p>}
        {rows.map((patient) => {
          const trips = data.transports.filter((transport) => transport.patientId === patient.id);
          const home = data.locMap.get(patient.addressId);
          return (
            <article key={patient.id} className="border-b border-line px-4 py-3 last:border-b-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{personName(patient)}</h3>
                <span className="text-xs text-muted">{patient.phone} · né(e) en {patient.birthYear}</span>
              </div>
              <p className="text-xs text-muted">{home ? `${home.name}, ${home.city}` : "Adresse"}{patient.note ? ` · ${patient.note}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {trips.map((transport) => (
                  <button
                    key={transport.id}
                    type="button"
                    onClick={() => {
                      data.dispatch({ type: "SELECT", id: transport.id });
                      data.dispatch({ type: "SET_VIEW", view: "gantt" });
                    }}
                    className="rounded-lg bg-paper px-2 py-1 text-left text-xs hover:bg-ice"
                  >
                    <span className="font-semibold">{formatMin(transport.windowStart)}</span> {kindLabel(transport.kind)} · {postureLabel(transport.posture)}
                    {transport.cancelled ? " · annulé" : transport.crewId ? "" : " · non affecté"}
                  </button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function CompaniesView() {
  const { crews } = useData();
  const amb = crews.filter((crew) => crew.vehicleType === "ambulance").length;
  const vsl = crews.filter((crew) => crew.vehicleType === "vsl").length;
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Groupes de sociétés" text="Une holding, trois exploitations. Aujourd'hui vous ne régulez que Rouen." />
      <div className="grid gap-3 md:grid-cols-2">
        {COMPANIES.map((company) => (
          <article key={company.id} className={`rounded-2xl border p-4 shadow-sm ${company.active ? "border-brand bg-white" : "border-line bg-white/70"}`}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{company.name}</h3>
              <Badge className={company.active ? "bg-brand text-white" : "bg-paper text-muted"}>{company.role}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted">{company.city}</p>
            <p className="mt-2 text-sm leading-relaxed">{company.blurb}</p>
            {company.active && (
              <p className="mt-3 text-sm font-medium">{amb} ambulances · {vsl} VSL au planning du jour</p>
            )}
          </article>
        ))}
      </div>
      <h3 className="mb-2 mt-6 text-sm font-semibold">Conventions</h3>
      <div className="grid gap-2 md:grid-cols-3">
        {CONVENTIONS.map((item) => (
          <article key={item.name} className="rounded-xl border border-line bg-white p-3">
            <div className="font-semibold">{item.name}</div>
            <p className="mt-1 text-sm text-muted">{item.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function LomacoView() {
  const data = useData();
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Synchronisation Lomaco" text="Connecteur de démonstration. Les dossiers, horaires et immatriculations partent ensemble." />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Statut</div>
          <div className="mt-1 text-lg font-semibold text-emerald-700">Connecté (démo)</div>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Envois du jour</div>
          <div className="mt-1 text-lg font-semibold">{data.stats.lomacoSends}</div>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <Button onClick={() => data.dispatch({ type: "OPEN_MODAL", modal: "lomaco" })}>Valider et envoyer vers Lomaco</Button>
        </article>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-2xl border border-line bg-white p-4">
          <h3 className="font-semibold">Correspondance des champs</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            <li>N° dossier → référence Ambux</li>
            <li>Patient, départ, arrivée, heure de rendez-vous</li>
            <li>Immatriculation et type ABA / VSL</li>
            <li>Code prestation assis ou allongé</li>
          </ul>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <h3 className="font-semibold">Journal</h3>
          {data.lomaco.length === 0 && <p className="mt-2 text-sm text-muted">Aucune feuille envoyée aujourd'hui.</p>}
          <ul className="mt-2 space-y-2">
            {data.lomaco.map((entry) => (
              <li key={entry.id} className="text-sm">
                <span className="font-mono text-xs text-muted">{formatMin(entry.atMin)}</span> {entry.message}
              </li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  );
}

export function TomorrowView() {
  const data = useData();
  const [running, setRunning] = useState(false);
  const included = data.tomorrowItems.filter((item) => item.include).length;
  const run = () => {
    setRunning(true);
    window.setTimeout(() => {
      const plan = optimizePlan({
        crews: data.crews,
        transports: data.tomorrowTransports,
        blocks: [],
        locations: data.locations,
        nowMin: DAY_START,
        seed: data.seed + 3,
      });
      data.dispatch({ type: "SET_TOMORROW_STOPS", stops: plan.stops });
      setRunning(false);
    }, 30);
  };
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle
        title="Planning du lendemain"
        text="Séries à reconduire : dialyses et retours habituels. Cochez, puis laissez l'optimiseur pré-affecter."
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{included} ligne{included > 1 ? "s" : ""} retenue{included > 1 ? "s" : ""}</span>
        <Button onClick={run} disabled={running || included === 0}>{running ? "Calcul…" : "Optimiser le brouillon"}</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-line bg-white">
        {data.tomorrowItems.length === 0 && <p className="p-4 text-sm text-muted">Aucune série récurrente sur cette journée.</p>}
        {data.tomorrowItems.map((item) => (
          <label key={item.id} className="flex cursor-pointer items-start gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <input
              type="checkbox"
              className="mt-1"
              checked={item.include}
              onChange={() => data.dispatch({ type: "TOGGLE_TOMORROW", id: item.id })}
            />
            <span>
              <span className="block font-semibold">{item.patientName}</span>
              <span className="block text-sm text-muted">
                {item.timeLabel} · {item.from} → {item.to} · {postureLabel(item.posture)} · {vehicleLabel(item.vehicle)}
              </span>
            </span>
          </label>
        ))}
      </div>
      {data.tomorrowStops && (
        <div className="mt-4 rounded-2xl border border-line bg-white p-4">
          <h3 className="font-semibold">Brouillon pré-affecté</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.crews.map((crew) => {
              const stops = data.tomorrowStops!.filter((stop) => stop.crewId === crew.id);
              if (!stops.length) return null;
              return (
                <li key={crew.id}>
                  <span className="font-semibold" style={{ color: crew.color }}>{crew.code}</span>
                  {" — "}
                  {stops
                    .slice()
                    .sort((a, b) => a.departMin - b.departMin)
                    .map((stop) => {
                      const item = data.tomorrowItems.find((entry) => entry.transportId === stop.transportId);
                      return `${formatMin(stop.departMin)} ${item?.patientName ?? ""}`;
                    })
                    .join(" · ")}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-muted">{data.tomorrowStops.length} courses placées pour vendredi.</p>
        </div>
      )}
    </div>
  );
}

function PageTitle({ title, text }: { title: string; text: string }) {
  return (
    <header className="mb-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">{text}</p>
    </header>
  );
}
