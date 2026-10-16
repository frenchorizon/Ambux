import type { CrewSchedule } from "./schedule";
import type { Crew, Location, Patient, Posture, Rules, Transport, TransportKind, VehicleType } from "./types";
import { geocodeAddress } from "../lib/routing";
import { formatMin } from "../lib/format";

export type ImportField =
  | "ignore"
  | "dossier"
  | "nom"
  | "prenom"
  | "patient"
  | "date"
  | "heure_rdv"
  | "heure_retour"
  | "adresse_depart"
  | "cp_depart"
  | "ville_depart"
  | "adresse_arrivee"
  | "cp_arrivee"
  | "ville_arrivee"
  | "mobilite"
  | "type"
  | "sens"
  | "serie"
  | "telephone"
  | "naissance"
  | "motif"
  | "code_vehicule"
  | "note"
  | "equipage"
  | "immatriculation"
  | "conducteur"
  | "auxiliaire"
  | "dea"
  | "nom_vehicule";

export type SheetKind = "transport" | "equipage" | "vehicule" | "ignorer";

export interface ImportProfile {
  id: string;
  name: string;
  /** En-tête normalisé → champ. Vide : seuls les synonymes s'appliquent. */
  map: Partial<Record<string, ImportField>>;
}

export const LOMACO_IMPORT_ID = "lomaco";

export const LOMACO_IMPORT_PROFILE: ImportProfile = {
  id: LOMACO_IMPORT_ID,
  name: "Lomaco (à confirmer)",
  map: {},
};

export const IMPORT_FIELD_LABELS: { id: ImportField; label: string }[] = [
  { id: "ignore", label: "Ignorer" },
  { id: "dossier", label: "Dossier" },
  { id: "nom", label: "Nom" },
  { id: "prenom", label: "Prénom" },
  { id: "patient", label: "Patient" },
  { id: "date", label: "Date" },
  { id: "heure_rdv", label: "Heure RDV" },
  { id: "heure_retour", label: "Heure retour" },
  { id: "adresse_depart", label: "Adresse départ" },
  { id: "cp_depart", label: "CP départ" },
  { id: "ville_depart", label: "Ville départ" },
  { id: "adresse_arrivee", label: "Adresse arrivée" },
  { id: "cp_arrivee", label: "CP arrivée" },
  { id: "ville_arrivee", label: "Ville arrivée" },
  { id: "mobilite", label: "Mobilité" },
  { id: "type", label: "Type AMB/VSL/TAP" },
  { id: "sens", label: "Aller / retour" },
  { id: "serie", label: "Série" },
  { id: "telephone", label: "Téléphone" },
  { id: "naissance", label: "Né(e) le" },
  { id: "motif", label: "Motif" },
  { id: "code_vehicule", label: "Code véhicule" },
  { id: "note", label: "Note" },
  { id: "equipage", label: "Équipage" },
  { id: "immatriculation", label: "Immatriculation" },
  { id: "conducteur", label: "Conducteur" },
  { id: "auxiliaire", label: "Auxiliaire" },
  { id: "dea", label: "DEA" },
  { id: "nom_vehicule", label: "Nom du véhicule" },
];

