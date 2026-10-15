import { DAY_END, DAY_START } from "./types";

/** Prises de poste décalées de 30 min, vacation bornée par l'amplitude, dans la journée 06:00–20:00. */
export function shiftForIndex(index: number, amplitudeMin: number): { shiftStart: number; shiftEnd: number } {
  const amplitude = Math.max(8 * 60, Math.min(amplitudeMin, DAY_END - DAY_START));
  const slack = Math.max(0, DAY_END - DAY_START - amplitude);
  const step = 30;
  const slots = Math.max(1, Math.floor(slack / step) + 1);
  const offset = (index % slots) * step;
  const shiftStart = DAY_START + Math.min(offset, slack);
  return { shiftStart, shiftEnd: shiftStart + amplitude };
}
