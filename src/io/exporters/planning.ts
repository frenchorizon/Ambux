import type { CrewSchedule } from "../../game/schedule";
import type { Crew, Location, Patient, Transport } from "../../game/types";
import { formatDuration, formatMin } from "../../lib/format";

export const PLANNING_COLUMNS = [
  { id: "date", label: "Date" },
  { id: "heure_debut", label: "Heure début" },
  { id: "patient", label: "Patient" },
  { id: "adresse_pec", label: "Adresse PEC" },
  { id: "adresse_depose", label: "Adresse dépose" },
  { id: "equipe", label: "Équipe" },
  { id: "vehicule", label: "Véhicule" },
  { id: "duree", label: "Durée estimée" },
] as const;

export type PlanningColumn = (typeof PLANNING_COLUMNS)[number]["id"];

export interface PlanningChoice {
  columns: PlanningColumn[];
  from: string;
  to: string;
}

const CHOICE_KEY = "ambux.io.planningChoice";

export function defaultPlanningChoice(missionIso: string): PlanningChoice {
  return { columns: PLANNING_COLUMNS.map((column) => column.id), from: missionIso, to: missionIso };
}

export function loadPlanningChoice(
  missionIso: string,
  storage: Pick<Storage, "getItem"> | null = browserStorage(),
): PlanningChoice {
  const fallback = defaultPlanningChoice(missionIso);
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(storage.getItem(CHOICE_KEY) ?? "null") as Partial<PlanningChoice> | null;
    if (!parsed) return fallback;
    const known = new Set<string>(PLANNING_COLUMNS.map((column) => column.id));
    const columns = (parsed.columns ?? []).filter((id): id is PlanningColumn => known.has(id));
    return {
      columns: columns.length ? columns : fallback.columns,
      from: isoOr(parsed.from, missionIso),
      to: isoOr(parsed.to, missionIso),
    };
  } catch {
    return fallback;
  }
}

export function savePlanningChoice(
  choice: PlanningChoice,
  storage: Pick<Storage, "setItem"> | null = browserStorage(),
): void {
  storage?.setItem(CHOICE_KEY, JSON.stringify(choice));
}

export function inPlanningRange(iso: string, from: string, to: string): boolean {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  return iso >= start && iso <= end;
}

export interface PlanningInput {
  crews: readonly Crew[];
  transports: readonly Transport[];
  patients: ReadonlyMap<string, Patient>;
  locations: ReadonlyMap<string, Location>;
  schedules: ReadonlyMap<string, CrewSchedule>;
  missionIso: string;
  from: string;
  to: string;
  columns: readonly PlanningColumn[];
}

/** Libellé du mode données fictives. En mode entreprise, c'est le nom de la société. */
export const FICTIONAL_SOCIETY = "Exemple fictif";

export const DEPOT_MISSING = "Dépôt non renseigné";

/** Feuille Excel d'identité. L'import Lomaco l'ignore : ce n'est pas une feuille de courses. */
export const PLANNING_BANNER_SHEET = "En-tête";

export const EXPORT_RANGE_ERROR = "La date de début est après la date de fin. Inversez les deux dates.";
export const EXPORT_COLUMNS_ERROR = "Cochez au moins une colonne pour préparer le fichier.";
export const EXPORT_EXCEL_ERROR = "Le fichier Excel n'a pas pu être préparé. Réessayez, ou téléchargez le CSV.";
export const EXPORT_EMPTY_NOTE =
  "Aucune course sur cette période. Le fichier contiendra l'en-tête, sans ligne de course.";
export const EXPORT_PRINT_BLOCKED =
  "L'impression n'a pas pu s'ouvrir. Autorisez les fenêtres pour ce site, puis réessayez.";
export const EXPORT_PRINT_FAILED = "L'impression n'a pas démarré. Dans la fenêtre ouverte, utilisez Imprimer.";
export const EXPORT_LOMACO_COLUMNS =
  "Cochez au moins une colonne. Les feuilles Lomaco ont besoin d'un en-tête de colonnes.";
export const EXPORT_LOMACO_EXCEL_ERROR =
  "Le classeur Lomaco n'a pas pu être préparé. Réessayez, ou téléchargez les feuilles CSV.";

export interface PlanningBanner {
  society: string;
  missionIso: string;
  depot: string;
}

export interface DepotPlace {
  kind: string;
  name: string;
  short: string;
  city: string;
}

export interface PlanningPrintGroup {
  title: string;
  rows: string[][];
}

export function formatDepotPlace(place: DepotPlace | null | undefined): string {
  if (!place) return "";
  const name = place.short.trim() || place.name.trim();
  const city = place.city.trim();
  if (!name) return city;
  if (!city || includesFolded(name, city)) return name;
  return `${name}, ${city}`;
}

