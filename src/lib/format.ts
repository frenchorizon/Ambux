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
  if (posture === "allonge") return "Allongé";
  if (posture === "fauteuil") return "Fauteuil";
  return "Assis";
}

export function deviationLabel(minutes: number): string {
  if (minutes === 0) return "à l'heure";
  return minutes > 0 ? `+${minutes} min` : `${minutes} min`;
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const SHORT_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

export function labelForIso(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year || 2026, (month || 1) - 1, day || 1));
  const weekday = WEEKDAYS[date.getUTCDay()] ?? "jour";
  const monthName = MONTHS[(month || 1) - 1] ?? "";
  const text = `${weekday} ${day} ${monthName} ${year}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${SHORT_MONTHS[(month || 1) - 1] ?? ""} ${year}`;
}

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year || 2026, (month || 1) - 1, (day || 1) + days));
  return date.toISOString().slice(0, 10);
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
