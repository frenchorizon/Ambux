import { geocodeAddress } from "../lib/routing";
import { MISSION_ISO, type Location, type Patient, type Posture, type Rules, type Transport, type TransportKind } from "./types";
import type { CrewSchedule } from "./schedule";
import type { Crew } from "./types";
import { formatMin } from "../lib/format";

export const CSV_COLUMNS =
  "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour";

export function csvSpec(iso: string): string {
  const [year, month, day] = iso.split("-");
  const slash = year && month && day ? `${day}/${month}/${year}` : iso;
  return [
    "Séparateur point-virgule. Première ligne = en-têtes.",
    "Obligatoire : nom, heure_rdv (HH:MM), adresse_depart, adresse_arrivee, mobilite (assis, allongé ou fauteuil).",
    `date : ${iso}, ${slash}, ou vide. Toute autre date est rejetée.`,
    "sens : aller, retour, simple (vide = simple, indiqué dans l'aperçu), ou ar.",
    "ar exige heure_retour. Aucune adresse inconnue n'est remplacée par le CHU.",
    "Un libellé reconnu est affiché dans l'aperçu avant fusion. Une adresse ambiguë est rejetée.",
  ].join(" ");
}

export const CSV_SPEC = csvSpec(MISSION_ISO);

export interface CsvRow {
  line: number;
  transport: Transport;
  patient: Patient;
  location?: Location;
  retour?: Transport;
  summary: string;
}

export interface CsvReject {
  line: number;
  raw: string;
  reason: string;
}

export async function previewCsv(
  raw: string,
  locations: readonly Location[],
  rules: Rules,
  missionIso: string = MISSION_ISO,
): Promise<{ accepted: CsvRow[]; rejected: CsvReject[] }> {
  const lines = raw.split(/\r?\n/);
  const accepted: CsvRow[] = [];
  const rejected: CsvReject[] = [];
  let header = true;
  const known = locations.slice();
  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index] ?? "";
    const line = rawLine.trim();
    if (!line) continue;
    const cells = splitCsv(line);
    if (header && looksLikeHeader(cells)) {
      header = false;
      continue;
    }
    header = false;
    const parsed = await parseLine(index + 1, rawLine, cells, known, rules, missionIso);
    if ("reason" in parsed) {
      rejected.push(parsed);
      continue;
    }
    if (parsed.location) known.push(parsed.location);
    if (parsed.retourLocation) known.push(parsed.retourLocation);
    accepted.push(parsed.row);
  }
  return { accepted, rejected };
}

