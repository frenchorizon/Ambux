export const DAY_START = 6 * 60;
export const DAY_END = 20 * 60;
export const MISSION_ISO = "2026-10-16";
export const MISSION_DATE = "Vendredi 16 octobre 2026";
/** Nom fictif du régulateur imprimé sur la feuille Lomaco. */
export const DEMO_REGULATOR = "Noam Keller";
export const MAX_VEHICLES = 20;

export type VehicleType = "ambulance" | "vsl";
export type Posture = "assis" | "allonge" | "fauteuil";
export type TransportKind = "simple" | "aller" | "retour" | "dialyse_aller" | "dialyse_retour";
export type Density = "normale" | "chargee";
export type Speed = 1 | 2 | 4;
export type Phase = "briefing" | "playing" | "review" | "report";
export type ViewId =
  | "gantt"
  | "carte"
  | "file"
  | "synthese"
  | "reglages"
  | "tomorrow"
  | "crews"
  | "vehicles"
  | "patients"
  | "companies"
  | "lomaco"
  | "feuille";
export type ModalId = "optimizer" | "lomaco" | "import" | "help" | "closeDay" | "sheets";

export interface Rules {
  toleranceMin: number;
  mealMin: number;
  mealFrom: number;
  mealTo: number;
  maxAmb: number;
  maxVsl: number;
  sessionMin: number;
  amplitudeMin: number;
  /** Prise en charge au domicile ou à l'adresse, ambulance. */
  pecAmbMin: number;
  /** Prise en charge au domicile ou à l'adresse, VSL. */
  pecVslMin: number;
  /** Dépose et fin de mission, après le trajet en charge. */
  dropoffMin: number;
}

export const DEFAULT_RULES: Rules = {
  toleranceMin: 20,
  mealMin: 30,
  mealFrom: 11 * 60,
  mealTo: 14 * 60 + 30,
  maxAmb: 15,
  maxVsl: 25,
  sessionMin: 4 * 60,
  amplitudeMin: 11 * 60,
  pecAmbMin: 10,
  pecVslMin: 5,
  dropoffMin: 8,
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
  /** Code parc, ex. 105. */
  vehicleCode?: string;
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
  postalCode?: string;
}

export interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  birthYear: number;
  /** Date de naissance ISO, affichée « Né(e) le ». */
  birthDate?: string;
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
  /** Code parc affiché avant l'immatriculation, ex. 105. */
  vehicleCode?: string;
  vehicleName: string;
  color: string;
  baseId: string;
  shiftStart: number;
  shiftEnd: number;
  delayUntil: number;
  dea: boolean;
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
  /** Arrivée au centre de dialyse, avant la durée de séance. */
  centerArriveMin?: number;
  priority: "normal" | "urgent";
  cancelled: boolean;
  crewId?: string;
  departMin?: number;
  note?: string;
  /** Minutes d'attente du véhicule à l'établissement (séance, consultation). */
  stayMin?: number;
  /** Prestation lue dans l'export Lomaco. TAP est planifié comme un VSL. */
  service?: "AMB" | "VSL" | "TAP";
  /** Motif de transport, ex. DIAL, KINE, CONS, ORTHO, RADI. */
  motif?: "DIAL" | "KINE" | "CONS" | "ORTHO" | "RADI";
  /** Code équipage demandé à l'import, avant génération. */
  requestedCrew?: string;
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
  missionIso: string;
  missionLabel: string;
}
