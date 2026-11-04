import { useState } from "react";
import { useData } from "../game/context";
import { freshSeedLabel } from "../game/randomDay";
import type { ConstraintIntensity } from "../game/types";
import { cn } from "../lib/utils";

const LEVELS: { id: ConstraintIntensity; label: string }[] = [
  { id: "faible", label: "Faible" },
  { id: "moyenne", label: "Moyenne" },
  { id: "forte", label: "Forte" },
];

export function RandomDayPanel() {
  const { dayNote, dispatch } = useData();
  const noteKey = dayNote ? `${dayNote.seedLabel}|${dayNote.missions}|${dayNote.intensity}` : "";
  const [sync, setSync] = useState(noteKey);
  const [seed, setSeed] = useState(dayNote?.seedLabel ?? "");
  const [missions, setMissions] = useState(dayNote?.missions ?? 48);
  const [intensity, setIntensity] = useState<ConstraintIntensity>(dayNote?.intensity ?? "moyenne");
  if (sync !== noteKey) {
    setSync(noteKey);
    setSeed(dayNote?.seedLabel ?? seed);
    setMissions(dayNote?.missions ?? missions);
    setIntensity(dayNote?.intensity ?? intensity);
  }

  const copy = () => {
    const label = (dayNote?.seedLabel || seed).trim();
    if (!label) {
      dispatch({ type: "TOAST", tone: "warn", message: "Aucune graine à copier." });
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("seed", label);
    url.searchParams.set("missions", String(missions));
    url.searchParams.set("intensite", intensity);
    void navigator.clipboard
      .writeText(label)
      .then(() => dispatch({ type: "TOAST", tone: "ok", message: `Graine ${label} copiée.` }))
      .catch(() => dispatch({ type: "TOAST", tone: "info", message: `${label} · ${url.pathname}${url.search}` }));
  };

  return (
    <section className="grid gap-3" aria-labelledby="journee-aleatoire">
      <div>
        <h2 id="journee-aleatoire" className="text-sm font-semibold">
          Journée aléatoire
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Autre demande fictive, autour de Rouen. La même graine rejoue la même journée. La journée type du bouton
          Planning en 1 clic ne bouge pas.
        </p>
      </div>
      <label className="block text-sm font-semibold">
        Graine
        <input
          aria-label="Graine"
          value={seed}
          placeholder="ex. rouen-42"
          onChange={(event) => setSeed(event.target.value)}
          className="mt-1 h-12 w-full rounded-xl border border-line bg-card px-3 text-base"
        />
      </label>
      <div className="flex gap-2">
        <button type="button" className="h-11 rounded-xl border border-line px-3 text-sm font-semibold" onClick={copy}>
          Copier la graine
        </button>
      </div>
      <label className="block text-sm font-semibold">
        Nombre de missions · {missions}
        <input
          aria-label="Nombre de missions"
          type="range"
          min={30}
          max={90}
          step={1}
          value={missions}
          onChange={(event) => setMissions(Number(event.target.value))}
          className="mt-2 h-11 w-full"
        />
      </label>
      <div>
        <p className="text-sm font-semibold">Intensité des contraintes</p>
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Intensité des contraintes">
          {LEVELS.map((level) => (
            <button
              key={level.id}
              type="button"
              aria-pressed={intensity === level.id}
              className={cn(
                "h-11 rounded-xl border text-sm font-semibold",
                intensity === level.id ? "border-brand bg-ice text-navy" : "border-line text-muted",
              )}
              onClick={() => setIntensity(level.id)}
            >
              {level.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="h-11 rounded-xl bg-brand px-3 text-sm font-semibold text-white"
        onClick={() =>
          dispatch({
            type: "START_RANDOM",
            seed: seed.trim() || freshSeedLabel(),
            missions,
            intensity,
          })
        }
      >
        Nouvelle journée aléatoire
      </button>
      <p className="text-xs leading-relaxed text-muted">
        Pour rouvrir cette journée, ajoutez ?seed= à l'adresse, avec missions et intensite si besoin.
      </p>
      {dayNote && (
        <div>
          <h3 className="text-sm font-semibold">Contraintes tirées</h3>
          <ul className="mt-2 space-y-2" aria-label="Contraintes de la journée">
            {dayNote.constraints.map((item) => (
              <li key={item.id} className="rounded-xl bg-paper px-3 py-2 text-sm">
                <span className="font-semibold">{item.label}</span>
                <span className="mt-0.5 block text-muted">{item.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