export function bannerFromContext(input: {
  mode: "demo" | "entreprise" | null | undefined;
  companyName?: string | null;
  city?: string | null;
  depotLabel?: string | null;
  places?: readonly DepotPlace[];
  missionIso: string;
}): PlanningBanner {
  const company = input.companyName?.trim() ?? "";
  if (input.mode === "entreprise") {
    const society = company || FICTIONAL_SOCIETY;
    const label = input.depotLabel?.trim() || (company ? `Dépôt ${company}` : "");
    const city = input.city?.trim() ?? "";
    const depot =
      label && city && !includesFolded(label, city)
        ? `${label}, ${city}`
        : label || (city ? `Dépôt, ${city}` : DEPOT_MISSING);
    return { society, missionIso: input.missionIso, depot };
  }
  const place = input.places?.find((item) => item.kind === "depot");
  return {
    society: FICTIONAL_SOCIETY,
    missionIso: input.missionIso,
    depot: formatDepotPlace(place) || DEPOT_MISSING,
  };
}

export function bannerRows(banner: PlanningBanner): string[][] {
  return [
    ["Société", banner.society],
    ["Date", frenchDate(banner.missionIso)],
    ["Dépôt", banner.depot],
  ];
}

export function planningMatrix(input: PlanningInput): { headers: string[]; rows: string[][]; rangeOk: boolean } {
  const planned = plannedLines(input);
  return { headers: planned.headers, rows: planned.lines.map((line) => line.cells), rangeOk: planned.rangeOk };
}

export function planningPrintGroups(input: PlanningInput): {
  headers: string[];
  groups: PlanningPrintGroup[];
  rangeOk: boolean;
} {
  const planned = plannedLines(input);
  if (!planned.rangeOk) return { headers: planned.headers, groups: [], rangeOk: false };
  const known = new Set(input.crews.map((crew) => crew.id));
  const byCrew = new Map<string, PlanningPrintGroup>();
  const pending: string[][] = [];
  for (const line of planned.lines) {
    if (!line.crewId || !known.has(line.crewId)) {
      pending.push(line.cells);
      continue;
    }
    const crew = input.crews.find((item) => item.id === line.crewId);
    const group = byCrew.get(line.crewId) ?? { title: crewTitle(crew), rows: [] };
    group.rows.push(line.cells);
    byCrew.set(line.crewId, group);
  }
  const groups = input.crews.flatMap((crew) => {
    const group = byCrew.get(crew.id);
    return group ? [group] : [];
  });
  if (pending.length) groups.push({ title: "À placer", rows: pending });
  return { headers: planned.headers, groups, rangeOk: true };
}

export function planningCsv(matrix: { headers: string[]; rows: string[][] }, banner?: PlanningBanner): string {
  const table = [matrix.headers, ...matrix.rows].map((row) => row.map(csvCell).join(";"));
  const head = banner ? [...bannerRows(banner).map((row) => row.map(csvCell).join(";")), ""] : [];
  return `\uFEFF${[...head, ...table].join("\n")}\n`;
}

export function excelSerial(iso: string): number {
  const [year, month, day] = iso.split("-").map(Number);
  const utc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86_400_000);
}

export function frenchDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export async function planningXlsx(
  matrix: { headers: string[]; rows: string[][] },
  missionIso: string,
  banner?: PlanningBanner,
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const preface = banner ? [...bannerRows(banner), []] : [];
  const sheet = XLSX.utils.aoa_to_sheet([...preface, matrix.headers, ...matrix.rows]);
  const dateIndex = matrix.headers.indexOf("Date");
  if (dateIndex >= 0 && matrix.rows.length) {
    const serial = excelSerial(missionIso);
    const first = preface.length + 1;
    for (let row = first; row < first + matrix.rows.length; row++) {
      const ref = XLSX.utils.encode_cell({ r: row, c: dateIndex });
      sheet[ref] = { t: "n", v: serial, z: "dd/mm/yyyy" };
    }
  }
  if (banner) sheet.B2 = { t: "n", v: excelSerial(banner.missionIso), z: "dd/mm/yyyy" };
  sheet["!cols"] = columnWidths(matrix, banner);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Planning");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Uint8Array.from(bytes as ArrayLike<number>);
}

