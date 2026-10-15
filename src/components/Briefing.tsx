import { useState } from "react";
import { useData } from "../game/context";
import { quotas } from "../game/generate";
import { listDrafts, loadDraft } from "../game/persist";
import type { Density } from "../game/types";
import { MAX_VEHICLES, MISSION_DATE } from "../game/types";
import { cn } from "../lib/utils";
import { Logo } from "./Sidebar";
import { Button } from "./ui/button";

export function Briefing() {
  const { dispatch } = useData();
  const [amb, setAmb] = useState(3);
  const [vsl, setVsl] = useState(3);
  const [density, setDensity] = useState<Density>("chargee");
  const [demo, setDemo] = useState(true);
  const quota = quotas(density);
  const volume = amb * quota.amb + vsl * quota.vsl;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.15fr_0.85fr]">
      <section className="flex flex-col justify-between bg-navy px-6 py-8 text-white sm:px-10">
        <Logo light />
        <div className="max-w-xl py-10">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">Transport sanitaire · Rouen</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight sm:text-5xl">Le planning de demain, sur la route réelle.</h1>
          <p className="mt-4 text-base leading-relaxed text-sky-100/90">
            Ambux prépare les feuilles de route du lendemain pour le transport sanitaire programmé : fenêtres horaires, pauses repas, trajets à vide et kilométrage issu du réseau routier autour de Rouen.
          </p>
          <ol className="mt-6 space-y-2 text-sm text-sky-100/85">
            <li>1. Chargez ou saisissez les transports de demain.</li>
            <li>2. Générez le planning, puis ajustez-le sur la timeline.</li>
            <li>3. Imprimez les feuilles de route et exportez le CSV du planning.</li>
          </ol>
        </div>
        <p className="text-xs text-sky-100/60">{MISSION_DATE} · données fictives · brouillon enregistré dans ce navigateur</p>
      </section>
      <section className="flex items-center bg-paper px-6 py-10">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-line bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">Planning de demain</h2>
          <p className="mt-1 text-sm text-muted">
            Mission du {MISSION_DATE}. Jusqu'à {MAX_VEHICLES} véhicules. Amplitude 11 h, prises de poste décalées, 15 courses max par ambulance et 25 par VSL. La simulation en direct reste à part.
          </p>
          <Stepper label="Ambulances" value={amb} min={1} max={Math.min(16, MAX_VEHICLES - vsl)} onChange={setAmb} />
          <Stepper label="VSL" value={vsl} min={1} max={Math.min(16, MAX_VEHICLES - amb)} onChange={setVsl} />
          <div className="mt-4">
            <div className="text-sm font-semibold">Densité</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ["normale", "Journée type"],
                  ["chargee", "Journée chargée"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setDensity(id)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    density === id ? "border-brand bg-ice text-navy" : "border-line text-muted",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} />
            Scénario démo reproductible
          </label>
          <p className="mt-3 text-sm text-muted">Environ {volume} transports · {amb + vsl} équipages · dépôt du Petit-Quevilly.</p>
          <DraftList />
          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={() =>
              dispatch({
                type: "START",
                amb,
                vsl,
                density,
                seed: demo ? 20261015 : Math.floor(Math.random() * 1_000_000_000),
              })
            }
          >
            Préparer le planning
          </Button>
        </div>
      </section>
    </div>
  );
}

function DraftList() {
  const { dispatch } = useData();
  const drafts = listDrafts().slice(0, 4);
  if (!drafts.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-3">
      <div className="text-sm font-semibold">Brouillons enregistrés</div>
      <ul className="mt-2 space-y-1">
        {drafts.map((draft) => (
          <li key={draft.version}>
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-white"
              onClick={() => {
                const snapshot = loadDraft(draft.version);
                if (snapshot) dispatch({ type: "RESTORE", snapshot });
              }}
            >
              v{draft.version} · {draft.courses} courses · {new Date(draft.savedAt).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <span className="text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="h-8 w-8 rounded-lg border border-line" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Moins de ${label}`}>
          −
        </button>
        <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
        <button type="button" className="h-8 w-8 rounded-lg border border-line" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Plus de ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}
