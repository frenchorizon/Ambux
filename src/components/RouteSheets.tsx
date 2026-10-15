import { useData } from "../game/context";
import { MISSION_DATE } from "../game/types";
import { formatKm, formatMin, personName, postureLabel, vehicleLabel } from "../lib/format";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export function RouteSheetsDialog({ open }: { open: boolean }) {
  const data = useData();
  const print = () => {
    const html = sheetHtml(data);
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) {
      data.dispatch({ type: "TOAST", message: "Autorisez les fenêtres pour imprimer les feuilles.", tone: "warn" });
      return;
    }
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  };
  return (
    <Modal
      open={open}
      wide
      onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
      title="Feuilles de route"
      description={`${MISSION_DATE} · une feuille par équipage, trajets à vide compris.`}
    >
      <div className="max-h-[50vh] space-y-3 overflow-auto">
        {data.crews.map((crew) => {
          const schedule = data.schedules.get(crew.id);
          const meal = data.blocks.find((block) => block.crewId === crew.id && block.kind === "repas");
          const legs = schedule?.legs ?? [];
          return (
            <article key={crew.id} className="rounded-xl border border-line p-3">
              <div className="font-semibold">
                {crew.code} · {vehicleLabel(crew.vehicleType)} {crew.plate}
              </div>
              <p className="text-xs text-muted">
                {crew.driver}
                {crew.mate ? ` · ${crew.mate}` : ""}
                {crew.dea ? " · DEA à bord" : crew.vehicleType === "ambulance" ? " · DEA non enregistré" : " · conducteur seul"}
                {meal ? ` · repas ${formatMin(meal.startMin)}–${formatMin(meal.endMin)}` : " · repas non posé"}
              </p>
              <p className="mt-1 text-xs text-muted">{legs.length} courses · retour dépôt {formatKm(schedule?.returnKm ?? 0, 1)}</p>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => data.dispatch({ type: "CLOSE_MODAL" })}>
          Fermer
        </Button>
        <Button onClick={print}>Imprimer / PDF</Button>
      </div>
    </Modal>
  );
}

function sheetHtml(data: ReturnType<typeof useData>): string {
  const sections = data.crews
    .map((crew) => {
      const schedule = data.schedules.get(crew.id);
      const meal = data.blocks.find((block) => block.crewId === crew.id && block.kind === "repas");
      const rows = (schedule?.legs ?? [])
        .map((leg) => {
          const transport = data.transportById.get(leg.transportId);
          const patient = transport ? data.patientById.get(transport.patientId) : undefined;
          const from = transport ? data.locMap.get(transport.pickupId) : undefined;
          const to = transport ? data.locMap.get(transport.dropoffId) : undefined;
          return `<tr>
            <td>${formatMin(leg.departMin)}</td>
            <td>${formatMin(leg.arrivePickup)}${leg.deviationMin ? ` (${leg.deviationMin > 0 ? "+" : ""}${leg.deviationMin} min)` : ""}</td>
            <td>${patient ? personName(patient) : ""}</td>
            <td>${transport ? postureLabel(transport.posture) : ""}</td>
            <td>${from ? `${from.name}, ${from.city}` : ""}</td>
            <td>${to ? `${to.name}, ${to.city}` : ""}</td>
            <td>${formatKm(leg.deadheadKm, 1)} à vide${leg.kmEstimated ? " · km estimé" : ""}</td>
            <td>${formatKm(leg.loadedKm, 1)}${leg.kmEstimated ? " · km estimé" : ""}</td>
          </tr>`;
        })
        .join("");
      return `<section>
        <h2>${crew.code} — ${vehicleLabel(crew.vehicleType)} ${crew.plate}</h2>
        <p>${crew.driver}${crew.mate ? " · " + crew.mate : ""}${crew.dea ? " · DEA à bord" : ""}</p>
        <p>Vacation ${formatMin(crew.shiftStart)} – ${formatMin(crew.shiftEnd)} · Repas : ${meal ? `${formatMin(meal.startMin)} – ${formatMin(meal.endMin)}` : "non placé"} · Retour dépôt ${formatKm(schedule?.returnKm ?? 0, 1)} à vide${schedule?.legs.some((leg) => leg.kmEstimated) ? " · certains km sont estimés" : ""}</p>
        <table>
          <thead><tr><th>Départ</th><th>Prise en charge</th><th>Patient</th><th>Mobilité</th><th>Lieu de prise en charge</th><th>Destination</th><th>À vide</th><th>En charge</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='8'>Aucune course</td></tr>"}</tbody>
        </table>
      </section>`;
    })
    .join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Feuilles de route Ambux</title>
    <style>
      body { font-family: sans-serif; color: #12283c; margin: 24px; }
      h1 { font-size: 20px; }
      h2 { font-size: 16px; margin-bottom: 0; }
      p { margin: 4px 0 8px; font-size: 12px; color: #445; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 28px; }
      th, td { border: 1px solid #d5e2ee; padding: 4px 6px; text-align: left; }
      th { background: #e7f1fb; }
      section { break-inside: avoid; }
    </style></head><body>
    <h1>Ambux — feuilles de route du ${MISSION_DATE}</h1>
    <p>Dépôt Sud, Le Petit-Quevilly. La mention DEA n'apparaît que si un DEA est enregistré sur l'équipage. « km estimé » = itinéraire non routier, non opposable.</p>
    ${sections}
    </body></html>`;
}