const SYNONYMS: { field: ImportField; phrases: string[] }[] = [
  {
    field: "heure_rdv",
    phrases: ["heure rdv", "heure du rdv", "horaire rdv", "heure rendez vous", "h rdv", "rdv", "heure de rdv"],
  },
  { field: "heure_retour", phrases: ["heure retour", "horaire retour", "retour prevu", "h retour"] },
  {
    field: "adresse_depart",
    phrases: [
      "adresse depart",
      "adresse de depart",
      "lieu depart",
      "lieu de depart",
      "adresse prise en charge",
      "adresse pec",
      "prise en charge",
      "origine",
    ],
  },
  { field: "cp_depart", phrases: ["cp depart", "code postal depart", "cp pec"] },
  { field: "ville_depart", phrases: ["ville depart", "commune depart"] },
  {
    field: "adresse_arrivee",
    phrases: [
      "adresse arrivee",
      "adresse d arrivee",
      "lieu arrivee",
      "lieu d arrivee",
      "destination",
      "adresse depose",
      "adresse destination",
    ],
  },
  { field: "cp_arrivee", phrases: ["cp arrivee", "code postal arrivee", "cp destination"] },
  { field: "ville_arrivee", phrases: ["ville arrivee", "commune arrivee", "ville destination"] },
  { field: "immatriculation", phrases: ["immatriculation", "immat", "plaque", "n vehicule", "numero vehicule"] },
  { field: "nom_vehicule", phrases: ["nom vehicule", "nom du vehicule", "libelle vehicule"] },
  { field: "conducteur", phrases: ["conducteur", "chauffeur", "ambulancier"] },
  { field: "auxiliaire", phrases: ["auxiliaire", "equipier", "second", "coequipier"] },
  { field: "equipage", phrases: ["equipage", "code equipage", "equipe"] },
  { field: "mobilite", phrases: ["mobilite", "position", "mode transport"] },
  {
    field: "type",
    phrases: [
      "type transport",
      "type de transport",
      "type vehicule",
      "type de vehicule",
      "prestation",
      "categorie",
      "type",
    ],
  },
  { field: "sens", phrases: ["aller retour", "sens", "nature trajet", "trajet"] },
  { field: "dossier", phrases: ["n dossier", "numero dossier", "num dossier", "dossier", "n mission", "reference"] },
  { field: "prenom", phrases: ["prenom", "prenom patient"] },
  { field: "nom", phrases: ["nom patient", "nom du patient", "nom"] },
  { field: "patient", phrases: ["patient", "beneficiaire"] },
  { field: "telephone", phrases: ["telephone", "tel", "portable", "mobile"] },
  { field: "naissance", phrases: ["date de naissance", "nee le", "ne le", "ne e le", "naissance", "ddn"] },
  { field: "motif", phrases: ["motif", "code motif", "nature du transport"] },
  { field: "code_vehicule", phrases: ["code vehicule", "numero de parc", "n parc", "code parc"] },
  { field: "serie", phrases: ["serie", "seance", "habitude"] },
  { field: "dea", phrases: ["dea"] },
  { field: "note", phrases: ["commentaire", "observation", "note", "remarque"] },
  { field: "date", phrases: ["date transport", "date rdv", "date mission", "date"] },
];

export interface RawSheet {
  file: string;
  sheet: string;
  headers: string[];
  rows: string[][];
}

export interface SourceSheet extends RawSheet {
  fields: ImportField[];
  kind: SheetKind;
  kindLocked: boolean;
}

export interface LomacoReject {
  file: string;
  sheet: string;
  line: number;
  reason: string;
}

export interface LomacoTransportRow {
  line: number;
  file: string;
  sheet: string;
  summary: string;
  transport: Transport;
  patient: Patient;
  locations: Location[];
  retour?: Transport;
}

export interface LomacoVehicleRow {
  line: number;
  file: string;
  sheet: string;
  plate: string;
  vehicleType: VehicleType;
  name: string;
  vehicleCode?: string;
  summary: string;
}

export interface LomacoCrewRow {
  line: number;
  file: string;
  sheet: string;
  plate: string;
  driver: string;
  mate?: string;
  dea: boolean;
  summary: string;
}

export interface LomacoPreview {
  transports: LomacoTransportRow[];
  vehicles: LomacoVehicleRow[];
  crews: LomacoCrewRow[];
  rejected: LomacoReject[];
}

export type ExportField =
  | "dossier"
  | "date"
  | "patient"
  | "telephone"
  | "heure_rdv"
  | "depart"
  | "prise_en_charge"
  | "fin"
  | "adresse_depart"
  | "adresse_arrivee"
  | "type"
  | "mobilite"
  | "sens"
  | "equipage"
  | "immatriculation"
  | "conducteur"
  | "auxiliaire"
  | "note";

export const EXPORT_CATALOG: { id: ExportField; label: string }[] = [
  { id: "dossier", label: "Dossier" },
  { id: "date", label: "Date" },
  { id: "patient", label: "Patient" },
  { id: "telephone", label: "Téléphone" },
  { id: "heure_rdv", label: "Heure RDV" },
  { id: "depart", label: "Départ" },
  { id: "prise_en_charge", label: "Prise en charge" },
  { id: "fin", label: "Fin" },
  { id: "adresse_depart", label: "Adresse départ" },
  { id: "adresse_arrivee", label: "Adresse arrivée" },
  { id: "type", label: "Type" },
  { id: "mobilite", label: "Mobilité" },
  { id: "sens", label: "Sens" },
  { id: "equipage", label: "Équipage" },
  { id: "immatriculation", label: "Immatriculation" },
  { id: "conducteur", label: "Conducteur" },
  { id: "auxiliaire", label: "Auxiliaire" },
  { id: "note", label: "Note" },
];

export const LOMACO_EXPORT_ID = "lomaco-export";