export function planningPrintHtml(input: {
  banner: PlanningBanner;
  headers: readonly string[];
  groups: readonly PlanningPrintGroup[];
  period?: string;
}): string {
  const day = frenchDate(input.banner.missionIso);
  const pages = input.groups.length
    ? input.groups.map((group) => printPage(input.banner, day, input.period, group.title, input.headers, group.rows))
    : [printPage(input.banner, day, input.period, "Planning", input.headers, [], true)];
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(printTitle(input.banner))}</title>
    <style>
      @page { size: A4 portrait; margin: 12mm 12mm 14mm; }
      html, body { margin: 0; background: #fff; color: #12283c; }
      body { font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11pt; }
      .page { page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      header { border-bottom: 2px solid #12283c; margin: 0 0 10px; padding-bottom: 8px; }
      h1 { font-size: 16pt; line-height: 1.2; margin: 0 0 4px; }
      p { margin: 0; line-height: 1.35; }
      h2 { font-size: 13pt; margin: 12px 0 6px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #c5d0dc; padding: 5px 6px; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
      th { background: #eef3f8; font-size: 9pt; }
      td { font-size: 10pt; }
      .empty { margin-top: 12px; }
      footer { margin-top: 10px; font-size: 8pt; color: #445; }
    </style></head><body>${pages.join("")}</body></html>`;
}

interface PlannedLine {
  crewId: string;
  cells: string[];
}

function plannedLines(input: PlanningInput): { headers: string[]; lines: PlannedLine[]; rangeOk: boolean } {
  const columns = input.columns.length ? input.columns : defaultPlanningChoice(input.missionIso).columns;
  const headers = columns.map((id) => PLANNING_COLUMNS.find((column) => column.id === id)?.label ?? id);
  if (input.from > input.to) return { headers, lines: [], rangeOk: false };
  const crewById = new Map(input.crews.map((crew) => [crew.id, crew]));
  const legs = legIndex(input.schedules);
  const lines = input.transports
    .filter((transport) => !transport.cancelled && inPlanningRange(input.missionIso, input.from, input.to))
    .map((transport) => {
      const patient = input.patients.get(transport.patientId);
      const crew = transport.crewId ? crewById.get(transport.crewId) : undefined;
      const leg = legs.get(transport.id);
      const start = leg?.depart ?? transport.departMin ?? transport.appointmentMin ?? transport.windowStart;
      const values: Record<PlanningColumn, string> = {
        date: frenchDate(input.missionIso),
        heure_debut: formatMin(start),
        patient: patient ? `${patient.lastName} ${patient.firstName}`.trim() : "",
        adresse_pec: input.locations.get(transport.pickupId)?.name ?? "",
        adresse_depose: input.locations.get(transport.dropoffId)?.name ?? "",
        equipe: crew ? `${crew.code} · ${crew.driver}` : "",
        vehicule: crew?.plate ?? "",
        duree: leg ? formatDuration(leg.end - leg.depart) : "",
      };
      return { crewId: crew?.id ?? "", start, cells: columns.map((id) => values[id]) };
    })
    .sort((a, b) => a.start - b.start)
    .map(({ crewId, cells }) => ({ crewId, cells }));
  return { headers, lines, rangeOk: true };
}

function legIndex(schedules: ReadonlyMap<string, CrewSchedule>): Map<string, { depart: number; end: number }> {
  const legs = new Map<string, { depart: number; end: number }>();
  for (const schedule of schedules.values()) {
    for (const leg of schedule.legs) legs.set(leg.transportId, { depart: leg.departMin, end: leg.endMin });
  }
  return legs;
}

function crewTitle(crew: Crew | undefined): string {
  if (!crew) return "Équipage";
  const plate = crew.plate.trim();
  return plate ? `${crew.code} · ${plate}` : crew.code;
}

function columnWidths(
  matrix: { headers: string[]; rows: string[][] },
  banner: PlanningBanner | undefined,
): { wch: number }[] {
  const width = Math.max(matrix.headers.length, banner ? 2 : 1);
  return Array.from({ length: width }, (_, index) => {
    const samples = [matrix.headers[index] ?? "", ...matrix.rows.map((row) => row[index] ?? "")];
    if (banner && index === 0) samples.push("Société", "Dépôt");
    if (banner && index === 1) samples.push(banner.society, banner.depot, frenchDate(banner.missionIso));
    const longest = samples.reduce((max, cell) => Math.max(max, cell.length), 0);
    return { wch: Math.min(42, Math.max(12, longest + 2)) };
  });
}

function printTitle(banner: PlanningBanner): string {
  return `Planning ${banner.society} ${frenchDate(banner.missionIso)}`;
}

function printPage(
  banner: PlanningBanner,
  day: string,
  period: string | undefined,
  title: string,
  headers: readonly string[],
  rows: readonly string[][],
  emptyFile = false,
): string {
  const count = `${rows.length} course${rows.length > 1 ? "s" : ""}`;
  const table = rows.length
    ? `<table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows
        .map((row) => `<tr>${headers.map((_, index) => `<td>${esc(row[index] ?? "")}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`
    : `<p class="empty">${esc(emptyFile ? EXPORT_EMPTY_NOTE : "Aucune course pour cet équipage.")}</p>`;
  const periodLine = period ? `<p>Période : ${esc(period)}</p>` : "";
  return `<section class="page"><header><h1>${esc(banner.society)}</h1><p>${esc(day)}</p><p>Dépôt : ${esc(banner.depot)}</p>${periodLine}</header><h2>${esc(title)} · ${count}</h2>${table}<footer>Fichier local. Rien n'est envoyé à Lomaco.</footer></section>`;
}

function includesFolded(text: string, fragment: string): boolean {
  return text.toLocaleLowerCase("fr").includes(fragment.toLocaleLowerCase("fr"));
}

function esc(value: string): string {
  return value.replace(/[&<>]/g, (char) => (char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;"));
}

function csvCell(value: string): string {
  if (/[";\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function isoOr(value: unknown, fallback: string): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
