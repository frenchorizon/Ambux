export const DAY_START = 6 * 60;
export const DAY_END = 20 * 60;
export const DEMO_DATE = "Jeudi 15 octobre 2026";
export const NEXT_DATE = "Vendredi 16 octobre 2026";

export type VehicleType = "ambulance" | "vsl";
export type Posture = "assis" | "allonge" | "fauteuil";
export type TransportKind = "simple" | "aller" | "retour" | "dialyse_aller" | "dialyse_retour";
export type Density = "normale" | "chargee";
export type Speed = 1 | 2 | 4;
export type Phase = "briefing" | "playing" | "review" | "report";
export type ViewId =
  | "gantt"
  | "tomorrow"
  | "crews"
  | "vehicles"
  | "patients"
  | "companies"
  | "lomaco";
export type ModalId = "optimizer" | "lomaco" | "help" | "closeDay" | "sheets";

export interface Rules {
  toleranceMin: number;
  mealMin: number;
  mealFrom: number;
  mealTo: number;
}

export const DEFAULT_RULES: Rules = {
  toleranceMin: 20,
  mealMin: 30,
  mealFrom: 11 * 60,
  mealTo: 14 * 60 + 30,
};

export interface StaffMember {
  id: string;
  name: string;
  role: "conducteur" | "auxiliaire";
  dea: boolean;
}

export interface Vehicle {
  id: string;
  plate: string;
  vehicleType: VehicleType;
  name: string;
  active: boolean;
}
export type CallKind =
  | "ajout"
  | "annulation"
  | "deplacement"
  | "retard"
  | "panne"
  | "pause"
  | "urgent";

export interface Location {
  id: string;
  name: string;
  short: string;
  kind: "depot" | "chu" | "clinique" | "dialyse" | "domicile";
  lat: number;
  lng: number;
  city: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  birthYear: number;
  addressId: string;
  mobility?: Posture;
  note?: string;
}

export interface Crew {
  id: string;
  code: string;
  driver: string;
  mate: string;
  vehicleType: VehicleType;
  plate: string;
  vehicleName: string;
  color: string;
  baseId: string;
  shiftStart: number;
  shiftEnd: number;
  delayUntil: number;
  vehicleId?: string;
  driverId?: string;
  mateId?: string;
}

export interface Transport {
  id: string;
  dossier: string;
  patientId: string;
  pickupId: string;
  dropoffId: string;
  windowStart: number;
  windowEnd: number;
  appointmentMin?: number;
  toleranceMin?: number;
  posture: Posture;
  serviceMin: number;
  kind: TransportKind;
  seriesId?: string;
  priority: "normal" | "urgent";
  cancelled: boolean;
  crewId?: string;
  departMin?: number;
  note?: string;
}

export interface TimeBlock {
  id: string;
  crewId: string;
  startMin: number;
  endMin: number;
  kind: "pause" | "panne" | "repas";
  label: string;
}

export interface TransportDraft {
  transport: Omit<Transport, "cancelled" | "crewId" | "departMin">;
  patient?: Patient;
}

export interface Call {
  id: string;
  triggerMin: number;
  spawned: boolean;
  resolved: boolean;
  expired: boolean;
  kind: CallKind;
  title: string;
  body: string;
  caller: string;
  phone: string;
  transportId?: string;
  crewId?: string;
  deltaMin?: number;
  breakMin?: number;
  newWindowStart?: number;
  newWindowEnd?: number;
  draft?: TransportDraft;
}

export interface LomacoLog {
  id: string;
  atMin: number;
  message: string;
  ok: boolean;
}

export interface TomorrowItem {
  id: string;
  transportId: string;
  patientName: string;
  from: string;
  to: string;
  timeLabel: string;
  posture: Posture;
  vehicle: VehicleType;
  include: boolean;
}

export interface Stats {
  moves: number;
  optimizerUsed: boolean;
  optimizerApplied: boolean;
  callsHandled: number;
  callsMissed: number;
  lomacoSends: number;
  baselineEmptyKm: number;
  baselinePlaced: number;
  baselineTotal: number;
  baselineFill: number;
  baselineLate: number;
  baselineScore: number;
}

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "ok" | "warn" | "bad";
}

export interface PlanStop {
  transportId: string;
  crewId: string;
  departMin: number;
}

export interface GameState {
  phase: Phase;
  view: ViewId;
  modal: ModalId | null;
  seed: number;
  density: Density;
  ambCount: number;
  vslCount: number;
  nowMin: number;
  paused: boolean;
  speed: Speed;
  regulationMs: number;
  locations: Location[];
  patients: Patient[];
  crews: Crew[];
  transports: Transport[];
  blocks: TimeBlock[];
  calls: Call[];
  lomaco: LomacoLog[];
  tomorrowItems: TomorrowItem[];
  tomorrowTransports: Transport[];
  tomorrowStops: PlanStop[] | null;
  stats: Stats;
  toast: Toast | null;
  toastSeq: number;
  selectedId?: string;
  crewFilter?: string;
  followNow: boolean;
  live: boolean;
  rules: Rules;
  vehicles: Vehicle[];
  staff: StaffMember[];
}
