import type { Posture } from "../../game/types";

export function parseAttente(value: string): { ok: false; reason: string } | { ok: true; minutes: number | null } {
  const text = value.trim().toLowerCase().replace(",", ".");
  if (!text) return { ok: true, minutes: null };
  const clock = /^(\d{1,2})\s*h\s*(\d{1,2})?$/.exec(text);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2] ?? 0);
    if (hours > 12 || minutes > 59)
      return { ok: false, reason: `Attente « ${value} » invalide. Exemples : 90 ou 1h30.` };
    return { ok: true, minutes: hours * 60 + minutes };
  }
  if (!/^\d+(\.\d+)?$/.test(text))
    return { ok: false, reason: `Attente « ${value} » invalide. Exemples : 90 ou 1h30.` };
  const minutes = Math.round(Number(text));
  if (minutes <= 0 || minutes > 12 * 60)
    return { ok: false, reason: `Attente « ${value} » hors limites (1 à 720 min).` };
  return { ok: true, minutes };
}

export function readAvailability(value: string): { active: boolean; label?: string; warning?: string } {
  const text = value.trim();
  if (!text) return { active: true };
  const key = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, " ")
    .trim();
  if (["indisponible", "inactif", "non", "hors service", "absence"].includes(key)) {
    return { active: false, label: "indisponible" };
  }
  if (["disponible", "oui", "actif", "present"].includes(key)) {
    return { active: true, label: "disponible" };
  }
  const range = /(\d{1,2})\s*[:h]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[:h]\s*(\d{2})/.exec(text);
  if (range) {
    const label = `${range[1]!.padStart(2, "0")}:${range[2]}-${range[3]!.padStart(2, "0")}:${range[4]}`;
    return { active: true, label };
  }
  return { active: true, label: text, warning: `Disponibilité « ${text} » conservée telle quelle.` };
}

export function readRole(value: string): { role: "conducteur" | "auxiliaire"; dea: boolean } | null {
  const key = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!key) return null;
  const dea = key.includes("dea");
  if (/(conducteur|chauffeur|ambulancier)/.test(key)) return { role: "conducteur", dea };
  if (/(auxiliaire|equipier|coequipier|second)/.test(key))
    return { role: "auxiliaire", dea: dea || key.includes("dea") };
  return null;
}

export interface PatientCheck {
  ok: true;
  last: string;
  first: string;
  constraints?: string;
  mobility?: Posture;
  warnings: string[];
}

export function checkPatient(input: {
  nom?: string;
  prenom?: string;
  patient?: string;
  address: string;
  contraintes?: string;
}): PatientCheck | { ok: false; reason: string } {
  const last = (input.nom ?? "").trim();
  const first = (input.prenom ?? "").trim();
  let surname = last;
  let given = first;
  if (!surname) {
    const whole = (input.patient ?? "").trim();
    const bits = whole.split(/\s+/).filter(Boolean);
    surname = bits[0] ?? "";
    given = bits.slice(1).join(" ");
  }
  if (surname.length < 2) return { ok: false, reason: "Nom manquant." };
  if (!input.address.trim()) return { ok: false, reason: "Adresse manquante." };
  const warnings: string[] = [];
  const constraints = (input.contraintes ?? "").trim();
  const mobility = mobilityFrom(constraints);
  if (constraints && mobility) warnings.push(`Contrainte lue comme mobilité ${mobility}.`);
  return {
    ok: true,
    last: surname,
    first: given,
    constraints: constraints || undefined,
    mobility,
    warnings,
  };
}

export function checkPersonnel(input: { nom?: string; role?: string; disponibilite?: string }):
  | { ok: false; reason: string }
  | {
      ok: true;
      name: string;
      role: "conducteur" | "auxiliaire";
      dea: boolean;
      availability?: string;
      warnings: string[];
    } {
  const name = (input.nom ?? "").trim();
  if (name.length < 3) return { ok: false, reason: "Nom manquant." };
  const role = readRole(input.role ?? "");
  if (!role)
    return { ok: false, reason: `Rôle « ${input.role || "vide"} » inconnu. Valeurs : conducteur, auxiliaire.` };
  const availability = readAvailability(input.disponibilite ?? "");
  const warnings: string[] = [];
  if (!availability.label) warnings.push("Disponibilité absente.");
  if (availability.warning) warnings.push(availability.warning);
  return {
    ok: true,
    name,
    role: role.role,
    dea: role.dea,
    availability: availability.label,
    warnings,
  };
}

function mobilityFrom(value: string): Posture | undefined {
  const key = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (key.includes("allong")) return "allonge";
  if (key.includes("fauteuil") || key.includes("pmr")) return "fauteuil";
  if (key.includes("assis")) return "assis";
  return undefined;
}