export interface ExportProfile {
  id: string;
  name: string;
  columns: ExportField[];
}

export const LOMACO_EXPORT_PROFILE: ExportProfile = {
  id: LOMACO_EXPORT_ID,
  name: "Lomaco (à confirmer)",
  columns: [
    "dossier",
    "patient",
    "heure_rdv",
    "adresse_depart",
    "adresse_arrivee",
    "type",
    "sens",
    "equipage",
    "immatriculation",
    "depart",
    "fin",
    "note",
  ],
};

const IMPORT_KEY = "ambux.lomaco.importProfiles";
const EXPORT_KEY = "ambux.lomaco.exportProfiles";

export function normKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectField(header: string, profile: ImportProfile = LOMACO_IMPORT_PROFILE): ImportField {
  const key = normKey(header);
  if (!key) return "ignore";
  const saved = profile.map[key];
  if (saved) return saved;
  for (const entry of SYNONYMS) {
    if (entry.phrases.some((phrase) => phrase === key)) return entry.field;
  }
  let best: { field: ImportField; length: number } | null = null;
  for (const entry of SYNONYMS) {
    for (const phrase of entry.phrases) {
      if (phrase.length < 5) continue;
      if (key.includes(phrase) && (!best || phrase.length > best.length))
        best = { field: entry.field, length: phrase.length };
    }
  }
  return best?.field ?? "ignore";
}

export function detectKind(fields: readonly ImportField[]): SheetKind {
  const set = new Set(fields);
  if (
    set.has("heure_rdv") ||
    set.has("adresse_depart") ||
    (set.has("nom") && set.has("adresse_arrivee")) ||
    set.has("patient")
  ) {
    return "transport";
  }
  if (set.has("conducteur")) return "equipage";
  if (set.has("immatriculation") || set.has("nom_vehicule")) return "vehicule";
  return "ignorer";
}

export function mapSheet(
  raw: RawSheet,
  profile: ImportProfile,
  patch?: { fields?: ImportField[]; kind?: SheetKind; kindLocked?: boolean },
): SourceSheet {
  const fields = patch?.fields ?? raw.headers.map((header) => detectField(header, profile));
  const kind = patch?.kind ?? detectKind(fields);
  return { ...raw, fields, kind, kindLocked: patch?.kindLocked ?? false };
}

export function applyProfile(sheet: SourceSheet, profile: ImportProfile): SourceSheet {
  const fields = sheet.headers.map((header, index) => {
    const key = normKey(header);
    return profile.map[key] ?? detectField(header, profile) ?? sheet.fields[index] ?? "ignore";
  });
  return { ...sheet, fields, kind: sheet.kindLocked ? sheet.kind : detectKind(fields) };
}

export async function previewLomaco(
  sheets: readonly SourceSheet[],
  options: {
    locations: readonly Location[];
    rules: Rules;
    missionIso: string;
    fleet: readonly { plate: string; vehicleType: VehicleType }[];
    geocode?: (query: string) => Promise<{ lat: number; lng: number; label: string } | null>;
  },
): Promise<LomacoPreview> {
  const geocode = options.geocode ?? geocodeAddress;
  const known = options.locations.slice();
  const transports: LomacoTransportRow[] = [];
  const vehicles: LomacoVehicleRow[] = [];
  const crews: LomacoCrewRow[] = [];
  const rejected: LomacoReject[] = [];
  const plates = new Set(options.fleet.map((item) => normPlate(item.plate)));
  const types = new Map(options.fleet.map((item) => [normPlate(item.plate), item.vehicleType]));

  for (const sheet of sheets) {
    if (sheet.kind === "ignorer") {
      if (sheet.rows.length) {
        rejected.push({
          file: sheet.file,
          sheet: sheet.sheet,
          line: 1,
          reason: "Feuille non reconnue. Choisissez courses, équipages ou véhicules.",
        });
      }
      continue;
    }
    for (let index = 0; index < sheet.rows.length; index++) {
      const cells = sheet.rows[index] ?? [];
      if (cells.every((cell) => !String(cell).trim())) continue;
      const line = index + 2;
      const record = recordOf(sheet.fields, cells);
      if (sheet.kind === "vehicule") {
        const parsed = parseVehicle(record, line, sheet, plates, types);
        if ("reason" in parsed) rejected.push({ file: sheet.file, sheet: sheet.sheet, line, reason: parsed.reason });
        else vehicles.push(parsed);
        continue;
      }
      if (sheet.kind === "equipage") {
        const parsed = parseCrew(record, line, sheet, types);
        if ("reason" in parsed) rejected.push({ file: sheet.file, sheet: sheet.sheet, line, reason: parsed.reason });
        else crews.push(parsed);
        continue;
      }
      const parsed = await parseTransport(record, line, sheet, known, options.rules, options.missionIso, geocode);
      if ("reason" in parsed) {
        rejected.push({ file: sheet.file, sheet: sheet.sheet, line, reason: parsed.reason });
        continue;
      }
      for (const place of parsed.locations) known.push(place);
      transports.push(parsed);
      const vehicle = vehicleFromTransport(record, line, sheet, plates, types);
      if (vehicle && "reason" in vehicle) {
        if (!vehicle.reason.includes("déjà"))
          rejected.push({ file: sheet.file, sheet: sheet.sheet, line, reason: vehicle.reason });
      } else if (vehicle) vehicles.push(vehicle);
      const crew = crewFromTransport(record, line, sheet, types);
      if (crew && !("reason" in crew)) crews.push(crew);
      else if (crew && "reason" in crew && record.conducteur) {
        rejected.push({ file: sheet.file, sheet: sheet.sheet, line, reason: crew.reason });
      }
    }
  }
  return { transports, vehicles, crews, rejected };
}

