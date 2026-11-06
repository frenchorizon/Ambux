import { useClock, useData, type DataValue } from "../game/context";
import { lomacoPlanningHtml } from "../game/lomacoSheet";
import { loadWorkspace } from "../game/workspace";
import type { Leg } from "../game/schedule";
import { formatKm, formatMin, personName, postureLabel, vehicleLabel } from "../lib/format";
import {
  EXPORT_PRINT_BLOCKED,
  EXPORT_PRINT_FAILED,
  bannerFromContext,
  frenchDate,
  type PlanningBanner,
} from "../io/exporters/planning";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export function openPrintWindow(html: string, onBlocked: () => void, onPrintFailed?: () => void): void {
  const popup = openBlank();
  if (!popup) {
    onBlocked();
    return;
  }
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  try {
    popup.print();
  } catch {
    (onPrintFailed ?? onBlocked)();
  }
}

export function printLomacoSheets(data: DataValue, crewId?: string, nowMin = 0): void {
  const banner = bannerOf(data);
  const legs = new Map<string, Leg>();
  for (const schedule of data.schedules.values()) {
    for (const leg of schedule.legs) legs.set(leg.transportId, leg);
  }
  const html = lomacoPlanningHtml({
    missionIso: data.missionIso,
    editedAt: new Date(),
    nowMin,
    live: data.live,
    crews: data.crews,
    transports: data.transports,
    patients: data.patientById,
    locations: data.locMap,
    legs,
    crewId,
    society: banner.society,
    depot: banner.depot,
  });
  openPrintWindow(
    html,
    () => blocked(data),
    () => failed(data),
  );
}

export function printSheets(data: DataValue, crewId?: string): void {
  openPrintWindow(
    sheetHtml(data, bannerOf(data), crewId),
    () => blocked(data),
    () => failed(data),
  );
}

export function RouteSheetsDialog({ open }: { open: boolean }) {
  const data = useData();
  const clock = useClock();
  return (
    <Modal
      open={open}
      wide
      onClose={() => data.dispatch({ type: "CLOSE_MODAL" })}
      title="Feuilles de route"
      description={`${data.missionLabel} · une feuille par équipage, trajets à vide compris.`}
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
                {crew.dea
                  ? " · DEA à bord"
                  : crew.vehicleType === "ambulance"
                    ? " · DEA non enregistré"
                    : " · conducteur seul"}
                {meal ? ` · repas ${formatMin(meal.startMin)}–${formatMin(meal.endMin)}` : " · repas non posé"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {legs.length} courses · retour dépôt {formatKm(schedule?.returnKm ?? 0, 1)}
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => printLomacoSheets(data, crew.id, clock.nowMin)}
              >
                Imprimer {crew.code}
              </Button>
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => data.dispatch({ type: "CLOSE_MODAL" })}>
          Fermer
        </Button>
        <Button onClick={() => printLomacoSheets(data, undefined, clock.nowMin)}>Feuille de route Lomaco</Button>
      </div>
    </Modal>
  );
}

function openBlank(): Window | null {
  try {
    return window.open("", "_blank");
  } catch {
    return null;
  }
}

function bannerOf(data: DataValue): PlanningBanner {
  const profile = loadWorkspace();
  return bannerFromContext({
    mode: profile?.mode ?? "demo",
    companyName: profile?.companyName,
    city: profile?.city,
    depotLabel: profile?.mode === "entreprise" ? profile.depot?.label : undefined,
    places: data.locations,
    missionIso: data.missionIso,
  });
}

function blocked(data: DataValue): void {
  data.dispatch({ type: "TOAST", message: EXPORT_PRINT_BLOCKED, tone: "warn" });
}

function failed(data: DataValue): void {
  data.dispatch({ type: "TOAST", message: EXPORT_PRINT_FAILED, tone: "warn" });
}

function sheetHtml(data: DataValue, banner: PlanningBanner, crewId?: string): string {
  const crews = crewId ? data.crews.filter((crew) => crew.id === crewId) : data.crews;
  const sections = crews
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
            <td>${patient ? esc(personName(patient)) : ""}</td>
            <td>${transport ? postureLabel(transport.posture) : ""}</td>
            <td>${from ? esc(`${from.name}, ${from.city}`) : ""}</td>
            <td>${to ? esc(`${to.name}, ${to.city}`) : ""}${transport?.stayMin ? ` · attente ${transport.stayMin} min` : ""}</td>
            <td>${formatKm(leg.deadheadKm, 1)} à vide${leg.kmEstimated ? " · km estimé" : ""}</td>
            <td>${formatKm(leg.loadedKm, 1)}${leg.kmEstimated ? " · km estimé" : ""}</td>
          </tr>`;
        })
        .join("");
      return `<section class="page">
        <header>
          <h1>${esc(banner.society)}</h1>
          <p>${esc(frenchDate(data.missionIso))} · ${esc(data.missionLabel)}</p>
          <p>Dépôt : ${esc(banner.depot)}</p>
        </header>
        <h2>${esc(crew.code)} — ${esc(vehicleLabel(crew.vehicleType))} ${esc(crew.plate)}</h2>
        <p>${esc(crew.driver)}${crew.mate ? " · " + esc(crew.mate) : ""}${crew.dea ? " · DEA à bord" : ""}</p>
        <p>Vacation ${formatMin(crew.shiftStart)} – ${formatMin(crew.shiftEnd)} · Repas : ${meal ? `${formatMin(meal.startMin)} – ${formatMin(meal.endMin)}` : "non placé"} · Retour dépôt ${formatKm(schedule?.returnKm ?? 0, 1)} à vide${schedule?.legs.some((leg) => leg.kmEstimated) ? " · certains km sont estimés" : ""}</p>
        <table>
          <thead><tr><th>Départ</th><th>Prise en charge</th><th>Patient</th><th>Mobilité</th><th>Lieu de prise en charge</th><th>Destination</th><th>À vide</th><th>En charge</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='8'>Aucune course</td></tr>"}</tbody>
        </table>
        <p class="note">La mention DEA n'apparaît que si un DEA est enregistré sur l'équipage. « km estimé » = itinéraire non routier, non opposable. Fichier local. Rien n'est envoyé à Lomaco.</p>
      </section>`;
    })
    .join("");
  const body =
    sections ||
    `<section class="page"><header><h1>${esc(banner.society)}</h1><p>${esc(frenchDate(data.missionIso))}</p><p>Dépôt : ${esc(banner.depot)}</p></header><p>Aucun équipage sur ce planning.</p></section>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Feuille de route ${esc(banner.society)}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      html, body { margin: 0; background: #fff; color: #12283c; }
      body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11pt; }
      .page { page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      header { border-bottom: 2px solid #12283c; margin-bottom: 10px; padding-bottom: 8px; }
      h1 { font-size: 16pt; margin: 0 0 4px; }
      h2 { font-size: 13pt; margin: 12px 0 4px; }
      p { margin: 2px 0 6px; font-size: 10pt; }
      table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 8px 0; }
      th, td { border: 1px solid #c5d0dc; padding: 4px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #eef3f8; font-size: 9pt; }
      .note { margin-top: 8px; font-size: 8pt; color: #445; }
    </style></head><body>
    ${body}
    </body></html>`;
}

function esc(value: string): string {
  return value.replace(/[&<>]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;"));
}
