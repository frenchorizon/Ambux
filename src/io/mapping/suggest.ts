import type { ImportField } from "../../game/lomaco";

const EXTRA: { field: ImportField; phrases: string[] }[] = [
  { field: "attente", phrases: ["attente", "duree attente", "temps d attente", "duree seance"] },
  { field: "contraintes", phrases: ["contraintes", "contrainte", "particularites"] },
  { field: "disponibilite", phrases: ["disponibilite", "disponibilites", "dispo"] },
  { field: "role", phrases: ["role", "fonction", "qualification"] },
  { field: "adresse", phrases: ["adresse", "adresse domicile", "domicile"] },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Champs ajoutés au profil Lomaco. Les synonymes historiques restent prioritaires. */
export function suggestExtraField(header: string): ImportField | null {
  const key = normalize(header);
  if (!key) return null;
  for (const entry of EXTRA) {
    if (entry.phrases.some((phrase) => phrase === key)) return entry.field;
  }
  return null;
}
