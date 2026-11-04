import { ChevronRight, Moon, Sun } from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { useData } from "../game/context";
import { emptyDriveMin, naiveBaseline } from "../game/baseline";
import type { ViewId } from "../game/types";
import { formatDuration, formatKm, formatMin } from "../lib/format";
import { useRoutingVersion } from "../lib/routing";
import { toggleTheme, useDark } from "../lib/theme";
import { cn } from "../lib/utils";
import { KpiBar } from "./KpiBar";
import { RandomDayPanel } from "./RandomDayPanel";
import { setTimelineSheet } from "./planning/timelineUi";

export function SyntheseView() {
  const { issues, dispatch } = useData();
  const shown = issues.filter((issue) => issue.kind !== "km_estime");
  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="text-lg font-semibold">Synthèse</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Chiffres de ce planning fictif. Les kilomètres ne sont pas facturables.
        </p>
        <div className="mt-4">
          <KpiBar />
        </div>
        <GainCard />
        <h2 className="mt-6 text-sm font-semibold">À contrôler · {shown.length}</h2>
        <ul className="mt-2 space-y-1">
          {shown.length === 0 && (
            <li className="text-sm text-muted">Rien à signaler hors les kilomètres estimés, s'il y en a.</li>
          )}
          {shown.slice(0, 12).map((issue) => (
            <li key={issue.id} className="text-sm">
              {issue.title}
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-4 h-11 text-sm font-semibold text-brand"
          onClick={() => {
            dispatch({ type: "SET_VIEW", view: "gantt" });
            setTimelineSheet("review");
          }}
        >
          Ouvrir la liste sur la timeline
        </button>
      </div>
    </div>
  );
}

const DATA_LINKS: { id: ViewId; label: string; detail: string }[] = [
  { id: "crews", label: "Équipages", detail: "Conducteurs, auxiliaires, DEA" },
  { id: "vehicles", label: "Véhicules", detail: "Ambulances et VSL du parc" },
  { id: "patients", label: "Patients", detail: "Personnes fictives et adresses" },
  { id: "tomorrow", label: "Demande de demain", detail: "Courses à planifier" },
];

export function ReglagesView() {
  const { rules, dispatch } = useData();
  const dark = useDark();
  const set = (patch: Partial<typeof rules>) => dispatch({ type: "SET_RULES", rules: patch });
  return (
    <div className="h-full overflow-auto">
      <form className="mx-auto grid max-w-lg gap-4 px-4 py-5" onSubmit={(event) => event.preventDefault()}>
        <div>
          <h1 className="text-lg font-semibold">Réglages</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Règles de la société pour ce navigateur. Elles s'appliquent au planning en cours et au prochain. Ce n'est
            pas un paramétrage réglementaire certifié.
          </p>
        </div>
        <section className="glass flex items-center justify-between gap-3 px-3 py-2">
          <div>
            <h2 className="text-sm font-semibold">Affichage</h2>
            <p className="text-xs text-muted">Le choix reste dans ce navigateur.</p>
          </div>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ice px-3 text-sm font-semibold text-navy"
            onClick={() => toggleTheme()}
            aria-pressed={dark}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {dark ? "Mode clair" : "Mode sombre"}
          </button>
        </section>
        <RandomDayPanel />
        <section>
          <h2 className="text-sm font-semibold">Données</h2>
          <p className="mt-1 text-sm text-muted">Équipages, véhicules, patients et demande du lendemain.</p>
          <div className="glass mt-2 overflow-hidden">
            {DATA_LINKS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex min-h-12 w-full items-center gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-ice"
                aria-label={item.label}
                onClick={() => dispatch({ type: "SET_VIEW", view: item.id })}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.label}</span>
                  <span className="block text-xs text-muted">{item.detail}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </button>
            ))}
          </div>
        </section>
        <h2 className="text-sm font-semibold">Règles de planification</h2>
        <Field label="Pause repas (minutes)">
          <input
            type="number"
            min={0}
            max={90}
            value={rules.mealMin}
            onChange={(event) => set({ mealMin: Number(event.target.value) })}
            className={input}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repas à partir de">
            <input
              type="time"
              value={formatMin(rules.mealFrom)}
              onChange={(event) => set({ mealFrom: parseTime(event.target.value) })}
              className={input}
            />
          </Field>
          <Field label="Jusqu'à">
            <input
              type="time"
              value={formatMin(rules.mealTo)}
              onChange={(event) => set({ mealTo: parseTime(event.target.value) })}
              className={input}
            />
          </Field>
        </div>
        <Field label="Tolérance autour du rendez-vous (minutes)">
          <input
            type="number"
            min={5}
            max={60}
            value={rules.toleranceMin}
            onChange={(event) => set({ toleranceMin: Number(event.target.value) })}
            className={input}
          />
        </Field>
        <Field label="Amplitude de vacation (heures)">
          <input
            type="number"
            min={8}
            max={14}
            step={0.5}
            value={rules.amplitudeMin / 60}
            onChange={(event) => set({ amplitudeMin: Math.round(Number(event.target.value) * 60) })}
            className={input}
          />
        </Field>
        <Field label="Séance de dialyse (heures)">
          <input
            type="number"
            min={1}
            max={8}
            step={0.5}
            value={rules.sessionMin / 60}
            onChange={(event) => set({ sessionMin: Math.round(Number(event.target.value) * 60) })}
            className={input}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prise en charge ambulance (min)">
            <input
              type="number"
              min={1}
              max={40}
              value={rules.pecAmbMin}
              onChange={(event) => set({ pecAmbMin: Number(event.target.value) })}
              className={input}
            />
          </Field>
          <Field label="Prise en charge VSL (min)">
            <input
              type="number"
              min={1}
              max={40}
              value={rules.pecVslMin}
              onChange={(event) => set({ pecVslMin: Number(event.target.value) })}
              className={input}
            />
          </Field>
        </div>
        <Field label="Dépose (min)">
          <input
            type="number"
            min={1}
            max={40}
            value={rules.dropoffMin}
            onChange={(event) => set({ dropoffMin: Number(event.target.value) })}
            className={input}
          />
        </Field>
        <p className="text-xs leading-relaxed text-muted">Données stockées uniquement dans ce navigateur.</p>
        <button
          type="button"
          className="h-11 text-left text-sm font-semibold text-brand"
          onClick={() => dispatch({ type: "REPLAY" })}
        >
          Retour à l'accueil
        </button>
      </form>
    </div>
  );
}

