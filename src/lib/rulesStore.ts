import { writeLocal } from "./browserStore";
import { DEFAULT_RULES, type Rules } from "../game/types";

const KEY = "ambux.rules";

export function loadRules(): Rules {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_RULES;
    return parseRules(JSON.parse(raw) as unknown);
  } catch {
    return DEFAULT_RULES;
  }
}

export function parseRules(value: unknown): Rules {
  const parsed = value && typeof value === "object" ? (value as Partial<Rules>) : {};
  return {
    toleranceMin: num(parsed.toleranceMin, DEFAULT_RULES.toleranceMin, 5, 60),
    mealMin: num(parsed.mealMin, DEFAULT_RULES.mealMin, 0, 90),
    mealFrom: num(parsed.mealFrom, DEFAULT_RULES.mealFrom, 6 * 60, 20 * 60),
    mealTo: num(parsed.mealTo, DEFAULT_RULES.mealTo, 6 * 60, 20 * 60),
    maxAmb: num(parsed.maxAmb, DEFAULT_RULES.maxAmb, 1, 40),
    maxVsl: num(parsed.maxVsl, DEFAULT_RULES.maxVsl, 1, 40),
    sessionMin: num(parsed.sessionMin, DEFAULT_RULES.sessionMin, 60, 8 * 60),
    amplitudeMin: num(parsed.amplitudeMin, DEFAULT_RULES.amplitudeMin, 8 * 60, 14 * 60),
    pecAmbMin: num(parsed.pecAmbMin, DEFAULT_RULES.pecAmbMin, 1, 40),
    pecVslMin: num(parsed.pecVslMin, DEFAULT_RULES.pecVslMin, 1, 40),
    dropoffMin: num(parsed.dropoffMin, DEFAULT_RULES.dropoffMin, 1, 40),
  };
}

export function saveRules(rules: Rules): boolean {
  return writeLocal(KEY, JSON.stringify(rules));
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