export interface RouteSheet {
  name: string;
  rows: string[][];
}

export function routeSheets(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  patients: ReadonlyMap<string, Patient>;
  locations: ReadonlyMap<string, Location>;
  schedules: Map<string, CrewSchedule>;
  missionIso: string;
  columns: readonly ExportField[];
}): RouteSheet[] {
  const columns = input.columns.length ? input.columns : LOMACO_EXPORT_PROFILE.columns;
  const header = columns.map((id) => EXPORT_CATALOG.find((item) => item.id === id)?.label ?? id);
  const sheets: RouteSheet[] = [];
  const placed = new Set<string>();
  for (const crew of input.crews) {
    const rows = input.transports
      .filter((transport) => !transport.cancelled && transport.crewId === crew.id)
      .slice()
      .sort(
        (a, b) =>
          (a.departMin ?? a.appointmentMin ?? a.windowStart) - (b.departMin ?? b.appointmentMin ?? b.windowStart),
      );
    if (!rows.length) continue;
    for (const transport of rows) placed.add(transport.id);
    sheets.push({
      name: crew.code,
      rows: [header, ...rows.map((transport) => exportRow(transport, crew, input, columns))],
    });
  }
  const pending = input.transports
    .filter((transport) => !transport.cancelled && !placed.has(transport.id))
    .slice()
    .sort((a, b) => (a.appointmentMin ?? a.windowStart) - (b.appointmentMin ?? b.windowStart));
  if (pending.length) {
    sheets.push({
      name: "A traiter",
      rows: [header, ...pending.map((transport) => exportRow(transport, undefined, input, columns))],
    });
  }
  if (!sheets.length) sheets.push({ name: "A traiter", rows: [header] });
  return sheets;
}

export function sheetsToCsvFiles(sheets: readonly RouteSheet[]): { name: string; text: string }[] {
  return sheets.map((sheet) => ({
    name: `${safeFile(sheet.name)}.csv`,
    text: `\uFEFF${sheet.rows.map((row) => row.map(csvCell).join(";")).join("\n")}\n`,
  }));
}

export function zipTexts(files: readonly { name: string; text: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.text);
    const crc = crc32(data);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, data);
    const cen = new Uint8Array(46 + name.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    cen.set(name, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...locals, ...central, end]) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

export function loadImportProfiles(): ImportProfile[] {
  const saved = readStore<ImportProfile[]>(IMPORT_KEY) ?? [];
  return [
    LOMACO_IMPORT_PROFILE,
    ...saved.filter((item) => item.id && item.id !== LOMACO_IMPORT_ID && item.name && item.map),
  ];
}

export function saveImportProfile(profile: ImportProfile): ImportProfile[] {
  const saved = (readStore<ImportProfile[]>(IMPORT_KEY) ?? []).filter(
    (item) => item.id !== profile.id && item.id !== LOMACO_IMPORT_ID,
  );
  const next = [...saved, profile];
  writeStore(IMPORT_KEY, next);
  return [LOMACO_IMPORT_PROFILE, ...next];
}

export function loadExportProfiles(): ExportProfile[] {
  const saved = readStore<ExportProfile[]>(EXPORT_KEY) ?? [];
  return [
    LOMACO_EXPORT_PROFILE,
    ...saved.filter((item) => item.id && item.id !== LOMACO_EXPORT_ID && item.name && item.columns?.length),
  ];
}

