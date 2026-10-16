import type { VehicleType } from "./types";
import type { CsvReject } from "./csv";

export const VEHICLE_COLUMNS = "immatriculation;type;nom";
export const CREW_COLUMNS = "immatriculation;conducteur;auxiliaire;dea";

export const VEHICLE_TEMPLATE = `${VEHICLE_COLUMNS}\nGR-100-AA;ambulance;Master\nGR-200-BB;vsl;Kangoo\n`;
export const CREW_TEMPLATE = `${CREW_COLUMNS}\nGR-100-AA;MARTIN Paul;DURAND Léa;oui\nGR-200-BB;PETIT Jean;;non\n`;

export interface VehicleCsvRow {
  line: number;
  plate: string;
  vehicleType: VehicleType;
  name: string;
  summary: string;
}

export interface CrewCsvRow {
  line: number;
  plate: string;
  driver: string;
  mate?: string;
  dea: boolean;
  summary: string;
}

export function previewVehicles(
  raw: string,
  existingPlates: readonly string[],
): { accepted: VehicleCsvRow[]; rejected: CsvReject[] } {
  const accepted: VehicleCsvRow[] = [];
  const rejected: CsvReject[] = [];
  const seen = new Set(existingPlates.map(normPlate));
  let header = true;
  for (const [index, rawLine] of raw.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = split(line);
    if (header && norm(cells.join(" ")).includes("immatriculation")) {
      header = false;
      continue;
    }
    header = false;
    const plate = normPlate(cells[0] ?? "");
    const type = vehicleTypeOf(cells[1] ?? "");
    const name = (cells[2] ?? "").trim();
    if (plate.length < 4) {
      rejected.push({
        line: index + 1,
        raw: rawLine,
        reason: `Immatriculation « ${cells[0] || "vide"} » trop courte.`,
      });
      continue;
    }
    if (!type) {
      rejected.push({
        line: index + 1,
        raw: rawLine,
        reason: `Type « ${cells[1] || "vide"} » inconnu. Valeurs : ambulance, vsl.`,
      });
      continue;
    }
    if (seen.has(plate)) {
      rejected.push({ line: index + 1, raw: rawLine, reason: `${plate} est déjà dans la flotte ou dans le fichier.` });
      continue;
    }
    seen.add(plate);
    accepted.push({
      line: index + 1,
      plate,
      vehicleType: type,
      name: name || (type === "ambulance" ? "Ambulance" : "VSL"),
      summary: `${plate} · ${type === "ambulance" ? "ambulance" : "VSL"}${name ? ` · ${name}` : ""}`,
    });
  }
  return { accepted, rejected };
}

export function previewCrews(
  raw: string,
  fleet: readonly { plate: string; vehicleType: VehicleType }[],
): { accepted: CrewCsvRow[]; rejected: CsvReject[] } {
  const accepted: CrewCsvRow[] = [];
  const rejected: CsvReject[] = [];
  const byPlate = new Map(fleet.map((item) => [normPlate(item.plate), item.vehicleType]));
  let header = true;
  for (const [index, rawLine] of raw.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line) continue;
    const cells = split(line);
    if (header && norm(cells.join(" ")).includes("conducteur")) {
      header = false;
      continue;
    }
    header = false;
    const plate = normPlate(cells[0] ?? "");
    const driver = (cells[1] ?? "").trim();
    const mate = (cells[2] ?? "").trim();
    const dea = oui(cells[3] ?? "");
    const kind = byPlate.get(plate);
    if (!kind) {
      rejected.push({ line: index + 1, raw: rawLine, reason: `Véhicule « ${cells[0] || "vide"} » introuvable.` });
      continue;
    }
    if (driver.length < 3) {
      rejected.push({ line: index + 1, raw: rawLine, reason: "Conducteur manquant." });
      continue;
    }
    if (kind === "ambulance" && mate.length < 3) {
      rejected.push({ line: index + 1, raw: rawLine, reason: "Ambulance : auxiliaire manquant." });
      continue;
    }
    if (kind === "ambulance" && !dea) {
      rejected.push({ line: index + 1, raw: rawLine, reason: "Ambulance : la colonne dea doit être oui." });
      continue;
    }
    if (kind === "vsl" && mate) {
      rejected.push({ line: index + 1, raw: rawLine, reason: "Un VSL part avec un conducteur seul." });
      continue;
    }
    accepted.push({
      line: index + 1,
      plate,
      driver,
      mate: mate || undefined,
      dea: kind === "ambulance" && dea,
      summary: `${plate} · ${driver}${mate ? ` · ${mate}` : ""}${kind === "ambulance" ? " · DEA" : ""}`,
    });
  }
  return { accepted, rejected };
}

function vehicleTypeOf(value: string): VehicleType | null {
  const v = norm(value).replace(/\s+/g, "");
  if (v === "ambulance" || v === "amb" || v === "assu") return "ambulance";
  if (v === "vsl" || v === "taxi") return "vsl";
  return null;
}

function oui(value: string): boolean {
  const v = norm(value);
  return v === "oui" || v === "o" || v === "1" || v === "true" || v === "dea";
}

function normPlate(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function split(line: string): string[] {
  return line.split(";").map((cell) => cell.trim());
}
