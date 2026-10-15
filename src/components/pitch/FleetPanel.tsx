import { useState } from "react";
import { useData } from "../../game/context";
import { quotas } from "../../game/generate";
import { listDrafts, loadDraft } from "../../game/persist";
import { MAX_VEHICLES, MISSION_DATE, type Density } from "../../game/types";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export function FleetPanel() {
  const { dispatch } = useData();
  const [amb, setAmb] = useState(3);
  const [vsl, setVsl] = useState(3);
  const [density, setDensity] = useState<Density>("chargee");
  const [demo, setDemo] = useState(true);
  const quota = quotas(density);
  const volume = amb * quota.amb + vsl * quota.vsl;

  return (
    <div className="rounded-3xl border border-line bg-card p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Ouvrir une démo chiffrée</h2>
      <p className="mt-1 text-sm text-muted">
        Mission du {MISSION_DATE}. Jusqu'à {MAX_VEHICLES} véhicules. Données fictives autour de Rouen. Amplitude 11 h, charge max 15 / 25.
      </p>
      <Stepper label="Ambulances" value={amb} min={1} max={Math.min(16, MAX_VEHICLES - vsl)} onChange={setAmb} />
      <Stepper label="VSL" value={vsl} min={1} max={Math.min(16, MAX_VEHICLES - amb)} onChange={setVsl} />
      <div className="mt-4 grid grid-cols-2 gap-2">
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
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={demo} onChange={(event) => setDemo(event.target.checked)} />
        Scénario reproductible
      </label>
      <p className="mt-3 text-sm text-muted">
        Environ {volume} transports · {amb + vsl} équipages · dépôt du Petit-Quevilly.
      </p>
      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={() => {
          sessionStorage.setItem("ambux.tour", "1");
          dispatch({
            type: "START",
            amb,
            vsl,
            density,
            seed: demo ? 20261015 : Math.floor(Math.random() * 1_000_000_000),
          });
        }}
      >
        Préparer ce planning
      </Button>
      <DraftList />
    </div>
  );
}

function DraftList() {
  const { dispatch } = useData();
  const drafts = listDrafts().slice(0, 4);
  if (!drafts.length) return null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-3">
      <div className="text-sm font-semibold">Brouillons dans ce navigateur</div>
      <ul className="mt-2 space-y-1">
        {drafts.map((draft) => (
          <li key={draft.version}>
            <button
              type="button"
              className="w-full rounded-lg px-2 py-1 text-left text-sm hover:bg-card"
              onClick={() => {
                const snapshot = loadDraft(draft.version);
                if (snapshot) dispatch({ type: "RESTORE", snapshot });
              }}
            >
              v{draft.version} · {draft.courses} courses ·{" "}
              {new Date(draft.savedAt).toLocaleString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              })}
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
