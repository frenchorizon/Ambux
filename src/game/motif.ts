import type { TransportKind } from "./types";

/** Libellés longs du motif, partagés par la carte patient et la feuille Lomaco. */
export const MOTIF_LABEL = {
  DIAL: "DIAL - DIALYSE",
  KINE: "KINE - KINE",
  CONS: "CONS - CONSULTATION",
  ORTHO: "ORTHO",
  RADI: "RADI - RADIOTHÉRAPIE",
} as const;

export type MotifCode = keyof typeof MOTIF_LABEL;

export function motifLabel(transport: { motif?: string; kind: TransportKind | string }): string {
  if (transport.motif && transport.motif in MOTIF_LABEL) return MOTIF_LABEL[transport.motif as MotifCode];
  if (transport.kind === "retour" || transport.kind === "dialyse_retour") return "Retour";
  return "Aller";
}

/** Vide ou inconnu : null. Le CSV distingue ensuite une cellule vide d'un code illisible. */
export function parseMotif(value: string): MotifCode | null {
  const key = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  if (!key) return null;
  if (key.startsWith("dial")) return "DIAL";
  if (key.startsWith("kine")) return "KINE";
  if (key.startsWith("cons")) return "CONS";
  if (key.startsWith("ortho")) return "ORTHO";
  if (key.startsWith("radi")) return "RADI";
  return null;
}