export function saveExportProfile(profile: ExportProfile): ExportProfile[] {
  const saved = (readStore<ExportProfile[]>(EXPORT_KEY) ?? []).filter(
    (item) => item.id !== profile.id && item.id !== LOMACO_EXPORT_ID,
  );
  const next = [...saved, profile];
  writeStore(EXPORT_KEY, next);
  return [LOMACO_EXPORT_PROFILE, ...next];
}

export function downloadBytes(filename: string, bytes: Uint8Array, type: string): void {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const blob = new Blob([copy], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportRow(
  transport: Transport,
  crew: Crew | undefined,
  input: {
    patients: ReadonlyMap<string, Patient>;
    locations: ReadonlyMap<string, Location>;
    schedules: Map<string, CrewSchedule>;
    missionIso: string;
  },
  columns: readonly ExportField[],
): string[] {
  const patient = input.patients.get(transport.patientId);
  const from = input.locations.get(transport.pickupId);
  const to = input.locations.get(transport.dropoffId);
  const schedule = crew ? input.schedules.get(crew.id) : undefined;
  const leg = schedule?.legs.find((item) => item.transportId === transport.id);
  const values: Record<ExportField, string> = {
    dossier: transport.dossier,
    date: input.missionIso,
    patient: patient ? `${patient.lastName} ${patient.firstName}`.trim() : "",
    telephone: patient?.phone ?? "",
    heure_rdv: formatMin(transport.appointmentMin ?? transport.windowStart),
    depart: leg ? formatMin(leg.departMin) : "",
    prise_en_charge: leg ? formatMin(leg.arrivePickup) : "",
    fin: leg ? formatMin(leg.endMin) : "",
    adresse_depart: from ? `${from.name}, ${from.city}` : "",
    adresse_arrivee: to ? `${to.name}, ${to.city}` : "",
    type: transport.service ?? (crew?.vehicleType === "ambulance" || transport.posture === "allonge" ? "AMB" : "VSL"),
    mobilite: transport.posture,
    sens: sensLabel(transport.kind),
    equipage: crew?.code ?? transport.requestedCrew ?? "",
    immatriculation: crew?.plate ?? "",
    conducteur: crew?.driver ?? "",
    auxiliaire: crew?.mate ?? "",
    note: transport.note ?? "",
  };
  return columns.map((column) => values[column]);
}

function sensLabel(kind: TransportKind): string {
  if (kind === "dialyse_aller") return "Aller dialyse";
  if (kind === "dialyse_retour") return "Retour dialyse";
  if (kind === "aller") return "Aller";
  if (kind === "retour") return "Retour";
  return "Simple";
}

function recordOf(fields: readonly ImportField[], cells: readonly string[]): Partial<Record<ImportField, string>> {
  const record: Partial<Record<ImportField, string>> = {};
  fields.forEach((field, index) => {
    if (field === "ignore") return;
    const value = String(cells[index] ?? "").trim();
    if (!value || record[field]) return;
    record[field] = value;
  });
  return record;
}

function parseVehicle(
  record: Partial<Record<ImportField, string>>,
  line: number,
  sheet: SourceSheet,
  plates: Set<string>,
  types: Map<string, VehicleType>,
): LomacoVehicleRow | { reason: string } {
  const plate = normPlate(record.immatriculation ?? "");
  const service = parseService(record.type ?? "");
  const type = service ? vehicleOf(service) : vehicleTypeLoose(record.type ?? "");
  if (plate.length < 4) return { reason: `Immatriculation « ${record.immatriculation || "vide"} » trop courte.` };
  if (!type) return { reason: `Type « ${record.type || "vide"} » inconnu. Valeurs : AMB, VSL, TAP.` };
  if (plates.has(plate)) return { reason: `${plate} est déjà dans la flotte ou dans le fichier.` };
  plates.add(plate);
  types.set(plate, type);
  const name =
    (record.nom_vehicule ?? "").trim() || (service === "TAP" ? "TAP" : type === "ambulance" ? "Ambulance" : "VSL");
  const vehicleCode = (record.code_vehicule ?? "").trim() || undefined;
  return {
    line,
    file: sheet.file,
    sheet: sheet.sheet,
    plate,
    vehicleType: type,
    name,
    vehicleCode,
    summary: `${plate} · ${service === "TAP" ? "TAP (planifié en VSL)" : type === "ambulance" ? "ambulance" : "VSL"}${name ? ` · ${name}` : ""}`,
  };
}

function vehicleFromTransport(
  record: Partial<Record<ImportField, string>>,
  line: number,
  sheet: SourceSheet,
  plates: Set<string>,
  types: Map<string, VehicleType>,
): LomacoVehicleRow | { reason: string } | null {
  if (!record.immatriculation || !(record.type ?? "").trim()) return null;
  return parseVehicle(record, line, sheet, plates, types);
}

function parseCrew(
  record: Partial<Record<ImportField, string>>,
  line: number,
  sheet: SourceSheet,
  types: Map<string, VehicleType>,
): LomacoCrewRow | { reason: string } {
  const plate = normPlate(record.immatriculation ?? "");
  const driver = (record.conducteur ?? "").trim();
  const mate = (record.auxiliaire ?? "").trim();
  const kind = types.get(plate);
  if (!kind) return { reason: `Véhicule « ${record.immatriculation || "vide"} » introuvable pour l'équipage.` };
  if (driver.length < 3) return { reason: "Conducteur manquant." };
  if (kind === "ambulance" && mate.length < 3) return { reason: "Ambulance : auxiliaire manquant." };
  const dea = oui(record.dea ?? "") || kind === "ambulance";
  if (kind === "ambulance" && record.dea && !oui(record.dea))
    return { reason: "Ambulance : la colonne DEA doit être oui." };
  if (kind === "vsl" && mate) return { reason: "Un VSL ou un TAP part avec un conducteur seul." };
  return {
    line,
    file: sheet.file,
    sheet: sheet.sheet,
    plate,
    driver,
    mate: mate || undefined,
    dea: kind === "ambulance" && dea,
    summary: `${plate} · ${driver}${mate ? ` · ${mate}` : ""}`,
  };
}

function crewFromTransport(
  record: Partial<Record<ImportField, string>>,
  line: number,
  sheet: SourceSheet,
  types: Map<string, VehicleType>,
): LomacoCrewRow | { reason: string } | null {
  if (!record.conducteur) return null;
  return parseCrew(record, line, sheet, types);
}

async function parseTransport(
  record: Partial<Record<ImportField, string>>,
  line: number,
  sheet: SourceSheet,
  locations: Location[],
  rules: Rules,
  missionIso: string,
  geocode: (query: string) => Promise<{ lat: number; lng: number; label: string } | null>,
): Promise<LomacoTransportRow | { reason: string }> {
  const names = personName(record);
  if (!names.last) return { reason: "Nom manquant." };
  const clock = parseClock(record.heure_rdv ?? "");
  if (clock == null) return { reason: `Heure invalide « ${record.heure_rdv || "vide"} ». Format HH:MM.` };
  const date = record.date ?? "";
  if (date && !dateMatches(date, missionIso))
    return { reason: `Date « ${date} » différente de la mission ${missionIso}.` };
  const service = parseService(record.type ?? "");
  if ((record.type ?? "").trim() && !service && !parseMobility(record.mobilite ?? "")) {
    return { reason: `Type « ${record.type} » inconnu. Valeurs : AMB, VSL, TAP.` };
  }
  const posture = parseMobility(record.mobilite ?? "") ?? defaultPosture(service);
  if (!posture) return { reason: "Mobilité ou type AMB/VSL/TAP manquant." };
  if ((service === "VSL" || service === "TAP") && posture === "allonge") {
    return { reason: `${service} ne prend pas un patient allongé.` };
  }
  const sens = parseSens(record.sens ?? "");
  if (!sens) return { reason: `Sens « ${record.sens} » inconnu. Valeurs : aller, retour, simple, A/R.` };
  const retourClock = (record.heure_retour ?? "").trim() ? parseClock(record.heure_retour ?? "") : null;
  if ((record.heure_retour ?? "").trim() && retourClock == null)
    return { reason: `Heure retour invalide « ${record.heure_retour} ».` };
  if (sens === "ar" && retourClock == null) return { reason: "Aller-retour sans heure de retour." };
  const departLabel = joinAddress(record, "depart");
  const arriveeLabel = joinAddress(record, "arrivee");
  if (!departLabel) return { reason: "Adresse de départ manquante." };
  if (!arriveeLabel) return { reason: "Adresse d'arrivée manquante." };
  const depart = await resolvePlace(departLabel, locations, `dep-${sheet.sheet}-${line}`, geocode);
  if (!depart.ok) return { reason: depart.reason };
  const arrivee = await resolvePlace(arriveeLabel, locations, `arr-${sheet.sheet}-${line}`, geocode);
  if (!arrivee.ok) return { reason: arrivee.reason };
  const id = `lomaco-${normKey(sheet.file)}-${normKey(sheet.sheet)}-${line}`;
  const patientId = `pat-${id}`;
  const kind: TransportKind = sens === "retour" ? "retour" : sens === "simple" ? "simple" : "aller";
  const tolerance = rules.toleranceMin;
  const transport: Transport = {
    id,
    dossier: record.dossier || `DOS-${line}`,
    patientId,
    pickupId: depart.location.id,
    dropoffId: arrivee.location.id,
    windowStart: clock - tolerance,
    windowEnd: clock + tolerance,
    appointmentMin: clock,
    toleranceMin: tolerance,
    posture,
    serviceMin: posture === "allonge" ? 16 : 10,
    kind,
    seriesId: seriesIdOf(record.serie, sens === "ar" ? id : undefined),
    priority: "normal",
    cancelled: false,
    note: record.note || undefined,
    service: service ?? undefined,
    motif: parseMotif(record.motif ?? "") ?? undefined,
    requestedCrew: record.equipage?.trim() || undefined,
  };
  const born = parseBirth(record.naissance ?? "");
  const patient: Patient = {
    id: patientId,
    firstName: names.first || "—",
    lastName: names.last,
    phone: record.telephone || "",
    birthYear: born?.year ?? 1950,
    birthDate: born?.iso,
    addressId: depart.location.kind === "domicile" ? depart.location.id : arrivee.location.id,
    mobility: posture,
    note: record.note || undefined,
  };
  let retour: Transport | undefined;
  if (sens === "ar" && retourClock != null) {
    retour = {
      ...transport,
      id: `${id}-r`,
      pickupId: arrivee.location.id,
      dropoffId: depart.location.id,
      kind: "retour",
      appointmentMin: retourClock,
      windowStart: retourClock - tolerance,
      windowEnd: retourClock + tolerance,
      seriesId: transport.seriesId,
      note: record.note ? `${record.note} · retour` : "Retour",
    };
  }
  const created = [depart.created, arrivee.created].filter((place): place is Location => Boolean(place));
  const typeLabel = service === "TAP" ? "TAP (VSL)" : (service ?? posture);
  const summary = `${names.last} ${names.first} · ${formatMin(clock)} · ${depart.location.short} → ${arrivee.location.short} · ${typeLabel} · ${sens}${record.equipage ? ` · équipage ${record.equipage}` : ""}`;
  return { line, file: sheet.file, sheet: sheet.sheet, summary, transport, patient, locations: created, retour };
}

async function resolvePlace(
  query: string,
  locations: Location[],
  id: string,
  geocode: (query: string) => Promise<{ lat: number; lng: number; label: string } | null>,
): Promise<{ ok: true; location: Location; created?: Location } | { ok: false; reason: string }> {
  const q = normKey(query);
  const hits = locations.filter((location) => {
    const name = normKey(location.name);
    const short = normKey(location.short);
    if (name === q || short === q) return true;
    if (q.length >= 8 && name.includes(q)) return true;
    if (short.length >= 8 && q.includes(short)) return true;
    return false;
  });
  if (hits.length > 1) return { ok: false, reason: `Adresse ambiguë « ${query} ».` };
  if (hits.length === 1) return { ok: true, location: hits[0]! };
  const geo = await geocode(query.includes("Rouen") ? query : `${query}, Rouen`);
  if (!geo) return { ok: false, reason: `Adresse inconnue « ${query} ». Aucun remplacement.` };
  const created: Location = {
    id: `loc-${id}`,
    name: geo.label,
    short: geo.label,
    kind: "domicile",
    lat: geo.lat,
    lng: geo.lng,
    city: "Rouen",
  };
  return { ok: true, location: created, created };
}

function personName(record: Partial<Record<ImportField, string>>): { last: string; first: string } {
  const last = (record.nom ?? "").trim();
  const first = (record.prenom ?? "").trim();
  if (last) return { last, first };
  const whole = (record.patient ?? "").trim();
  if (!whole) return { last: "", first: "" };
  const bits = whole.split(/\s+/);
  return { last: bits[0] ?? "", first: bits.slice(1).join(" ") };
}

function joinAddress(record: Partial<Record<ImportField, string>>, side: "depart" | "arrivee"): string {
  const parts =
    side === "depart"
      ? [record.adresse_depart, record.cp_depart, record.ville_depart]
      : [record.adresse_arrivee, record.cp_arrivee, record.ville_arrivee];
  return parts
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function parseService(value: string): "AMB" | "VSL" | "TAP" | null {
  const v = normKey(value).replace(/\s+/g, "");
  if (!v) return null;
  if (v === "amb" || v === "ambulance" || v === "assu") return "AMB";
  if (v === "vsl" || v === "taxi" || v === "vsll") return "VSL";
  if (v === "tap" || v === "transportassis" || v === "assispro") return "TAP";
  return null;
}

function vehicleOf(service: "AMB" | "VSL" | "TAP"): VehicleType {
  return service === "AMB" ? "ambulance" : "vsl";
}

function vehicleTypeLoose(value: string): VehicleType | null {
  const service = parseService(value);
  return service ? vehicleOf(service) : null;
}

function defaultPosture(service: "AMB" | "VSL" | "TAP" | null): Posture | null {
  if (service === "AMB") return "allonge";
  if (service === "VSL" || service === "TAP") return "assis";
  return null;
}

function parseMobility(value: string): Posture | null {
  const v = normKey(value).replace(/\s+/g, "");
  if (!v) return null;
  if (v === "assis" || v === "assise" || v === "assisvsl") return "assis";
  if (v === "allonge" || v === "allongee" || v === "couche" || v === "brancard") return "allonge";
  if (v === "fauteuil" || v === "pmr") return "fauteuil";
  return null;
}

function parseSens(value: string): "simple" | "aller" | "retour" | "ar" | null {
  if (!value.trim()) return "simple";
  const v = normKey(value).replace(/\s+/g, "");
  if (v === "simple" || v === "s") return "simple";
  if (v === "aller" || v === "a") return "aller";
  if (v === "retour" || v === "r") return "retour";
  if (v === "ar" || v === "allerretour" || v === "aller/retour") return "ar";
  return null;
}

function seriesIdOf(value: string | undefined, fallback?: string): string | undefined {
  const text = (value ?? "").trim();
  if (!text) return fallback;
  const key = normKey(text).replace(/\s+/g, "");
  if (key === "unique" || key === "u" || key === "non") return undefined;
  if (key === "serie" || key === "s" || key === "oui") return fallback || "serie";
  return text;
}

function parseMotif(value: string): "DIAL" | "KINE" | "CONS" | "ORTHO" | "RADI" | null {
  const key = normKey(value).replace(/\s+/g, "");
  if (!key) return null;
  if (key.startsWith("dial")) return "DIAL";
  if (key.startsWith("kine")) return "KINE";
  if (key.startsWith("cons")) return "CONS";
  if (key.startsWith("ortho")) return "ORTHO";
  if (key.startsWith("radi")) return "RADI";
  return null;
}

function parseBirth(value: string): { iso: string; year: number } | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const fr = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(text);
  const year = iso ? Number(iso[1]) : fr ? Number(fr[3]) : 0;
  const month = iso ? Number(iso[2]) : fr ? Number(fr[2]) : 0;
  const day = iso ? Number(iso[3]) : fr ? Number(fr[1]) : 0;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, iso: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

function parseClock(value: string): number | null {
  const text = value
    .trim()
    .toLowerCase()
    .replace(/(\d)\s*h\s*/g, "$1:");
  const match = /(\d{1,2}):(\d{2})/.exec(text);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function dateMatches(value: string, iso: string): boolean {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return false;
  const digits = value.replace(/\D/g, "");
  const forms = new Set([
    `${year}${month}${day}`,
    `${day}${month}${year}`,
    `${String(Number(day))}${String(Number(month))}${year}`,
    `${day}${month}${year.slice(2)}`,
    `${String(Number(day))}${String(Number(month))}${year.slice(2)}`,
  ]);
  if (forms.has(digits)) return true;
  const months = [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
  ];
  const monthName = months[Number(month) - 1] ?? "";
  const tokens = normKey(value).split(" ").filter(Boolean);
  return (
    tokens.includes(String(Number(day))) &&
    tokens.includes(year) &&
    tokens.some((token) => monthName.startsWith(token) || token.startsWith(monthName.slice(0, 4)))
  );
}

function oui(value: string): boolean {
  const v = normKey(value);
  return v === "oui" || v === "o" || v === "1" || v === "true" || v === "dea";
}

function normPlate(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function csvCell(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function safeFile(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 40) || "feuille";
}

function crc32(data: Uint8Array): number {
  let crc = ~0;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function readStore<T>(key: string): T | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeStore(key: string, value: unknown): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navigation privée */
  }
}
