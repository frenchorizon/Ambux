import type { ReactNode } from "react";
import { useData } from "../game/context";
import { formatMin } from "../lib/format";
import { KpiBar } from "./KpiBar";
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
        <h2 className="mt-6 text-sm font-semibold">À contrôler · {shown.length}</h2>
        <ul className="mt-2 space-y-1">
          {shown.length === 0 && <li className="text-sm text-muted">Rien à signaler hors les kilomètres estimés, s'il y en a.</li>}
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

export function ReglagesView() {
  const { rules, dispatch } = useData();
  const set = (patch: Partial<typeof rules>) => dispatch({ type: "SET_RULES", rules: patch });
  return (
    <div className="h-full overflow-auto">
      <form className="mx-auto grid max-w-lg gap-4 px-4 py-5" onSubmit={(event) => event.preventDefault()}>
        <div>
          <h1 className="text-lg font-semibold">Réglages</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Règles de la société pour ce navigateur. Elles s'appliquent au planning en cours et au prochain. Ce n'est pas un paramétrage réglementaire certifié.
          </p>
        </div>
        <Field label="Pause repas (minutes)">
          <input type="number" min={0} max={90} value={rules.mealMin} onChange={(event) => set({ mealMin: Number(event.target.value) })} className={input} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Repas à partir de">
            <input type="time" value={formatMin(rules.mealFrom)} onChange={(event) => set({ mealFrom: parseTime(event.target.value) })} className={input} />
          </Field>
          <Field label="Jusqu'à">
            <input type="time" value={formatMin(rules.mealTo)} onChange={(event) => set({ mealTo: parseTime(event.target.value) })} className={input} />
          </Field>
        </div>
        <Field label="Tolérance autour du rendez-vous (minutes)">
          <input type="number" min={5} max={60} value={rules.toleranceMin} onChange={(event) => set({ toleranceMin: Number(event.target.value) })} className={input} />
        </Field>
        <Field label="Amplitude de vacation (heures)">
          <input type="number" min={8} max={14} step={0.5} value={rules.amplitudeMin / 60} onChange={(event) => set({ amplitudeMin: Math.round(Number(event.target.value) * 60) })} className={input} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Charge max ambulance">
            <input type="number" min={1} max={40} value={rules.maxAmb} onChange={(event) => set({ maxAmb: Number(event.target.value) })} className={input} />
          </Field>
          <Field label="Charge max VSL">
            <input type="number" min={1} max={40} value={rules.maxVsl} onChange={(event) => set({ maxVsl: Number(event.target.value) })} className={input} />
          </Field>
        </div>
        <Field label="Séance de dialyse (heures)">
          <input type="number" min={1} max={8} step={0.5} value={rules.sessionMin / 60} onChange={(event) => set({ sessionMin: Math.round(Number(event.target.value) * 60) })} className={input} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prise en charge ambulance (min)">
            <input type="number" min={1} max={40} value={rules.pecAmbMin} onChange={(event) => set({ pecAmbMin: Number(event.target.value) })} className={input} />
          </Field>
          <Field label="Prise en charge VSL (min)">
            <input type="number" min={1} max={40} value={rules.pecVslMin} onChange={(event) => set({ pecVslMin: Number(event.target.value) })} className={input} />
          </Field>
        </div>
        <Field label="Dépose (min)">
          <input type="number" min={1} max={40} value={rules.dropoffMin} onChange={(event) => set({ dropoffMin: Number(event.target.value) })} className={input} />
        </Field>
        <p className="text-xs text-muted">Enregistré dans ce navigateur à chaque modification.</p>
      </form>
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
