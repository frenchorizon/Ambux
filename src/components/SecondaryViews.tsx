import { COMPANIES, CONVENTIONS } from "../data/world";
import { useData } from "../game/context";
import { formatMin } from "../lib/format";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

export { CrewsView, PatientsView, TomorrowView, VehiclesView } from "./Editors";

export function CompaniesView() {
  const { crews } = useData();
  const amb = crews.filter((crew) => crew.vehicleType === "ambulance").length;
  const vsl = crews.filter((crew) => crew.vehicleType === "vsl").length;
  return (
    <div className="h-full overflow-auto p-4">
      <PageTitle title="Groupes de sociétés" text="Une holding, trois exploitations. Aujourd'hui vous préparez Rouen." />
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
              <p className="mt-3 text-sm font-medium">{amb} ambulances · {vsl} VSL au planning</p>
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
      <PageTitle title="Export du planning" text="Le fichier CSV reprend le planning retenu, y compris les courses à traiter. Il n'y a pas d'envoi fictif." />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <article className="rounded-2xl border border-line bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Statut</div>
          <div className="mt-1 text-lg font-semibold">Fichier local</div>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">Exports</div>
          <div className="mt-1 text-lg font-semibold">{data.stats.lomacoSends}</div>
        </article>
        <article className="rounded-2xl border border-line bg-white p-4">
          <Button onClick={() => data.dispatch({ type: "OPEN_MODAL", modal: "lomaco" })}>Exporter le CSV</Button>
        </article>
      </div>
      <article className="rounded-2xl border border-line bg-white p-4">
        <h3 className="font-semibold">Journal</h3>
        {data.lomaco.length === 0 && <p className="mt-2 text-sm text-muted">Aucune feuille envoyée.</p>}
        <ul className="mt-2 space-y-2">
          {data.lomaco.map((entry) => (
            <li key={entry.id} className="text-sm">
              <span className="font-mono text-xs text-muted">{formatMin(entry.atMin)}</span> {entry.message}
            </li>
          ))}
        </ul>
      </article>
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
