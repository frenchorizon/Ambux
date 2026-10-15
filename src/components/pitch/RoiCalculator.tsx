import { useMemo, useState } from "react";

export function RoiCalculator() {
  const [vehicles, setVehicles] = useState(8);
  const [kmDay, setKmDay] = useState(45);
  const [days, setDays] = useState(18);
  const [cut, setCut] = useState(12);
  const [fuel, setFuel] = useState(1.85);
  const [liters, setLiters] = useState(11);
  const [hours, setHours] = useState(2.5);
  const [rate, setRate] = useState(28);
  const [timeCut, setTimeCut] = useState(35);

  const result = useMemo(() => {
    const monthKm = vehicles * kmDay * days;
    const savedKm = monthKm * (cut / 100);
    const savedLiters = savedKm * (liters / 100);
    const fuelEuro = savedLiters * fuel;
    const savedHours = hours * days * (timeCut / 100);
    const laborEuro = savedHours * rate;
    return { monthKm, savedKm, fuelEuro, savedHours, laborEuro, total: fuelEuro + laborEuro };
  }, [vehicles, kmDay, days, cut, fuel, liters, hours, rate, timeCut]);

  return (
    <section id="calculateur" className="scroll-mt-20" aria-labelledby="roi-title">
      <h2 id="roi-title" className="font-display text-3xl text-navy sm:text-4xl">
        Ce que vos chiffres donneraient
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Hypothèse de travail, pas une mesure de votre société. Le carburant part des kilomètres à vide que vous indiquez. Le temps part des heures qu'un régulateur passe à monter le lendemain. Sur le jeu fictif 3+3, l'écart contre un dispatch naïf était d'environ 19 % (292 km contre 361). Sur une journée plus pleine, l'écart peut être proche de zéro. Le curseur est à 12 % pour rester en dessous de ce cas favorable.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Véhicules au planning" value={vehicles} min={1} max={40} step={1} onChange={setVehicles} />
          <Field label="Km à vide / véhicule / jour" value={kmDay} min={5} max={120} step={1} onChange={setKmDay} />
          <Field label="Jours ouvrés / mois" value={days} min={10} max={26} step={1} onChange={setDays} />
          <Field label="Baisse des km à vide (%)" value={cut} min={0} max={30} step={1} onChange={setCut} />
          <Field label="Gazole (€ / L)" value={fuel} min={1} max={3} step={0.01} onChange={setFuel} />
          <Field label="Conso (L / 100 km)" value={liters} min={7} max={18} step={0.5} onChange={setLiters} />
          <Field label="Heures régulateur / jour" value={hours} min={0.5} max={8} step={0.5} onChange={setHours} />
          <Field label="Coût horaire chargé (€)" value={rate} min={15} max={60} step={1} onChange={setRate} />
          <Field label="Part de ce temps évitée (%)" value={timeCut} min={0} max={70} step={5} onChange={setTimeCut} />
        </div>
        <div className="rounded-3xl bg-navy p-6 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Hypothèse mensuelle</p>
          <p className="mt-3 font-display text-5xl">{euro(result.total)}</p>
          <p className="mt-1 text-sm text-sky-100/80">carburant et temps de préparation, additionnés</p>
          <dl className="mt-6 space-y-2 text-sm">
            <Row k="Km à vide du mois" v={`${Math.round(result.monthKm).toLocaleString("fr-FR")} km`} />
            <Row k="Km évités dans l'hypothèse" v={`${Math.round(result.savedKm).toLocaleString("fr-FR")} km`} />
            <Row k="Carburant" v={euro(result.fuelEuro)} />
            <Row k="Heures de préparation" v={`${result.savedHours.toFixed(1).replace(".", ",")} h · ${euro(result.laborEuro)}`} />
          </dl>
          <p className="mt-5 text-xs leading-relaxed text-sky-100/70">
            Aucune de ces sommes n'est un gain garanti, ni un kilomètre opposable à l'Assurance maladie. Changez les curseurs avec vos propres relevés.
          </p>
        </div>
      </div>
    </section>
  );
}

function euro(value: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
      <dt className="text-sky-100/80">{k}</dt>
      <dd className="font-semibold tabular-nums">{v}</dd>
    </div>
  );
}

function Field({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-2xl border border-line bg-card px-3 py-2">
      <span className="text-xs font-semibold text-muted">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full bg-transparent text-lg font-semibold tabular-nums outline-none"
      />
    </label>
  );
}
