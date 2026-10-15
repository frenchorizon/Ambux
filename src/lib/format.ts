import type { Posture, TransportKind, VehicleType } from "../game/types";

export function formatMin(min: number, mode: "floor" | "round" = "round"): string {
  const value = Math.max(0, mode === "floor" ? Math.floor(min) : Math.round(min));
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function formatKm(km: number, digits = 0): string {
  return `${km.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} km`;
}

export function formatPct(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

export function formatRegulation(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function personName(person: { firstName: string; lastName: string }): string {
  return `${person.lastName.toUpperCase()} ${person.firstName}`;
}

export function vehicleLabel(type: VehicleType): string {
  return type === "ambulance" ? "Ambulance" : "VSL";
}

export function postureLabel(posture: Posture): string {
  return posture === "allonge" ? "Allongé" : "Assis";
}

export function kindLabel(kind: TransportKind): string {
  switch (kind) {
    case "simple":
      return "Trajet simple";
    case "aller":
      return "Aller";
    case "retour":
      return "Retour";
    case "dialyse_aller":
      return "Dialyse — aller";
    case "dialyse_retour":
      return "Dialyse — retour";
  }
}
