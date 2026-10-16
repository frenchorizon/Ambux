import { postalOf } from "../data/world";
import { formatMin } from "../lib/format";
import type { Leg } from "./schedule";
import { DEMO_REGULATOR, type Crew, type Location, type Patient, type Transport, type TransportKind } from "./types";

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const MOTIF_LABEL = {
  DIAL: "DIAL - DIALYSE",
  KINE: "KINE - KINE",
  CONS: "CONS - CONSULTATION",
  ORTHO: "ORTHO",
  RADI: "RADI - RADIOTHÉRAPIE",
} as const;

const ROWS_PER_PAGE = 7;

export interface SheetInput {
  missionIso: string;
  editedAt: Date;
  regulator?: string;
  nowMin?: number;
  live?: boolean;
  crews: readonly Crew[];
  transports: readonly Transport[];
  patients: ReadonlyMap<string, Patient>;
  locations: ReadonlyMap<string, Location>;
  legs: ReadonlyMap<string, Leg>;
  crewId?: string;
}

export function planningDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
  const weekday = WEEKDAYS[date.getUTCDay()] ?? "jour";
  return `${weekday} ${day || 1} ${MONTHS[(month || 1) - 1] ?? ""} ${year || 2026}`;
}

export function lomacoPlanningHtml(input: SheetInput): string {
  const crews = input.crewId ? input.crews.filter((crew) => crew.id === input.crewId) : input.crews;
  const sections = crews.map((crew) => crewPages(crew, input)).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Planning IMPRESSION_STD</title>
    <style>
      @page { size: A4 portrait; margin: 10mm 8mm; }
      html, body { margin: 0; background: #fff; color: #000; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; padding: 8mm 0 0; }
      @media print { body { padding: 0; } }
      .page { width: 194mm; max-width: 194mm; min-height: 273mm; margin: 0 auto 8mm; page-break-after: always; box-sizing: border-box; }
      .page:last-child { page-break-after: auto; }
      header { display: grid; grid-template-columns: 1.1fr 1.6fr auto; gap: 6px; align-items: start; margin-bottom: 6px; font-size: 9pt; }
      header .day { font-size: 12pt; }
      header .center { text-align: center; line-height: 1.35; }
      header .page-no { text-align: right; white-space: nowrap; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      col.c-type { width: 16%; }
      col.c-person { width: 24%; }
      col.c-pickup { width: 11%; }
      col.c-rdv { width: 12%; }
      col.c-trip { width: 22%; }
      col.c-crew { width: 15%; }
      th, td { border: 1px solid #000; vertical-align: top; padding: 3px 4px; text-align: left; overflow-wrap: anywhere; box-sizing: border-box; }
      th { font-size: 8pt; font-weight: 700; }
      .person { font-weight: 700; }
      .rdv { font-weight: 700; }
      .city { font-weight: 700; text-transform: uppercase; }
      .sep td { text-align: center; font-weight: 700; letter-spacing: 0.04em; padding: 4px; }
      .muted { font-weight: 400; }
    </style></head><body>${sections || `<section class="page">${head(input, 1, 1)}</section>`}</body></html>`;
}

function crewPages(crew: Crew, input: SheetInput): string {
  const rows = input.transports
    .filter((transport) => !transport.cancelled && transport.crewId === crew.id)
    .map((transport) => ({ transport, leg: input.legs.get(transport.id) }))
    .sort((a, b) => timeOf(a.transport, a.leg) - timeOf(b.transport, b.leg));
  const pages: (typeof rows)[] = [];
  let page: typeof rows = [];
  let used = 0;
  for (const row of rows) {
    const weight = row.transport.note?.trim() ? 2 : 1;
    if (page.length && used + weight > ROWS_PER_PAGE) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(row);
    used += weight;
  }
  pages.push(page);
  return pages
    .map(
      (page, index) => `<section class="page">${head(input, index + 1, pages.length)}
        <table>
          <colgroup>
            <col class="c-type"><col class="c-person"><col class="c-pickup"><col class="c-rdv"><col class="c-trip"><col class="c-crew">
          </colgroup>
          <thead>
            <tr>
              <th rowspan="2">Transport</th>
              <th rowspan="2">Personne transportée</th>
              <th colspan="2">Horaires</th>
              <th rowspan="2">Trajet</th>
              <th rowspan="2">Équipage</th>
            </tr>
            <tr>
              <th>Prise en charge</th>
              <th>RDV / Dépose</th>
            </tr>
          </thead>
          <tbody>${zipRows(page, crew, input)}</tbody>
        </table>
      </section>`,
    )
    .join("");
}

function zipRows(
  page: { transport: Transport; leg: Leg | undefined }[],
  crew: Crew,
  input: SheetInput,
): string {
  if (!page.length) return `<tr><td colspan="6">Aucune course</td></tr>`;
  return page
    .map((unit) => {
      const note = unit.transport.note?.trim();
      const separator = note ? `<tr class="sep"><td colspan="6">${esc(note.toUpperCase())}</td></tr>` : "";
      return transportRow(unit.transport, unit.leg, crew, input) + separator;
    })
    .join("");
}

function transportRow(transport: Transport, leg: Leg | undefined, crew: Crew, input: SheetInput): string {
  const patient = input.patients.get(transport.patientId);
  const home = patient ? input.locations.get(patient.addressId) : undefined;
  const from = input.locations.get(transport.pickupId);
  const to = input.locations.get(transport.dropoffId);
  const pickup = leg ? formatMin(leg.arrivePickup) : "—";
  const rdv = formatMin(transport.appointmentMin ?? transport.windowStart);
  const drop = leg ? formatMin(dropoffMin(leg, transport)) : "—";
  const taken = Boolean(input.live && leg && (input.nowMin ?? 0) >= leg.arrivePickup);
  return `<tr>
    <td>${esc(serviceOf(transport, crew))}<br>${transport.seriesId ? "Série" : "Unique"}<br>${esc(motifOf(transport))}<br>${taken ? "Pris en charge" : "À faire"}</td>
    <td>${personBlock(patient, home)}</td>
    <td>${esc(pickup)}</td>
    <td><div class="rdv">${esc(rdv)}</div><div>${esc(drop)}</div></td>
    <td>${placeBlock(from)}${placeBlock(to)}</td>
    <td>${esc(directionOf(transport.kind))}<br>${esc(vehicleLine(crew))}<br>CN - ${esc(crew.driver)}</td>
  </tr>`;
}

function personBlock(patient: Patient | undefined, home: Location | undefined): string {
  if (!patient) return "";
  const city = home ? `${postalOfCity(home)} ${home.city}`.trim() : "";
  return `<div class="person">${esc(patient.lastName.toUpperCase())} ${esc(patient.firstName)}</div>
    <div>${home ? esc(home.name) : ""}</div>
    <div>${esc(city)}</div>
    <div>${patient.phone ? esc(patient.phone) : ""}</div>
    <div>Né(e) le ${esc(birthLabel(patient))}</div>`;
}

function placeBlock(location: Location | undefined): string {
  if (!location) return "";
  return `<div class="city">${esc(location.city)}</div><div>${esc(location.name)}</div>`;
}

function head(input: SheetInput, page: number, total: number): string {
  const edited = formatEdited(input.editedAt);
  return `<header>
    <div class="day">${esc(planningDate(input.missionIso))}</div>
    <div class="center">Planning - Édité le ${esc(edited)}<br>Par ${esc(input.regulator || DEMO_REGULATOR)}<br>Choix IMPRESSION_STD</div>
    <div class="page-no">Page ${page}/${total}</div>
  </header>`;
}

function serviceOf(transport: Transport, crew: Crew): string {
  if (transport.service) return transport.service;
  if (crew.vehicleType === "ambulance" || transport.posture === "allonge") return "AMB";
  return "VSL";
}

function motifOf(transport: Transport): string {
  if (transport.motif) return MOTIF_LABEL[transport.motif];
  if (transport.kind.startsWith("dialyse")) return MOTIF_LABEL.DIAL;
  return MOTIF_LABEL.CONS;
}

function directionOf(kind: TransportKind): string {
  if (kind === "retour" || kind === "dialyse_retour") return "Retour";
  if (kind === "simple") return "Simple";
  return "Aller";
}

function vehicleLine(crew: Crew): string {
  const code = crew.vehicleCode?.trim();
  return code ? `${code} - ${crew.plate}` : crew.plate;
}

function birthLabel(patient: Patient): string {
  if (patient.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(patient.birthDate)) {
    const [year, month, day] = patient.birthDate.split("-");
    return `${day}/${month}/${year}`;
  }
  return patient.birthYear ? `—/${patient.birthYear}` : "—";
}

function postalOfCity(location: Location): string {
  return location.postalCode || postalOf(location.city);
}

function dropoffMin(leg: Leg, transport: Transport): number {
  const loaded = leg.segments.find((segment) => segment.kind === "loaded");
  if (loaded) return loaded.end;
  const pec1 = Math.max(4, Math.round(transport.serviceMin * 0.58));
  const pec2 = Math.max(3, transport.serviceMin - pec1);
  return leg.endMin - pec2 - Math.max(0, transport.stayMin ?? 0);
}

function timeOf(transport: Transport, leg: Leg | undefined): number {
  return leg?.arrivePickup ?? transport.appointmentMin ?? transport.windowStart;
}

function formatEdited(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} à ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function esc(value: string): string {
  return value.replace(/[&<>]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;"));
}
