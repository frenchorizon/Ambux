import { CSV_COLUMNS } from "../../game/csv";
import { CREW_COLUMNS, VEHICLE_COLUMNS } from "../../game/fleetCsv";
import type { RawSheet } from "../../game/lomaco";

export const GUIDE_STEPS = ["vehicules", "equipages", "missions"] as const;

export type GuideStep = (typeof GUIDE_STEPS)[number];

export interface GuideStepMeta {
  title: string;
  lead: string;
  columns: string;
  csvName: string;
  xlsxName: string;
  sheet: string;
  fileLabel: string;
}

export const GUIDE_META: Record<GuideStep, GuideStepMeta> = {
  vehicules: {
    title: "Flotte",
    lead: "Une ligne par véhicule. Type : ambulance ou vsl. L'exemple est fictif.",
    columns: VEHICLE_COLUMNS,
    csvName: "ambux-modele-vehicules.csv",
    xlsxName: "ambux-modele-vehicules.xlsx",
    sheet: "Flotte",
    fileLabel: "Importer la flotte",
  },
  equipages: {
    title: "Personnel",
    lead: "La plaque doit déjà être dans la flotte. Ambulance : conducteur, auxiliaire, dea oui. VSL : conducteur seul, dea non.",
    columns: CREW_COLUMNS,
    csvName: "ambux-modele-equipages.csv",
    xlsxName: "ambux-modele-equipages.xlsx",
    sheet: "Personnel",
    fileLabel: "Importer le personnel",
  },
  missions: {
    title: "Missions",
    lead: "Une ligne par course. La date du modèle est celle de la mission. L'exemple est fictif, à Lyon.",
    columns: CSV_COLUMNS,
    csvName: "ambux-modele-missions.csv",
    xlsxName: "ambux-modele-missions.xlsx",
    sheet: "Missions",
    fileLabel: "Importer les missions",
  },
};

const REQUIRED: Record<GuideStep, readonly string[]> = {
  vehicules: ["immatriculation", "type"],
  equipages: ["immatriculation", "conducteur"],
  missions: ["nom", "heure_rdv", "adresse_depart", "adresse_arrivee", "mobilite"],
};

const VEHICLE_EXAMPLE = ["LY-410-EX", "ambulance", "Master"];
const CREW_EXAMPLE = ["LY-410-EX", "BERNARD Claire", "MOREAU Hugo", "oui"];

export function missionExample(missionIso: string): string[] {
  return [
    "EX-100",
    "LEFEVRE",
    "Inès",
    missionIso,
    "09:15",
    "12 rue des Tilleuls, Lyon",
    "Clinique des Tilleuls, Lyon",
    "assis",
    "simple",
    "",
    "",
    "exemple fictif",
    "",
    "",
  ];
}

export function templateGrid(step: GuideStep, missionIso: string): string[][] {
  const columns = GUIDE_META[step].columns.split(";");
  const example =
    step === "vehicules" ? VEHICLE_EXAMPLE : step === "equipages" ? CREW_EXAMPLE : missionExample(missionIso);
  return [columns, example];
}

export function templateCsv(step: GuideStep, missionIso: string): string {
  return `\uFEFF${templateGrid(step, missionIso)
    .map((row) => row.map(csvCell).join(";"))
    .join("\n")}\n`;
}

export async function templateXlsx(step: GuideStep, missionIso: string): Promise<Uint8Array> {
  const grid = templateGrid(step, missionIso);
  const XLSX = await import("xlsx");
  const sheet: import("xlsx").WorkSheet = {};
  grid.forEach((row, r) => {
    row.forEach((value, c) => {
      sheet[XLSX.utils.encode_cell({ r, c })] = { t: "s", v: value };
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: grid.length - 1, c: Math.max(0, (grid[0]?.length ?? 1) - 1) },
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, GUIDE_META[step].sheet);
  return asBytes(XLSX.write(book, { type: "array", bookType: "xlsx" }));
}

export function normHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export function selectSheet(tables: readonly RawSheet[], columns: string): RawSheet | null {
  if (!tables.length) return null;
  const known = new Set(columns.split(";").map(normHeader));
  let best = tables[0]!;
  let bestScore = -1;
  for (const table of tables) {
    const score = table.headers.filter((cell) => known.has(normHeader(cell))).length;
    if (score > bestScore) {
      best = table;
      bestScore = score;
    }
  }
  return best;
}

/** CSV lu comme texte : une date reste `2026-10-16`, sans conversion tableur. */
export function parseDelimited(text: string): { headers: string[]; rows: string[][] } | null {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line, index, all) => line.length > 0 || index < all.length - 1);
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const first = lines.find((line) => line.trim());
  if (!first) return null;
  const sep = (first.match(/;/g) ?? []).length >= (first.match(/,/g) ?? []).length ? ";" : ",";
  const grid = lines.map((line) => (line.trim() ? splitDelimited(line, sep) : []));
  const headerIndex = grid.findIndex((row) => row.some((cell) => cell.trim()));
  if (headerIndex < 0) return null;
  const headers = grid[headerIndex] ?? [];
  const rows = grid.slice(headerIndex + 1).map((row) => headers.map((_, index) => row[index] ?? ""));
  return { headers, rows };
}

