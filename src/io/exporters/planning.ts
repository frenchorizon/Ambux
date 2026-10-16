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

export function planningMatrix(input: PlanningInput): { headers: string[]; rows: string[][]; rangeOk: boolean } {
  const columns = input.columns.length ? input.columns : defaultPlanningChoice(input.missionIso).columns;
  const headers = columns.map((id) => PLANNING_COLUMNS.find((column) => column.id === id)?.label ?? id);
  if (input.from > input.to) return { headers, rows: [], rangeOk: false };
  const crewById = new Map(input.crews.map((crew) => [crew.id, crew]));
  const legs = new Map<string, { depart: number; end: number }>();
  for (const schedule of input.schedules.values()) {
    for (const leg of schedule.legs) legs.set(leg.transportId, { depart: leg.departMin, end: leg.endMin });
  }
  const rows = input.transports
    .filter((transport) => !transport.cancelled && inPlanningRange(input.missionIso, input.from, input.to))
    .slice()
    .sort((a, b) => startOf(a, legs) - startOf(b, legs))
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
      return columns.map((id) => values[id]);
    });
  return { headers, rows, rangeOk: true };
}

export function planningCsv(matrix: { headers: string[]; rows: string[][] }): string {
  const lines = [matrix.headers, ...matrix.rows].map((row) => row.map(csvCell).join(";"));
  return `\uFEFF${lines.join("\n")}\n`;
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
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([matrix.headers, ...matrix.rows]);
  const dateIndex = matrix.headers.indexOf("Date");
  if (dateIndex >= 0) {
    const serial = excelSerial(missionIso);
    for (let row = 1; row <= matrix.rows.length; row++) {
      const ref = XLSX.utils.encode_cell({ r: row, c: dateIndex });
      sheet[ref] = { t: "n", v: serial, z: "dd/mm/yyyy" };
    }
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Planning");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Uint8Array.from(bytes as ArrayLike<number>);
}

function startOf(transport: Transport, legs: ReadonlyMap<string, { depart: number }>): number {
  return legs.get(transport.id)?.depart ?? transport.departMin ?? transport.appointmentMin ?? transport.windowStart;
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