function GainCard() {
  const data = useData();
  const version = useRoutingVersion();
  const gain = useMemo(() => {
    void version;
    const baseline = naiveBaseline({
      crews: data.crews,
      transports: data.transports,
      blocks: data.blocks,
      locMap: data.locMap,
      rules: data.rules,
    });
    return { baseline, driveMin: emptyDriveMin(data.schedules) };
  }, [data.blocks, data.crews, data.locMap, data.rules, data.schedules, data.transports, version]);

  const base = gain.baseline.metrics;
  const savedKm = base.emptyKm - data.metrics.emptyKm;
  const savedMin = gain.baseline.emptyDriveMin - gain.driveMin;
  const placedDelta = data.metrics.placed - base.placed;

  return (
    <article className="glass mt-4 px-3 py-3 shadow-sm">
      <h2 className="text-sm font-semibold">Gain vs planning initial</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Le planning initial pose les courses dans l'ordre des rendez-vous, chacune sur le premier équipage qui peut la
        prendre. Tolérance, charge, pause et amplitude sont les mêmes.
      </p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
        <GainStat
          label="Km à vide"
          value={deltaText(savedKm, formatKm(Math.abs(savedKm)))}
          detail={`${formatKm(data.metrics.emptyKm)} au lieu de ${formatKm(base.emptyKm)}`}
          gain={savedKm > 0.5}
        />
        <GainStat
          label="Temps de trajet à vide"
          value={deltaText(savedMin, formatDuration(savedMin))}
          detail={`${formatDuration(gain.driveMin)} au lieu de ${formatDuration(gain.baseline.emptyDriveMin)}`}
          gain={savedMin > 0.5}
        />
        <GainStat
          label="Courses placées"
          value={placedText(data.metrics.placed, placedDelta)}
          detail={`Planning initial : ${base.placed} sur ${base.total}`}
        />
      </dl>
    </article>
  );
}

function deltaText(saved: number, amount: string): string {
  if (saved > 0.5) return `${amount} en moins`;
  if (saved < -0.5) return `${amount} en plus`;
  return "Identique";
}

function placedText(placed: number, delta: number): string {
  if (delta > 0) return `${placed}, soit ${delta} de plus`;
  if (delta < 0) return `${placed}, soit ${-delta} de moins`;
  return `${placed}, comme le planning initial`;
}

function GainStat({
  label,
  value,
  detail,
  gain = false,
}: {
  label: string;
  value: string;
  detail: string;
  gain?: boolean;
}) {
  return (
    <div className="rounded-lg bg-paper px-3 py-2">
      <dt className="text-[13px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className={cn("mt-1 text-base font-light tracking-tight tabular-nums", gain ? "text-gain" : "text-ink")}>
        {value}
      </dd>
      <p className="mt-0.5 text-[13px] leading-snug text-muted">{detail}</p>
    </div>
  );
}

const input = "mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function parseTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 12 * 60;
  return hours * 60 + minutes;
}