/** Classeur : une cellule date Excel redevient `AAAA-MM-JJ`, une heure `HH:MM`. */
export async function workbookSheets(data: ArrayBuffer): Promise<RawSheet[]> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(data, { type: "array", cellDates: false });
  return book.SheetNames.flatMap((name) => {
    const sheet = book.Sheets[name];
    if (!sheet?.["!ref"]) return [];
    const range = XLSX.utils.decode_range(sheet["!ref"]);
    const matrix: string[][] = [];
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: string[] = [];
      for (let c = range.s.c; c <= range.e.c; c++) {
        row.push(cellText(sheet[XLSX.utils.encode_cell({ r, c })], XLSX));
      }
      matrix.push(row);
    }
    const headerIndex = matrix.findIndex((row) => row.some((cell) => cell.trim()));
    if (headerIndex < 0) return [];
    const headers = matrix[headerIndex] ?? [];
    const rows = matrix.slice(headerIndex + 1).map((row) => headers.map((_, index) => row[index] ?? ""));
    if (!headers.some((cell) => cell.trim())) return [];
    return [{ file: "", sheet: name, headers, rows }];
  });
}

/** Reconstruit un CSV point-virgule dans l'ordre des colonnes du modèle. */
export function tableToPreviewCsv(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  columns: string,
  step: GuideStep,
): { csv: string } | { reason: string } {
  const expected = columns.split(";");
  const known = new Set(expected.map(normHeader));
  const headerIsLabels = headers.some((cell) => known.has(normHeader(cell)));
  if (!headerIsLabels) {
    const body = [headers, ...rows].map((row) => (isBlank(row) ? "" : expected.map((_, index) => row[index] ?? "")));
    return { csv: `${body.map((row) => (typeof row === "string" ? row : row.map(csvCell).join(";"))).join("\n")}\n` };
  }
  const index = new Map<string, number>();
  headers.forEach((cell, at) => {
    const key = normHeader(cell);
    if (known.has(key) && !index.has(key)) index.set(key, at);
  });
  const missing = REQUIRED[step].filter((column) => !index.has(column));
  if (missing.length) {
    const label = missing.length > 1 ? "les colonnes" : "la colonne";
    return {
      reason: `Il manque ${label} ${missing.join(", ")}. Colonnes attendues : ${expected.join(", ")}.`,
    };
  }
  const body = rows.map((row) => {
    if (isBlank(row)) return "";
    return expected.map((column) => {
      const at = index.get(normHeader(column));
      return at == null ? "" : (row[at] ?? "");
    });
  });
  const lines = [expected.map(csvCell).join(";"), ...body.map((row) => (row === "" ? "" : row.map(csvCell).join(";")))];
  return { csv: `${lines.join("\n")}\n` };
}

function splitDelimited(line: string, sep: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]!;
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
      continue;
    }
    if (char === sep && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function cellText(
  cell: { t?: string; v?: unknown; w?: unknown; z?: unknown } | undefined,
  XLSX: {
    SSF: {
      is_date: (fmt: string) => boolean;
      parse_date_code: (value: number) => { y: number; m: number; d: number; H: number; M: number } | null;
    };
  },
): string {
  if (!cell || cell.v == null || cell.v === "") return "";
  if ((cell.t === "n" || cell.t === "d") && typeof cell.w === "string" && cell.w.trim()) return cell.w;
  const format = typeof cell.z === "string" ? cell.z : "";
  if ((cell.t === "n" || cell.t === "d") && format && XLSX.SSF.is_date(format)) {
    const serial = cell.t === "d" ? dateSerial(cell.v) : Number(cell.v);
    const parsed = Number.isFinite(serial) ? XLSX.SSF.parse_date_code(serial) : null;
    if (parsed) return formatExcel(parsed, format);
  }
  return String(cell.v);
}

function dateSerial(value: unknown): number {
  if (value instanceof Date) return (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
  return Number(value);
}

function formatExcel(parsed: { y: number; m: number; d: number; H: number; M: number }, format: string): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const tokens = format.toLowerCase().replace(/"[^"]*"/g, "");
  if (!/[yd]/.test(tokens) && tokens.includes("h")) return `${pad(parsed.H)}:${pad(parsed.M)}`;
  return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
}

function isBlank(row: readonly string[]): boolean {
  return row.every((cell) => !String(cell ?? "").trim());
}

function csvCell(value: string): string {
  if (/[;"\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function asBytes(value: unknown): Uint8Array {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return Uint8Array.from(value as ArrayLike<number>);
}