export function planningToCsv(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  patients: ReadonlyMap<string, Patient>;
  locations: ReadonlyMap<string, Location>;
  schedules: Map<string, CrewSchedule>;
  blocks: readonly { crewId: string; kind: string; startMin: number; endMin: number }[];
  missionIso?: string;
}): string {
  const header = [
    "dossier",
    "date",
    "statut",
    "equipage",
    "vehicule",
    "immatriculation",
    "conducteur",
    "auxiliaire",
    "dea",
    "patient",
    "telephone",
    "adresse_depart",
    "adresse_arrivee",
    "heure_rdv",
    "depart",
    "prise_en_charge",
    "fin",
    "mobilite",
    "sens",
    "km_vide",
    "km_charge",
    "km_source",
    "repas",
    "note",
  ];
  const rows = [header.join(";")];
  const ordered = input.transports
    .filter((transport) => !transport.cancelled)
    .slice()
    .sort((a, b) => (a.appointmentMin ?? a.windowStart) - (b.appointmentMin ?? b.windowStart));
  for (const transport of ordered) {
    const crew = input.crews.find((item) => item.id === transport.crewId);
    const schedule = crew ? input.schedules.get(crew.id) : undefined;
    const leg = schedule?.legs.find((item) => item.transportId === transport.id);
    const patient = input.patients.get(transport.patientId);
    const from = input.locations.get(transport.pickupId);
    const to = input.locations.get(transport.dropoffId);
    const meal = crew ? input.blocks.find((block) => block.crewId === crew.id && block.kind === "repas") : undefined;
    rows.push(
      [
        transport.dossier,
        input.missionIso || MISSION_ISO,
        transport.crewId ? "affecte" : "a_traiter",
        crew?.code ?? "",
        crew ? (crew.vehicleType === "ambulance" ? "ambulance" : "vsl") : "",
        crew?.plate ?? "",
        crew?.driver ?? "",
        crew?.mate ?? "",
        crew ? (crew.dea ? "oui" : "non") : "",
        patient ? `${patient.lastName} ${patient.firstName}` : "",
        patient?.phone ?? "",
        from ? `${from.name}, ${from.city}` : "",
        to ? `${to.name}, ${to.city}` : "",
        formatMin(transport.appointmentMin ?? transport.windowStart),
        leg ? formatMin(leg.departMin) : "",
        leg ? formatMin(leg.arrivePickup) : "",
        leg ? formatMin(leg.endMin) : "",
        transport.posture,
        transport.kind,
        leg ? leg.deadheadKm.toFixed(1).replace(".", ",") : "",
        leg ? leg.loadedKm.toFixed(1).replace(".", ",") : "",
        leg ? (leg.kmEstimated ? "estime" : "osrm") : "",
        meal ? `${formatMin(meal.startMin)}-${formatMin(meal.endMin)}` : "",
        transport.note ?? "",
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  return `\uFEFF${rows.join("\n")}\n`;
}

export function downloadCsv(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function splitCsv(line: string): string[] {
  const sep = line.split(";").length >= line.split(",").length ? ";" : ",";
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

function looksLikeHeader(cells: string[]): boolean {
  const joined = cells.map((cell) => norm(cell)).join(" ");
  return joined.includes("nom") && (joined.includes("heure") || joined.includes("rdv"));
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

async function parseLine(
  line: number,
  raw: string,
  cells: string[],
  locations: Location[],
  rules: Rules,
  missionIso: string,
): Promise<{ row: CsvRow; location?: Location; retourLocation?: Location } | CsvReject> {
  const header = CSV_COLUMNS.split(";");
  const record: Record<string, string> = {};
  if (cells.length === 1 && !cells[0]?.includes(" ") && cells[0] && !cells[0].includes(":")) {
    return { line, raw, reason: "Ligne illisible : séparateur ; attendu." };
  }
  cells.forEach((cell, index) => {
    const key = header[index] ?? `col${index}`;
    record[key] = cell;
  });
  const lastName = record.nom ?? "";
  const firstName = record.prenom ?? "";
  if (!lastName) return { line, raw, reason: "Nom manquant." };
  const clock = parseClock(record.heure_rdv ?? "");
  if (clock == null) return { line, raw, reason: `Heure invalide « ${record.heure_rdv || "vide"} ». Format HH:MM.` };
  const date = record.date ?? "";
  if (date && !dateMatches(date, missionIso)) {
    return { line, raw, reason: `Date « ${date} » différente de la mission ${missionIso}.` };
  }
  const posture = parseMobility(record.mobilite ?? "");
  if (!posture) return { line, raw, reason: `Mobilité « ${record.mobilite || "vide"} » refusée. Valeurs : assis, allongé, fauteuil.` };
  const sens = parseSens(record.sens ?? "");
  if (!sens) return { line, raw, reason: `Sens « ${record.sens} » inconnu. Valeurs : aller, retour, simple, ar.` };
  const retourClock = (record.heure_retour ?? "").trim() ? parseClock(record.heure_retour ?? "") : null;
  if ((record.heure_retour ?? "").trim() && retourClock == null) {
    return { line, raw, reason: `heure_retour invalide « ${record.heure_retour} ».` };
  }
  if (sens === "ar" && retourClock == null) {
    return { line, raw, reason: "Aller-retour sans heure_retour : le retour n'est pas inventé." };
  }
  if (!record.adresse_depart) return { line, raw, reason: "Adresse de départ manquante." };
  if (!record.adresse_arrivee) return { line, raw, reason: "Adresse d'arrivée manquante." };

  const depart = await resolvePlace(record.adresse_depart, locations, `dep-${line}`);
  if (!depart.ok) return { line, raw, reason: depart.reason };
  const arrivee = await resolvePlace(record.adresse_arrivee, locations, `arr-${line}`);
  if (!arrivee.ok) return { line, raw, reason: arrivee.reason };

  const tolerance = rules.toleranceMin;
  const id = `imp-${line}-${Date.now().toString(36)}`;
  const patientId = `pat-${id}`;
  const kind: TransportKind = sens === "retour" ? "retour" : sens === "simple" ? "simple" : "aller";
  const transport: Transport = {
    id,
    dossier: record.dossier || `DOS-IMP-${line}`,
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
    seriesId: record.serie || (sens === "ar" ? id : undefined),
    priority: "normal",
    cancelled: false,
    note: record.note || undefined,
  };
  const patient: Patient = {
    id: patientId,
    firstName: firstName || "—",
    lastName,
    phone: record.telephone || "",
    birthYear: 1950,
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
  const summary = `${lastName} ${firstName} · ${record.heure_rdv} · ${depart.location.short} → ${arrivee.location.short} · ${posture} · ${sens === "simple" && !(record.sens ?? "").trim() ? "simple (colonne vide)" : sens}${retour ? ` · retour ${record.heure_retour}` : ""}`;
  return {
    row: { line, transport, patient, location: depart.created, retour, summary },
    location: depart.created,
  };
}

async function resolvePlace(
  query: string,
  locations: Location[],
  id: string,
): Promise<{ ok: true; location: Location; created?: Location } | { ok: false; reason: string }> {
  const q = norm(query);
  const hits = locations.filter((location) => {
    const name = norm(location.name);
    const short = norm(location.short);
    if (name === q || short === q) return true;
    if (q.length >= 8 && name.includes(q)) return true;
    if (short.length >= 8 && q.includes(short)) return true;
    return false;
  });
  if (hits.length > 1) {
    return { ok: false, reason: `Adresse ambiguë « ${query} » : ${hits.map((hit) => hit.short).slice(0, 3).join(", ")}.` };
  }
  if (hits.length === 1) return { ok: true, location: hits[0]! };
  const geo = await geocodeAddress(query.includes("Rouen") ? query : `${query}, Rouen`);
  if (!geo) return { ok: false, reason: `Adresse inconnue « ${query} ». Aucun remplacement.` };
  const created: Location = {
    id: `loc-${id}-${Date.now().toString(36)}`,
    name: geo.label,
    short: geo.label,
    kind: "domicile",
    lat: geo.lat,
    lng: geo.lng,
    city: "Rouen",
  };
  return { ok: true, location: created, created };
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function dateMatches(value: string, iso: string): boolean {
  const compact = norm(value).replace(/\s+/g, "");
  if (!compact) return true;
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return false;
  const dayNum = String(Number(day));
  const monthNum = String(Number(month));
  const forms = new Set([
    iso,
    `${day}/${month}/${year}`,
    `${dayNum}/${monthNum}/${year}`,
    `${day}-${month}-${year}`,
    `${dayNum}-${monthNum}-${year}`,
    `${day}.${month}.${year}`,
  ]);
  if (forms.has(compact)) return true;
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  const monthName = months[Number(month) - 1] ?? "";
  const tokens = norm(value).split(" ").filter(Boolean);
  return tokens.includes(dayNum) && tokens.includes(year) && tokens.some((token) => monthName.startsWith(token) || token.startsWith(monthName.slice(0, 4)));
}

function parseMobility(value: string): Posture | null {
  const v = norm(value);
  if (v === "assis" || v === "assise") return "assis";
  if (v === "allonge" || v === "allongee" || v === "couche" || v === "couchee" || v === "brancard") return "allonge";
  if (v === "fauteuil" || v === "pmr") return "fauteuil";
  return null;
}

function parseSens(value: string): "simple" | "aller" | "retour" | "ar" | null {
  if (!value.trim()) return "simple";
  const v = norm(value).replace(/\s+/g, "");
  if (v === "simple" || v === "s") return "simple";
  if (v === "aller" || v === "a") return "aller";
  if (v === "retour" || v === "r") return "retour";
  if (v === "ar" || v === "aller-retour" || v === "aller/retour") return "ar";
  return null;
}
