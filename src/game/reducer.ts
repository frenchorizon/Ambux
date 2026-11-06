import { CREW_COLORS } from "../data/world";
import { pickMealSlot } from "./breaks";
import { generateDay } from "./generate";
import { applyUnavailability, placeTransport, planRipple, reoptimizeStable, rippleMessage } from "./imprevus";
import {
  bestSlotFor,
  findPauseStart,
  indexLocations,
  plannedPickup,
  previewPlacement,
  scheduleFleet,
  seanceReturnMin,
  startedIds,
  suggestCompact,
  travelLoc,
} from "./schedule";
import type {
  Call,
  Density,
  GameState,
  Location,
  ModalId,
  Patient,
  PlanStop,
  Rules,
  Speed,
  StaffMember,
  TimeBlock,
  Toast,
  Transport,
  Vehicle,
  VehicleType,
  ViewId,
} from "./types";
import { pauseResume } from "../lib/browserStore";
import { loadRules } from "../lib/rulesStore";
import { clampAmplitude } from "./workspace";
import { shiftForIndex } from "./shifts";
import { addIsoDays, formatMin, labelForIso, personName } from "../lib/format";
import { DAY_END, DAY_START, DEFAULT_RULES, MAX_VEHICLES, MISSION_DATE, MISSION_ISO } from "./types";
import type { DraftSnapshot } from "./persist";

export type Choice = "accept" | "refuse" | "expire";

export type Action =
  | { type: "START"; amb: number; vsl: number; density: Density; seed: number }
  | { type: "START_COMPANY"; depot: Location; amplitudeMin: number; view?: ViewId }
  | { type: "TICK"; dt: number }
  | { type: "PAUSE" }
  | { type: "SET_SPEED"; speed: Speed }
  | { type: "SET_VIEW"; view: ViewId }
  | { type: "OPEN_MODAL"; modal: ModalId }
  | { type: "CLOSE_MODAL" }
  | { type: "SELECT"; id?: string }
  | { type: "SET_CREW_FILTER"; crewId?: string }
  | { type: "TOGGLE_FOLLOW" }
  | { type: "ASSIGN"; transportId: string; crewId: string; departMin: number; coalesce?: boolean; ripple?: boolean }
  | { type: "UNASSIGN"; transportId: string }
  | { type: "PIN"; transportId: string }
  | { type: "UNPIN"; transportId: string }
  | {
      type: "SET_UNAVAILABILITY";
      crewId: string;
      fromMin: number;
      toMin: number;
      reason: "absence" | "panne";
      replace: boolean;
    }
  | { type: "ADD_LATE"; transport: Transport; patient?: Patient; location?: Location }
  | { type: "APPLY_REOPT" }
  | { type: "BEST_SLOT"; transportId: string }
  | { type: "COMPACT" }
  | { type: "APPLY_STOPS"; stops: PlanStop[]; meals?: TimeBlock[] }
  | { type: "PLACE_MEALS" }
  | { type: "SNAP_BACK"; transportId: string }
  | { type: "SET_RULES"; rules: Partial<Rules> }
  | { type: "SET_LIVE"; live: boolean }
  | { type: "ADD_VEHICLE"; plate: string; vehicleType: VehicleType; name: string }
  | { type: "UPDATE_VEHICLE"; vehicle: Vehicle }
  | { type: "REMOVE_VEHICLE"; id: string }
  | { type: "UPSERT_STAFF"; staff: StaffMember }
  | { type: "REMOVE_STAFF"; id: string }
  | { type: "SET_CREW_STAFF"; crewId: string; driverId: string; mateId?: string }
  | { type: "UPDATE_PATIENT"; patient: Patient; location?: Location }
  | { type: "UPDATE_TRANSPORT"; transport: Transport }
  | { type: "ADD_TRANSPORT"; transport: Transport; patient?: Patient; location?: Location }
  | {
      type: "IMPORT_BATCH";
      rows: {
        transport: Transport;
        patient: Patient;
        location?: Location;
        locations?: Location[];
        retour?: Transport;
      }[];
    }
  | { type: "RESTORE"; snapshot: DraftSnapshot; quiet?: boolean }
  | { type: "APPLY_BACKUP"; state: GameState }
  | { type: "RESET_BROWSER" }
  | { type: "NOTE_EXPORT"; message?: string }
  | { type: "REMOVE_TRANSPORT"; id: string }
  | { type: "NOTE_OPTIMIZER" }
  | { type: "RESOLVE_CALL"; callId: string; choice: Choice }
  | { type: "SEND_LOMACO" }
  | { type: "CLOSE_DAY" }
  | { type: "REVIEW"; view?: ViewId }
  | { type: "SHOW_REPORT" }
  | { type: "TOGGLE_TOMORROW"; id: string }
  | { type: "SET_TOMORROW_STOPS"; stops: PlanStop[] }
  | { type: "SET_MISSION"; iso: string }
  | { type: "ROLL_DAY" }
  | { type: "IMPORT_SERIES" }
  | { type: "CLEAR_DEMAND" }
  | { type: "IMPORT_VEHICLES"; rows: { plate: string; vehicleType: VehicleType; name: string; vehicleCode?: string }[] }
  | { type: "IMPORT_CREWS"; rows: { plate: string; driver: string; mate?: string; dea: boolean }[] }
  | {
      type: "IMPORT_APPLY";
      vehicles: {
        plate: string;
        vehicleType: VehicleType;
        name: string;
        vehicleCode?: string;
        active?: boolean;
        availability?: string;
      }[];
      crews: { plate: string; driver: string; mate?: string; dea: boolean }[];
      patients: { patient: Patient; location?: Location }[];
      personnel: { name: string; role: StaffMember["role"]; dea?: boolean; availability?: string }[];
      courses: {
        transport: Transport;
        patient: Patient;
        location?: Location;
        locations?: Location[];
        retour?: Transport;
      }[];
    }
  | { type: "HYDRATE"; state: GameState; label: string }
  | { type: "TOAST"; message: string; tone: Toast["tone"] }
  | { type: "DISMISS_TOAST" }
  | { type: "REPLAY" };

export const initialState: GameState = {
  phase: "briefing",
  view: "gantt",
  modal: null,
  seed: 20261015,
  density: "chargee",
  ambCount: 3,
  vslCount: 3,
  nowMin: DAY_START,
  paused: true,
  speed: 1,
  regulationMs: 0,
  locations: [],
  patients: [],
  crews: [],
  transports: [],
  blocks: [],
  calls: [],
  lomaco: [],
  tomorrowItems: [],
  tomorrowTransports: [],
  tomorrowStops: null,
  stats: {
    moves: 0,
    optimizerUsed: false,
    optimizerApplied: false,
    callsHandled: 0,
    callsMissed: 0,
    lomacoSends: 0,
    baselineEmptyKm: 0,
    baselinePlaced: 0,
    baselineTotal: 0,
    baselineFill: 0,
    baselineLate: 0,
    baselineScore: 0,
  },
  toast: null,
  toastSeq: 1,
  followNow: false,
  live: false,
  rules: DEFAULT_RULES,
  vehicles: [],
  staff: [],
  missionIso: MISSION_ISO,
  missionLabel: MISSION_DATE,
};

export function msPerGameMinute(speed: Speed): number {
  return 750 / speed;
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "START": {
      const world = generateDay(action);
      const fleet = fleetOf(world.crews);
      const rules = loadRules();
      return {
        ...initialState,
        ...world,
        crews: fleet.crews.map((crew, index) => ({ ...crew, ...shiftForIndex(index, rules.amplitudeMin) })),
        vehicles: fleet.vehicles,
        staff: fleet.staff,
        rules,
        live: false,
        transports: world.transports.map((transport) => ({
          ...transport,
          appointmentMin: transport.appointmentMin ?? transport.windowStart,
          toleranceMin: rules.toleranceMin,
        })),
        phase: "playing",
        view: "tomorrow",
        modal: null,
        ambCount: action.amb,
        vslCount: action.vsl,
        nowMin: DAY_START,
        paused: true,
        speed: 1,
        regulationMs: 0,
        tomorrowStops: null,
        toastSeq: 1,
        followNow: false,
        toast: {
          id: 1,
          tone: "info",
          message: "Demande de demain chargée. Générez le planning, puis ajustez les feuilles de route.",
        },
      };
    }
    case "START_COMPANY": {
      return withToast(
        {
          ...initialState,
          phase: "playing",
          view: action.view ?? "reglages",
          ambCount: 0,
          vslCount: 0,
          locations: [action.depot],
          rules: { ...loadRules(), amplitudeMin: clampAmplitude(action.amplitudeMin) },
          live: false,
          paused: true,
          toastSeq: state.toastSeq,
        },
        "Espace prêt. Ajoutez les équipages, les véhicules et la demande, ou importez un fichier.",
        "info",
      );
    }
    case "TICK": {
      if (state.phase !== "playing" || !state.live) return state;
      const regulationMs = state.regulationMs + action.dt;
      if (state.paused) return { ...state, regulationMs };
      const now = Math.min(DAY_END, state.nowMin + action.dt / msPerGameMinute(state.speed));
      let next: GameState = { ...state, nowMin: now, regulationMs };
      for (const call of state.calls) {
        if (!call.spawned && call.triggerMin <= now) next = spawnCall(next, call.id);
      }
      for (const call of next.calls) {
        if (call.spawned && !call.resolved && now >= call.triggerMin + 30) {
          next = settleCall(next, call.id, "expire");
        }
      }
      if (now >= DAY_END - 0.01) next = closeDay(next);
      return next;
    }
    case "PAUSE":
      if (state.phase !== "playing") return state;
      return { ...state, paused: !state.paused };
    case "SET_SPEED":
      return { ...state, speed: action.speed };
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "OPEN_MODAL":
      return { ...state, modal: action.modal };
    case "CLOSE_MODAL":
      return { ...state, modal: null };
    case "SELECT":
      return { ...state, selectedId: action.id };
    case "SET_CREW_FILTER":
      return { ...state, crewFilter: action.crewId, view: action.crewId ? "gantt" : state.view };
    case "TOGGLE_FOLLOW":
      return { ...state, followNow: !state.followNow };
    case "ASSIGN":
      return assign(state, action.transportId, action.crewId, action.departMin, action.ripple === true);
    case "PIN":
      return pin(state, action.transportId, true);
    case "UNPIN":
      return pin(state, action.transportId, false);
    case "SET_UNAVAILABILITY":
      return setUnavailability(state, action);
    case "ADD_LATE":
      return addLate(state, action.transport, action.patient, action.location);
    case "APPLY_REOPT":
      return applyReopt(state);
    case "UNASSIGN":
      return unassign(state, action.transportId);
    case "BEST_SLOT":
      return bestSlot(state, action.transportId);
    case "COMPACT":
      return compact(state);
    case "APPLY_STOPS":
      return applyStops(state, action.stops, action.meals);
    case "PLACE_MEALS":
      return placeMeals(state);
    case "SNAP_BACK":
      return snapBack(state, action.transportId);
    case "SET_RULES":
      return applyRules(state, { ...state.rules, ...action.rules });
    case "IMPORT_BATCH":
      return importBatch(state, action.rows);
    case "RESTORE":
      return restoreDraft(state, action.snapshot, action.quiet === true);
    case "APPLY_BACKUP":
      return withToast(
        { ...action.state, live: false, paused: true, modal: null, toastSeq: state.toastSeq + 1 },
        "Sauvegarde importée.",
        "ok",
      );
    case "RESET_BROWSER":
      return withToast(
        { ...initialState, toastSeq: state.toastSeq + 1 },
        "Données Ambux effacées de ce navigateur.",
        "info",
      );
    case "NOTE_EXPORT":
      return withToast(
        {
          ...state,
          stats: { ...state.stats, lomacoSends: state.stats.lomacoSends + 1 },
          lomaco: [
            ...state.lomaco,
            {
              id: `export-${state.toastSeq}`,
              atMin: state.nowMin,
              message: action.message ?? `Export CSV du planning du ${state.missionLabel}.`,
              ok: true,
            },
          ],
        },
        action.message ?? "Fichier CSV téléchargé.",
        "ok",
      );
    case "SET_LIVE":
      return setLive(state, action.live);
    case "ADD_VEHICLE":
      return addVehicle(state, action.plate, action.vehicleType, action.name);
    case "UPDATE_VEHICLE":
      return updateVehicle(state, action.vehicle);
    case "REMOVE_VEHICLE":
      return removeVehicle(state, action.id);
    case "UPSERT_STAFF":
      return upsertStaff(state, action.staff);
    case "REMOVE_STAFF":
      return removeStaff(state, action.id);
    case "SET_CREW_STAFF":
      return setCrewStaff(state, action.crewId, action.driverId, action.mateId);
    case "UPDATE_PATIENT":
      return updatePatient(state, action.patient, action.location);
    case "UPDATE_TRANSPORT":
      return updateTransport(state, action.transport);
    case "ADD_TRANSPORT":
      return addTransport(state, action.transport, action.patient, action.location);
    case "REMOVE_TRANSPORT":
      return {
        ...state,
        transports: state.transports.filter((transport) => transport.id !== action.id),
        selectedId: state.selectedId === action.id ? undefined : state.selectedId,
      };
    case "NOTE_OPTIMIZER":
      if (state.stats.optimizerUsed) return state;
      return { ...state, stats: { ...state.stats, optimizerUsed: true } };
    case "RESOLVE_CALL":
      return settleCall(state, action.callId, action.choice);
    case "SEND_LOMACO":
      return sendLomaco(state);
    case "CLOSE_DAY":
      return closeDay(state);
    case "REVIEW":
      return { ...state, phase: "review", paused: true, modal: null, view: action.view ?? state.view };
    case "SHOW_REPORT":
      return { ...state, phase: "report", paused: true, modal: null };
    case "TOGGLE_TOMORROW":
      return toggleTomorrow(state, action.id);
    case "SET_MISSION":
      return setMission(state, action.iso);
    case "ROLL_DAY":
      return rollDay(state);
    case "IMPORT_SERIES":
      return importSeries(state);
    case "CLEAR_DEMAND":
      return clearDemand(state);
    case "IMPORT_VEHICLES":
      return importVehicles(state, action.rows);
    case "IMPORT_CREWS":
      return importCrews(state, action.rows);
    case "IMPORT_APPLY":
      return importApply(state, action);
    case "HYDRATE":
      return hydrate(state, action.state, action.label);
    case "SET_TOMORROW_STOPS":
      return { ...state, tomorrowStops: action.stops, toast: toast(state, "Brouillon de demain calculé.", "ok") };
    case "TOAST":
      return { ...state, toast: toast(state, action.message, action.tone) };
    case "DISMISS_TOAST":
      return { ...state, toast: null };
    case "REPLAY":
      pauseResume();
      return { ...initialState, toastSeq: state.toastSeq };
    default:
      return state;
  }
}

function toast(state: GameState, message: string, tone: Toast["tone"]): Toast {
  return { id: state.toastSeq + 1, message, tone };
}

function withToast(state: GameState, message: string, tone: Toast["tone"]): GameState {
  return { ...state, toastSeq: state.toastSeq + 1, toast: { id: state.toastSeq + 1, message, tone } };
}

function assign(state: GameState, transportId: string, crewId: string, departMin: number, ripple = false): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  const crew = state.crews.find((item) => item.id === crewId);
  if (!transport || !crew) return state;
  const locMap = indexLocations(state.locations);
  const now = horizon(state);
  if (ripple) return assignRipple(state, transport, crew, departMin, locMap, now);
  const preview = previewPlacement(
    crew,
    transport,
    departMin,
    state.transports,
    state.blocks,
    locMap,
    now,
    state.rules,
  );
  if (!preview.ok) return withToast(state, preview.message, "warn");
  const moved = transport.crewId !== crew.id || Math.abs((transport.departMin ?? Number.NaN) - preview.departMin) > 0.5;
  return {
    ...state,
    transports: state.transports.map((item) =>
      item.id === transport.id
        ? { ...item, crewId: crew.id, departMin: preview.departMin, pinned: moved ? true : item.pinned }
        : item,
    ),
    stats: { ...state.stats, moves: state.stats.moves + 1 },
    selectedId: transport.id,
    toastSeq: preview.warning ? state.toastSeq + 1 : state.toastSeq,
    toast: preview.warning ? { id: state.toastSeq + 1, message: preview.warning, tone: "warn" } : state.toast,
  };
}

function assignRipple(
  state: GameState,
  transport: Transport,
  crew: GameState["crews"][number],
  departMin: number,
  locMap: ReturnType<typeof indexLocations>,
  now: number,
): GameState {
  const plan = planRipple({
    crew,
    transport,
    requestedDepart: departMin,
    transports: state.transports,
    blocks: state.blocks,
    locMap,
    nowMin: now,
    rules: state.rules,
    labelOf: (item) => courseLabel(state, item),
  });
  if (!plan.ok) return withToast(state, plan.message, "warn");
  const shifts = new Map(plan.shifts.map((shift) => [shift.transportId, shift.toDepartMin]));
  const next: GameState = {
    ...state,
    transports: state.transports.map((item) => {
      if (item.id === transport.id) return { ...item, crewId: crew.id, departMin: plan.departMin, pinned: true };
      const depart = shifts.get(item.id);
      if (depart == null) return item;
      return { ...item, departMin: depart };
    }),
    stats: { ...state.stats, moves: state.stats.moves + 1 },
    selectedId: transport.id,
  };
  const consequence = rippleMessage(plan.shifts);
  const message = [plan.warning, consequence].filter(Boolean).join(" ");
  if (!message) return next;
  return withToast(next, message, plan.warning ? "warn" : "info");
}

function courseLabel(state: GameState, transport: Transport): string {
  const patient = state.patients.find((item) => item.id === transport.patientId);
  return patient ? personName(patient) : transport.dossier;
}

function pin(state: GameState, transportId: string, pinned: boolean): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  if (!transport || transport.pinned === pinned) return state;
  return withToast(
    {
      ...state,
      transports: state.transports.map((item) => (item.id === transportId ? { ...item, pinned } : item)),
      selectedId: transportId,
    },
    pinned ? "Course épinglée. Elle ne bougera pas toute seule." : "Épingle retirée.",
    "info",
  );
}

function setUnavailability(state: GameState, action: Extract<Action, { type: "SET_UNAVAILABILITY" }>): GameState {
  const result = applyUnavailability({
    crews: state.crews,
    transports: state.transports,
    blocks: state.blocks,
    locations: state.locations,
    rules: state.rules,
    nowMin: horizon(state),
    crewId: action.crewId,
    fromMin: action.fromMin,
    toMin: action.toMin,
    reason: action.reason,
    replace: action.replace,
    labelOf: (transport) => courseLabel(state, transport),
  });
  if (!result.changed) return withToast(state, result.message, "warn");
  return withToast(
    { ...state, transports: result.transports, blocks: result.blocks },
    result.message,
    result.changes.length ? "warn" : "info",
  );
}

function addLate(state: GameState, transport: Transport, patient?: Patient, location?: Location): GameState {
  let locations = state.locations;
  let patients = state.patients;
  if (location && !locations.some((item) => item.id === location.id)) locations = [...locations, location];
  if (patient && !patients.some((item) => item.id === patient.id)) patients = [...patients, patient];
  const draft: Transport = { ...transport, cancelled: false, crewId: undefined, departMin: undefined, pinned: false };
  const withDraft: GameState = {
    ...state,
    locations,
    patients,
    transports: [...state.transports, draft],
    selectedId: draft.id,
  };
  const locMap = indexLocations(withDraft.locations);
  const slot = placeTransport(
    draft,
    withDraft.crews,
    withDraft.transports,
    withDraft.blocks,
    locMap,
    horizon(state),
    state.rules,
  );
  if (!slot) return withToast(withDraft, "Course ajoutée dans À placer : aucun créneau libre.", "warn");
  const crew = state.crews.find((item) => item.id === slot.crewId);
  return withToast(
    {
      ...withDraft,
      transports: withDraft.transports.map((item) =>
        item.id === draft.id ? { ...item, crewId: slot.crewId, departMin: slot.departMin, pinned: true } : item,
      ),
    },
    `Course ajoutée sur ${crew?.code ?? "un équipage"}, départ ${formatMin(slot.departMin)}.`,
    "ok",
  );
}

function applyReopt(state: GameState): GameState {
  const plan = reoptimizeStable({
    crews: state.crews,
    transports: state.transports,
    blocks: state.blocks,
    locations: state.locations,
    nowMin: horizon(state),
    rules: state.rules,
    labelOf: (transport) => courseLabel(state, transport),
  });
  if (!plan.changes.length) return withToast(state, "Aucune course déplacée.", "info");
  return withToast(
    { ...state, transports: plan.transports },
    `${plan.changes.length} course${plan.changes.length > 1 ? "s" : ""} déplacée${plan.changes.length > 1 ? "s" : ""}.`,
    "ok",
  );
}

function unassign(state: GameState, transportId: string): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  if (!transport?.crewId) return state;
  const locMap = indexLocations(state.locations);
  const schedules = scheduleFleet(state.crews, state.transports, state.blocks, locMap, "anchored", state.rules);
  if (startedIds(schedules, horizon(state)).has(transport.id)) {
    return withToast(state, "Course déjà engagée : impossible de la retirer.", "warn");
  }
  return {
    ...state,
    transports: state.transports.map((item) =>
      item.id === transport.id ? { ...item, crewId: undefined, departMin: undefined, pinned: false } : item,
    ),
    stats: { ...state.stats, moves: state.stats.moves + 1 },
    selectedId: transport.id,
  };
}

function bestSlot(state: GameState, transportId: string): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  if (!transport) return state;
  const locMap = indexLocations(state.locations);
  const slot = bestSlotFor(transport, state.crews, state.transports, state.blocks, locMap, horizon(state), state.rules);
  if (!slot) return withToast(state, "Conflit horaire : aucun équipage compatible n'a de créneau.", "warn");
  return assign(state, transport.id, slot.crewId, slot.departMin);
}

function compact(state: GameState): GameState {
  const locMap = indexLocations(state.locations);
  const updates = suggestCompact(state.crews, state.transports, state.blocks, locMap, horizon(state), state.rules);
  if (!updates.size) {
    return withToast(state, "Rien à resserrer : les départs collent déjà aux fenêtres.", "info");
  }
  let saved = 0;
  const transports = state.transports.map((transport) => {
    const next = updates.get(transport.id);
    if (next == null || transport.departMin == null) return transport;
    saved += Math.max(0, transport.departMin - next);
    return { ...transport, departMin: next };
  });
  return withToast(
    { ...state, transports },
    saved > 1 ? `Recalcul terminé — ${Math.round(saved)} min d'attente resserrées.` : "Feuilles de route recalculées.",
    "ok",
  );
}

function horizon(state: GameState): number {
  return state.live ? state.nowMin : -1;
}

function applyStops(state: GameState, stops: PlanStop[], meals?: TimeBlock[]): GameState {
  const locMap = indexLocations(state.locations);
  const frozen = startedIds(
    scheduleFleet(state.crews, state.transports, state.blocks, locMap, "anchored", state.rules),
    horizon(state),
  );
  const stopMap = new Map(stops.map((stop) => [stop.transportId, stop]));
  const transports = state.transports.map((transport) => {
    if (transport.cancelled || frozen.has(transport.id)) return transport;
    if (transport.pinned && transport.crewId && transport.departMin != null) return transport;
    const stop = stopMap.get(transport.id);
    if (!stop) {
      return transport.crewId ? { ...transport, crewId: undefined, departMin: undefined } : transport;
    }
    return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
  });
  const next: GameState = {
    ...state,
    transports,
    modal: null,
    view: "gantt",
    stats: { ...state.stats, optimizerApplied: true, optimizerUsed: true },
  };
  const withMeals = placeMeals(next, meals);
  const missing = withMeals.crews.filter(
    (crew) => !withMeals.blocks.some((block) => block.crewId === crew.id && block.kind === "repas"),
  ).length;
  return withToast(
    withMeals,
    missing
      ? `Planning généré. ${missing} équipage${missing > 1 ? "s" : ""} sans pause repas dans la fenêtre.`
      : "Planning généré. Pauses repas posées, trajets à vide inclus.",
    missing ? "warn" : "ok",
  );
}

function spawnCall(state: GameState, callId: string): GameState {
  const call = state.calls.find((item) => item.id === callId);
  if (!call || call.spawned) return state;
  return withToast(
    {
      ...state,
      calls: state.calls.map((item) => (item.id === callId ? { ...item, spawned: true } : item)),
    },
    `Appel entrant — ${call.title}`,
    call.kind === "urgent" || call.kind === "panne" ? "bad" : "info",
  );
}

function settleCall(state: GameState, callId: string, choice: Choice): GameState {
  const call = state.calls.find((item) => item.id === callId);
  if (!call || call.resolved) return state;
  let next: GameState = {
    ...state,
    calls: state.calls.map((item) =>
      item.id === callId ? { ...item, spawned: true, resolved: true, expired: choice === "expire" } : item,
    ),
  };
  if (choice === "expire") {
    next = {
      ...next,
      stats: { ...next.stats, callsMissed: next.stats.callsMissed + 1 },
    };
    const implied: Choice = implyExpire(call);
    return applyChoice(next, call, implied, true);
  }
  if (choice === "accept") {
    next = { ...next, stats: { ...next.stats, callsHandled: next.stats.callsHandled + 1 } };
    return applyChoice(next, call, "accept", false);
  }
  next = { ...next, stats: { ...next.stats, callsHandled: next.stats.callsHandled + 1 } };
  if (call.kind === "ajout" || call.kind === "urgent") {
    next = {
      ...next,
      stats: { ...next.stats, callsMissed: next.stats.callsMissed + 1 },
    };
    return withToast(next, "Demande refusée. Le patient se tourne vers un autre transporteur.", "bad");
  }
  if (call.kind === "retard" || call.kind === "panne") {
    return applyChoice(next, call, "accept", false);
  }
  return withToast(next, call.kind === "pause" ? "Pause refusée." : "Demande classée sans suite.", "info");
}

function implyExpire(call: Call): Choice {
  if (call.kind === "ajout" || call.kind === "urgent" || call.kind === "pause") return "refuse";
  return "accept";
}

function applyChoice(state: GameState, call: Call, choice: Choice, expired: boolean): GameState {
  if (choice === "refuse") {
    return withToast(
      state,
      expired ? `${call.title} sans réponse — la demande est perdue.` : "Demande refusée.",
      "warn",
    );
  }
  switch (call.kind) {
    case "ajout":
    case "urgent":
      return addDraft(state, call, expired);
    case "annulation":
      return cancelTransport(state, call, expired);
    case "deplacement":
      return moveWindow(state, call, expired);
    case "retard":
      return delayCrew(state, call, expired);
    case "panne":
      return breakCrew(state, call, "panne", expired);
    case "pause":
      return breakCrew(state, call, "pause", expired);
    default:
      return state;
  }
}

function addDraft(state: GameState, call: Call, expired: boolean): GameState {
  if (!call.draft) return state;
  const transport: Transport = { ...call.draft.transport, cancelled: false };
  const known = new Set(state.patients.map((patient) => patient.id));
  const patients =
    call.draft.patient && !known.has(call.draft.patient.id) ? [...state.patients, call.draft.patient] : state.patients;
  return withToast(
    { ...state, patients, transports: [...state.transports, transport] },
    expired
      ? "Demande expirée : la course a été notée, sans équipage."
      : "Course ajoutée dans les transports non affectés.",
    expired ? "warn" : "ok",
  );
}

function cancelTransport(state: GameState, call: Call, expired: boolean): GameState {
  const transport = state.transports.find((item) => item.id === call.transportId);
  if (!transport || transport.cancelled) {
    return withToast(state, "La course était déjà annulée.", "info");
  }
  const locMap = indexLocations(state.locations);
  const schedules = scheduleFleet(state.crews, state.transports, state.blocks, locMap, "anchored", state.rules);
  const leg = [...schedules.values()]
    .flatMap((schedule) => schedule.legs)
    .find((item) => item.transportId === transport.id);
  if (leg && leg.endMin <= state.nowMin) {
    return withToast(state, "Trop tard : la course est déjà terminée.", "warn");
  }
  return withToast(
    {
      ...state,
      transports: state.transports.map((item) =>
        item.id === transport.id ? { ...item, cancelled: true, crewId: undefined, departMin: undefined } : item,
      ),
    },
    expired ? `Appel manqué — ${call.caller} est annulé d'office.` : `Course annulée — ${call.caller}.`,
    "warn",
  );
}

function moveWindow(state: GameState, call: Call, expired: boolean): GameState {
  if (call.newWindowStart == null || call.newWindowEnd == null || !call.transportId) return state;
  return withToast(
    {
      ...state,
      transports: state.transports.map((item) =>
        item.id === call.transportId
          ? { ...item, windowStart: call.newWindowStart!, windowEnd: call.newWindowEnd! }
          : item,
      ),
    },
    expired ? "Horaire modifié sans votre validation. Vérifiez le créneau." : "Fenêtre horaire mise à jour.",
    expired ? "warn" : "ok",
  );
}

function delayCrew(state: GameState, call: Call, expired: boolean): GameState {
  if (!call.crewId) return state;
  const delta = call.deltaMin ?? 15;
  const crew = state.crews.find((item) => item.id === call.crewId);
  let held = 0;
  const transports = state.transports.map((item) => {
    if (item.crewId !== call.crewId || item.departMin == null || item.cancelled) return item;
    if (item.departMin <= state.nowMin) return item;
    if (item.pinned) {
      held += 1;
      return item;
    }
    return { ...item, departMin: item.departMin + delta };
  });
  const heldNote = held
    ? ` ${held} course${held > 1 ? "s" : ""} épinglée${held > 1 ? "s" : ""} reste${held > 1 ? "nt" : ""} en place.`
    : "";
  return withToast(
    {
      ...state,
      crews: state.crews.map((item) => (item.id === call.crewId ? { ...item, delayUntil: state.nowMin + 50 } : item)),
      transports,
    },
    expired
      ? `${crew?.code ?? "L'équipage"} encaisse ${delta} min de retard, appel non pris.${heldNote}`
      : `${crew?.code ?? "L'équipage"} : courses suivantes décalées de ${delta} min.${heldNote}`,
    "warn",
  );
}

function breakCrew(state: GameState, call: Call, kind: "pause" | "panne", expired: boolean): GameState {
  if (!call.crewId) return state;
  const crew = state.crews.find((item) => item.id === call.crewId);
  if (!crew) return state;
  const duration = call.breakMin ?? (kind === "panne" ? 40 : 20);
  const locMap = indexLocations(state.locations);
  const start =
    kind === "panne"
      ? state.nowMin
      : findPauseStart(crew, state.transports, state.blocks, locMap, state.nowMin, duration);
  const block: TimeBlock = {
    id: `${kind}-${call.id}`,
    crewId: crew.id,
    startMin: start,
    endMin: start + duration,
    kind,
    label: kind === "panne" ? "Panne" : "Pause",
  };
  const blocks = [...state.blocks, block];
  let released = 0;
  let held = 0;
  const transports = state.transports.map((transport) => {
    if (kind !== "panne" || transport.crewId !== crew.id || transport.departMin == null || transport.cancelled) {
      return transport;
    }
    const overlaps = transport.departMin < block.endMin && transport.departMin + 35 > block.startMin;
    const started = transport.departMin <= state.nowMin;
    if (!overlaps || started) return transport;
    if (transport.pinned) {
      held += 1;
      return transport;
    }
    released += 1;
    return { ...transport, crewId: undefined, departMin: undefined, pinned: false };
  });
  const label = kind === "panne" ? "Panne enregistrée" : "Pause posée";
  const extra = released
    ? ` ${released} course${released > 1 ? "s" : ""} remise${released > 1 ? "s" : ""} au standard.`
    : "";
  const heldNote = held
    ? ` ${held} course${held > 1 ? "s" : ""} épinglée${held > 1 ? "s" : ""} laissée${held > 1 ? "s" : ""} en place.`
    : "";
  return withToast(
    {
      ...state,
      blocks,
      transports,
      crews: state.crews.map((item) =>
        item.id === crew.id ? { ...item, delayUntil: kind === "panne" ? block.endMin : item.delayUntil } : item,
      ),
    },
    expired
      ? `${label} automatiquement sur ${crew.code}.${extra}${heldNote}`
      : `${label} sur ${crew.code}.${extra}${heldNote}`,
    kind === "panne" ? "bad" : "info",
  );
}

function sendLomaco(state: GameState): GameState {
  const counts = new Map<string, number>();
  for (const transport of state.transports) {
    if (transport.cancelled || !transport.crewId) continue;
    counts.set(transport.crewId, (counts.get(transport.crewId) ?? 0) + 1);
  }
  const lines = state.crews.map((crew) => ({
    id: `lomaco-${state.lomaco.length}-${crew.id}-${state.toastSeq}`,
    atMin: state.nowMin,
    message: `${crew.code} · ${crew.plate} — ${counts.get(crew.id) ?? 0} courses transmises.`,
    ok: true,
  }));
  return withToast(
    {
      ...state,
      modal: null,
      lomaco: [
        ...state.lomaco,
        ...lines,
        {
          id: `lomaco-ok-${state.toastSeq}`,
          atMin: state.nowMin,
          message: "Accusé Lomaco : synchronisation terminée (démo).",
          ok: true,
        },
      ],
      stats: { ...state.stats, lomacoSends: state.stats.lomacoSends + 1 },
    },
    `${state.crews.length} feuilles de route envoyées vers Lomaco.`,
    "ok",
  );
}

function closeDay(state: GameState): GameState {
  if (state.phase === "report" || state.phase === "review") return state;
  let next: GameState = { ...state, phase: "report", paused: true, modal: null };
  for (const call of state.calls) {
    if (!call.resolved) next = settleCall({ ...next, phase: "playing" }, call.id, "expire");
  }
  return { ...next, phase: "report", paused: true, modal: null };
}

function fleetOf(crews: GameState["crews"]): { crews: GameState["crews"]; vehicles: Vehicle[]; staff: StaffMember[] } {
  const vehicles: Vehicle[] = [];
  const staff: StaffMember[] = [
    { id: "st-spare-1", name: "Lina Morel", role: "auxiliaire", dea: true },
    { id: "st-spare-2", name: "Hugo Perrin", role: "conducteur", dea: false },
    { id: "st-spare-3", name: "Nadia Benali", role: "conducteur", dea: false },
  ];
  const next = crews.map((crew) => {
    const vehicleId = `veh-${crew.id}`;
    const driverId = `st-${crew.id}-d`;
    const mateId = crew.vehicleType === "ambulance" ? `st-${crew.id}-m` : undefined;
    vehicles.push({
      id: vehicleId,
      plate: crew.plate,
      vehicleType: crew.vehicleType,
      name: crew.vehicleName,
      active: true,
    });
    staff.push({ id: driverId, name: crew.driver, role: "conducteur", dea: false });
    if (mateId) staff.push({ id: mateId, name: crew.mate, role: "auxiliaire", dea: true });
    return { ...crew, vehicleId, driverId, mateId, dea: crew.vehicleType === "ambulance" };
  });
  return { crews: next, vehicles, staff };
}

function placeMeals(state: GameState, preset?: TimeBlock[]): GameState {
  const foreign = state.blocks.filter((block) => block.kind !== "repas");
  if (preset) return { ...state, blocks: [...foreign, ...preset] };
  const locMap = indexLocations(state.locations);
  const schedules = scheduleFleet(state.crews, state.transports, foreign, locMap, "anchored", state.rules);
  const meals: TimeBlock[] = [];
  for (const crew of state.crews) {
    const schedule = schedules.get(crew.id);
    if (!schedule) continue;
    const meal = pickMealSlot(schedule, crew, state.rules);
    if (meal) meals.push(meal);
  }
  return { ...state, blocks: [...foreign, ...meals] };
}

function setLive(state: GameState, live: boolean): GameState {
  if (live) {
    return withToast(
      {
        ...state,
        live: true,
        paused: false,
        nowMin: DAY_START,
        view: "gantt",
        followNow: true,
      },
      "Simulation optionnelle lancée. Les appels restent secondaires : le planning de demain est déjà posé.",
      "info",
    );
  }
  return withToast(
    { ...state, live: false, paused: true, followNow: false },
    "Retour à la préparation du planning. L'horloge est figée.",
    "info",
  );
}

function snapBack(state: GameState, transportId: string): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  if (!transport) return state;
  const locMap = indexLocations(state.locations);
  const appointment = plannedPickup(transport);
  if (!transport.crewId) {
    const slot = bestSlotFor(
      transport,
      state.crews,
      state.transports,
      state.blocks,
      locMap,
      horizon(state),
      state.rules,
    );
    if (!slot) return withToast(state, "Aucun créneau compatible pour revenir à l'heure prévue.", "warn");
    return assign(state, transport.id, slot.crewId, appointment);
  }
  const crew = state.crews.find((item) => item.id === transport.crewId);
  if (!crew) return state;
  const schedule = scheduleFleet(
    [crew],
    state.transports.filter((item) => item.id !== transport.id),
    state.blocks,
    locMap,
    "anchored",
    state.rules,
  ).get(crew.id);
  let fromId = crew.baseId;
  let earliest = crew.shiftStart;
  for (const leg of schedule?.legs ?? []) {
    if (leg.endMin <= appointment) {
      fromId = leg.dropoffId;
      earliest = leg.endMin;
    }
  }
  const travel = travelLoc(fromId, transport.pickupId, locMap);
  const depart = Math.max(earliest, appointment - travel.min);
  const preview = previewPlacement(
    crew,
    transport,
    depart,
    state.transports,
    state.blocks,
    locMap,
    horizon(state),
    state.rules,
  );
  if (!preview.ok) return withToast(state, preview.message, "warn");
  const current = scheduleFleet([crew], state.transports, state.blocks, locMap, "anchored", state.rules)
    .get(crew.id)
    ?.legs.find((leg) => leg.transportId === transport.id);
  const nextGap = Math.abs(preview.leg.deviationMin);
  const currentGap = current ? Math.abs(current.deviationMin) : nextGap;
  if (nextGap > currentGap + 1) {
    return withToast(state, "L'heure prévue est occupée : la course reste où elle est.", "warn");
  }
  return assign(state, transport.id, crew.id, preview.departMin);
}

function applyRules(state: GameState, rules: Rules): GameState {
  const crews =
    rules.amplitudeMin === state.rules.amplitudeMin
      ? state.crews
      : state.crews.map((crew, index) => ({ ...crew, ...shiftForIndex(index, rules.amplitudeMin) }));
  const transports = state.transports.map((transport) => {
    const appointment =
      transport.kind === "dialyse_retour" && transport.centerArriveMin != null
        ? transport.centerArriveMin + rules.sessionMin
        : (transport.appointmentMin ?? transport.windowStart);
    return {
      ...transport,
      appointmentMin: appointment,
      toleranceMin: rules.toleranceMin,
      windowStart: appointment - rules.toleranceMin,
      windowEnd: appointment + rules.toleranceMin,
    };
  });
  return placeMeals({ ...state, rules, crews, transports });
}

function importBatch(
  state: GameState,
  rows: { transport: Transport; patient: Patient; location?: Location; locations?: Location[]; retour?: Transport }[],
): GameState {
  let locations = state.locations;
  let patients = state.patients;
  let transports = state.transports;
  for (const row of rows) {
    const incoming = [...(row.locations ?? []), ...(row.location ? [row.location] : [])];
    for (const place of incoming) {
      if (!locations.some((item) => item.id === place.id)) locations = [...locations, place];
    }
    if (!patients.some((item) => item.id === row.patient.id)) patients = [...patients, row.patient];
    transports = [...transports, row.transport];
    if (row.retour) transports = [...transports, row.retour];
  }
  const count = rows.reduce((sum, row) => sum + (row.retour ? 2 : 1), 0);
  return withToast(
    { ...state, locations, patients, transports },
    `${count} transport${count > 1 ? "s" : ""} ajouté${count > 1 ? "s" : ""}.`,
    "ok",
  );
}

function restoreDraft(state: GameState, snapshot: DraftSnapshot, quiet: boolean): GameState {
  const next: GameState = {
    ...initialState,
    ...snapshot,
    phase: "playing",
    view: "gantt",
    modal: null,
    live: false,
    paused: true,
    nowMin: DAY_START,
    followNow: false,
    toast: null,
    toastSeq: state.toastSeq,
    selectedId: undefined,
    rules: { ...DEFAULT_RULES, ...snapshot.rules },
    missionIso: snapshot.missionIso || MISSION_ISO,
    missionLabel: snapshot.missionDate || labelForIso(snapshot.missionIso || MISSION_ISO),
  };
  if (quiet) return next;
  return withToast(next, `Brouillon v${snapshot.version} repris · ${snapshot.missionDate}.`, "ok");
}

function baseDepotId(state: GameState): string {
  return state.crews[0]?.baseId ?? state.locations.find((location) => location.kind === "depot")?.id ?? "depot-sud";
}

function addVehicle(
  state: GameState,
  plate: string,
  vehicleType: VehicleType,
  name: string,
  vehicleCode?: string,
): GameState {
  const clean = plate.trim().toUpperCase();
  if (clean.length < 4) return withToast(state, "Immatriculation trop courte.", "warn");
  if (state.crews.length >= MAX_VEHICLES) return withToast(state, `Plafond de ${MAX_VEHICLES} véhicules.`, "warn");
  const id = `veh-${state.toastSeq}`;
  const code = vehicleCode?.trim() || undefined;
  const vehicle: Vehicle = {
    id,
    plate: clean,
    vehicleType,
    name: name.trim() || (vehicleType === "ambulance" ? "Ambulance" : "VSL"),
    vehicleCode: code,
    active: true,
  };
  const index = state.crews.length;
  const crewId = `crew-${state.toastSeq}`;
  const driver = state.staff.find(
    (member) => member.role === "conducteur" && !state.crews.some((crew) => crew.driverId === member.id),
  );
  const mate =
    vehicleType === "ambulance"
      ? state.staff.find(
          (member) => member.dea && member.id !== driver?.id && !state.crews.some((crew) => crew.mateId === member.id),
        )
      : undefined;
  const crew = {
    id: crewId,
    code: vehicleType === "ambulance" ? `AMB-${index + 1}` : `VSL-${index + 1}`,
    driver: driver?.name ?? "Conducteur à nommer",
    mate: mate?.name ?? (vehicleType === "ambulance" ? "DEA à nommer" : ""),
    vehicleType,
    vehicleCode: code,
    plate: clean,
    vehicleName: vehicle.name,
    color: CREW_COLORS[index % CREW_COLORS.length]!,
    baseId: baseDepotId(state),
    ...shiftForIndex(index, state.rules.amplitudeMin),
    delayUntil: 0,
    dea: vehicleType === "ambulance" && Boolean(driver?.dea || mate?.dea),
    vehicleId: id,
    driverId: driver?.id,
    mateId: mate?.id,
  };
  return withToast(
    { ...state, vehicles: [...state.vehicles, vehicle], crews: [...state.crews, crew] },
    `${clean} est en ligne avec un équipage.`,
    "ok",
  );
}

function updateVehicle(state: GameState, vehicle: Vehicle): GameState {
  return {
    ...state,
    vehicles: state.vehicles.map((item) => (item.id === vehicle.id ? vehicle : item)),
    crews: state.crews.map((crew) =>
      crew.vehicleId === vehicle.id
        ? { ...crew, plate: vehicle.plate, vehicleType: vehicle.vehicleType, vehicleName: vehicle.name }
        : crew,
    ),
  };
}

function removeVehicle(state: GameState, id: string): GameState {
  const crew = state.crews.find((item) => item.vehicleId === id);
  return withToast(
    {
      ...state,
      vehicles: state.vehicles.filter((item) => item.id !== id),
      crews: state.crews.filter((item) => item.vehicleId !== id),
      transports: state.transports.map((transport) =>
        crew && transport.crewId === crew.id ? { ...transport, crewId: undefined, departMin: undefined } : transport,
      ),
      blocks: state.blocks.filter((block) => block.crewId !== crew?.id),
    },
    "Véhicule retiré. Ses courses reviennent dans la demande.",
    "info",
  );
}

function upsertStaff(state: GameState, member: StaffMember): GameState {
  const exists = state.staff.some((item) => item.id === member.id);
  const staff = exists ? state.staff.map((item) => (item.id === member.id ? member : item)) : [...state.staff, member];
  const crews = state.crews.map((crew) => ({
    ...crew,
    driver: crew.driverId === member.id ? member.name : crew.driver,
    mate: crew.mateId === member.id ? member.name : crew.mate,
  }));
  return { ...state, staff, crews };
}

function removeStaff(state: GameState, id: string): GameState {
  return {
    ...state,
    staff: state.staff.filter((item) => item.id !== id),
    crews: state.crews.map((crew) => ({
      ...crew,
      driverId: crew.driverId === id ? undefined : crew.driverId,
      mateId: crew.mateId === id ? undefined : crew.mateId,
      driver: crew.driverId === id ? "Conducteur à nommer" : crew.driver,
      mate: crew.mateId === id ? "" : crew.mate,
    })),
  };
}

function setCrewStaff(state: GameState, crewId: string, driverId: string, mateId?: string): GameState {
  const driver = state.staff.find((item) => item.id === driverId);
  const mate = mateId ? state.staff.find((item) => item.id === mateId) : undefined;
  const crew = state.crews.find((item) => item.id === crewId);
  if (!crew || !driver) return state;
  if (crew.vehicleType === "ambulance" && !mate) {
    return withToast(state, "Une ambulance part avec deux personnes, dont un DEA.", "warn");
  }
  if (crew.vehicleType === "ambulance" && mate && !mate.dea && !driver.dea) {
    return withToast(state, "L'équipage ambulance doit inclure un DEA.", "warn");
  }
  const dea = crew.vehicleType === "ambulance" && Boolean(driver.dea || mate?.dea);
  return {
    ...state,
    crews: state.crews.map((item) =>
      item.id === crewId ? { ...item, driverId, mateId, driver: driver.name, mate: mate?.name ?? "", dea } : item,
    ),
  };
}

function updatePatient(state: GameState, patient: Patient, location?: Location): GameState {
  const locations = location
    ? state.locations.some((item) => item.id === location.id)
      ? state.locations.map((item) => (item.id === location.id ? location : item))
      : [...state.locations, location]
    : state.locations;
  const mobility = patient.mobility;
  return {
    ...state,
    locations,
    patients: state.patients.some((item) => item.id === patient.id)
      ? state.patients.map((item) => (item.id === patient.id ? patient : item))
      : [...state.patients, patient],
    transports: mobility
      ? state.transports.map((transport) =>
          transport.patientId === patient.id ? { ...transport, posture: mobility } : transport,
        )
      : state.transports,
  };
}

function updateTransport(state: GameState, transport: Transport): GameState {
  return {
    ...state,
    transports: linkSeance(
      state.transports.filter((item) => item.id !== transport.id),
      transport,
      state.rules.toleranceMin,
    ),
  };
}

function addTransport(state: GameState, transport: Transport, patient?: Patient, location?: Location): GameState {
  let next = state;
  if (location && !next.locations.some((item) => item.id === location.id)) {
    next = { ...next, locations: [...next.locations, location] };
  }
  if (patient && !next.patients.some((item) => item.id === patient.id)) {
    next = { ...next, patients: [...next.patients, patient] };
  }
  return withToast(
    {
      ...next,
      transports: linkSeance(next.transports, transport, next.rules.toleranceMin),
      selectedId: transport.id,
    },
    "Transport ajouté à la demande de demain.",
    "ok",
  );
}

function linkSeance(transports: readonly Transport[], aller: Transport, tolerance: number): Transport[] {
  const wait = Math.max(0, aller.stayMin ?? 0);
  if (wait <= 0 || aller.kind.includes("retour")) return [...transports, aller];
  const seriesId = aller.seriesId || aller.id;
  const outbound: Transport = {
    ...aller,
    kind: aller.kind === "simple" ? "aller" : aller.kind,
    seriesId,
    stayMin: wait,
  };
  const arrival = outbound.appointmentMin ?? outbound.windowStart;
  const back = seanceReturnMin(arrival, wait);
  const previous = transports.find((item) => item.seriesId === seriesId && item.kind.includes("retour"));
  const retour: Transport = {
    ...(previous ?? outbound),
    id: previous?.id ?? `${outbound.id}-r`,
    pickupId: outbound.dropoffId,
    dropoffId: outbound.pickupId,
    kind: outbound.kind.startsWith("dialyse") ? "dialyse_retour" : "retour",
    appointmentMin: back,
    toleranceMin: tolerance,
    windowStart: back - tolerance,
    windowEnd: back + tolerance,
    seriesId,
    stayMin: undefined,
    crewId: previous?.crewId,
    departMin: previous?.departMin,
    cancelled: false,
    note: previous?.note ?? (outbound.note ? `${outbound.note} · retour` : "Retour"),
  };
  return [...transports.filter((item) => item.id !== retour.id), outbound, retour];
}

function clearDemand(state: GameState): GameState {
  return withToast(
    {
      ...state,
      transports: [],
      blocks: state.blocks.filter((block) => block.kind !== "repas"),
      selectedId: undefined,
    },
    "Demande vidée. Importez ou saisissez les courses.",
    "info",
  );
}

function importApply(state: GameState, action: Extract<Action, { type: "IMPORT_APPLY" }>): GameState {
  let next = state;
  let vehiclesAdded = 0;
  for (const row of action.vehicles) {
    const before = next.vehicles.length;
    next = pushImportedVehicle(next, row);
    if (next.vehicles.length > before) vehiclesAdded += 1;
  }
  let staffAdded = 0;
  for (const row of action.personnel) {
    const existing = next.staff.find(
      (member) =>
        member.name.localeCompare(row.name, "fr", { sensitivity: "accent" }) === 0 && member.role === row.role,
    );
    if (existing) {
      next = {
        ...next,
        staff: next.staff.map((member) =>
          member.id === existing.id
            ? { ...member, dea: member.dea || Boolean(row.dea), availability: row.availability ?? member.availability }
            : member,
        ),
      };
      continue;
    }
    const added = ensureStaff(next, row.name, row.role, Boolean(row.dea));
    next = added.state;
    if (row.availability) {
      next = {
        ...next,
        staff: next.staff.map((member) =>
          member.id === added.id ? { ...member, availability: row.availability } : member,
        ),
      };
    }
    staffAdded += 1;
  }
  let crewsUpdated = 0;
  for (const row of action.crews) {
    const plate = row.plate.replace(/\s+/g, "").toUpperCase();
    const crew = next.crews.find((item) => item.plate.replace(/\s+/g, "").toUpperCase() === plate);
    if (!crew) continue;
    const driver = ensureStaff(next, row.driver, "conducteur", false);
    next = driver.state;
    const mate = row.mate ? ensureStaff(next, row.mate, "auxiliaire", row.dea) : undefined;
    if (mate) next = mate.state;
    next = setCrewStaff(next, crew.id, driver.id, mate?.id);
    crewsUpdated += 1;
  }
  let patientsAdded = 0;
  for (const row of action.patients) {
    if (row.location && !next.locations.some((item) => item.id === row.location!.id)) {
      next = { ...next, locations: [...next.locations, row.location] };
    }
    if (next.patients.some((item) => item.id === row.patient.id)) continue;
    next = { ...next, patients: [...next.patients, row.patient] };
    patientsAdded += 1;
  }
  const courseCount = action.courses.reduce((sum, row) => sum + (row.retour ? 2 : 1), 0);
  if (action.courses.length) next = importBatch(next, action.courses);
  const bits: string[] = [];
  if (courseCount)
    bits.push(`${courseCount} transport${courseCount > 1 ? "s" : ""} ajouté${courseCount > 1 ? "s" : ""}`);
  if (patientsAdded)
    bits.push(`${patientsAdded} patient${patientsAdded > 1 ? "s" : ""} ajouté${patientsAdded > 1 ? "s" : ""}`);
  if (vehiclesAdded)
    bits.push(`${vehiclesAdded} véhicule${vehiclesAdded > 1 ? "s" : ""} ajouté${vehiclesAdded > 1 ? "s" : ""}`);
  if (staffAdded) bits.push(`${staffAdded} personne${staffAdded > 1 ? "s" : ""} ajoutée${staffAdded > 1 ? "s" : ""}`);
  if (crewsUpdated) bits.push(`${crewsUpdated} équipage${crewsUpdated > 1 ? "s" : ""} mis à jour`);
  if (!bits.length) return withToast(state, "Rien à fusionner.", "warn");
  return withToast(next, `${bits.join(" · ")}.`, "ok");
}

function pushImportedVehicle(
  state: GameState,
  row: {
    plate: string;
    vehicleType: VehicleType;
    name: string;
    vehicleCode?: string;
    active?: boolean;
    availability?: string;
  },
): GameState {
  const clean = row.plate.trim().toUpperCase();
  if (clean.length < 4) return state;
  if (state.vehicles.some((item) => item.plate.replace(/\s+/g, "").toUpperCase() === clean.replace(/\s+/g, "")))
    return state;
  const id = `veh-import-${clean.replace(/[^A-Z0-9]+/g, "")}`;
  const code = row.vehicleCode?.trim() || undefined;
  const vehicle: Vehicle = {
    id,
    plate: clean,
    vehicleType: row.vehicleType,
    name: row.name.trim() || (row.vehicleType === "ambulance" ? "Ambulance" : "VSL"),
    vehicleCode: code,
    active: row.active !== false,
    availability: row.availability,
  };
  const index = state.crews.length;
  const crewId = `crew-import-${id}`;
  const crew = {
    id: crewId,
    code: row.vehicleType === "ambulance" ? `AMB-${index + 1}` : `VSL-${index + 1}`,
    driver: "Conducteur à nommer",
    mate: row.vehicleType === "ambulance" ? "DEA à nommer" : "",
    vehicleType: row.vehicleType,
    vehicleCode: code,
    plate: clean,
    vehicleName: vehicle.name,
    color: CREW_COLORS[index % CREW_COLORS.length]!,
    baseId: baseDepotId(state),
    ...shiftForIndex(index, state.rules.amplitudeMin),
    delayUntil: 0,
    dea: false,
    vehicleId: id,
  };
  return { ...state, vehicles: [...state.vehicles, vehicle], crews: [...state.crews, crew] };
}

function importVehicles(
  state: GameState,
  rows: { plate: string; vehicleType: VehicleType; name: string; vehicleCode?: string }[],
): GameState {
  let next = state;
  let added = 0;
  for (const row of rows) {
    const before = next.vehicles.length;
    next = addVehicle(next, row.plate, row.vehicleType, row.name, row.vehicleCode);
    if (next.vehicles.length > before) added += 1;
  }
  if (!added) return withToast(state, "Aucun véhicule ajouté.", "warn");
  return withToast(next, `${added} véhicule${added > 1 ? "s" : ""} ajouté${added > 1 ? "s" : ""}.`, "ok");
}

function importCrews(
  state: GameState,
  rows: { plate: string; driver: string; mate?: string; dea: boolean }[],
): GameState {
  let next = state;
  let updated = 0;
  for (const row of rows) {
    const plate = row.plate.replace(/\s+/g, "").toUpperCase();
    const crew = next.crews.find((item) => item.plate.replace(/\s+/g, "").toUpperCase() === plate);
    if (!crew) continue;
    const driver = ensureStaff(next, row.driver, "conducteur", false);
    next = driver.state;
    const mate = row.mate ? ensureStaff(next, row.mate, "auxiliaire", row.dea) : undefined;
    if (mate) next = mate.state;
    const applied = setCrewStaff(next, crew.id, driver.id, mate?.id);
    if (applied !== next || applied.crews.find((item) => item.id === crew.id)?.driver === row.driver) {
      next = applied;
      updated += 1;
    }
  }
  if (!updated) return withToast(state, "Aucun équipage mis à jour.", "warn");
  return withToast(next, `${updated} équipage${updated > 1 ? "s" : ""} mis à jour.`, "ok");
}

function ensureStaff(
  state: GameState,
  name: string,
  role: StaffMember["role"],
  dea: boolean,
): { state: GameState; id: string } {
  const found = state.staff.find(
    (member) => member.role === role && member.name.localeCompare(name, "fr", { sensitivity: "accent" }) === 0,
  );
  if (found) {
    if (dea && !found.dea) {
      return {
        id: found.id,
        state: {
          ...state,
          staff: state.staff.map((member) => (member.id === found.id ? { ...member, dea: true } : member)),
        },
      };
    }
    return { state, id: found.id };
  }
  const id = `st-${role}-${state.staff.length + 1}-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "")
    .slice(0, 12)}`;
  return { state: { ...state, staff: [...state.staff, { id, name, role, dea }] }, id };
}

function setMission(state: GameState, iso: string): GameState {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return state;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return state;
  if (iso === state.missionIso) return state;
  return { ...state, missionIso: iso, missionLabel: labelForIso(iso) };
}

function rollDay(state: GameState): GameState {
  const missionIso = addIsoDays(state.missionIso, 1);
  const missionLabel = labelForIso(missionIso);
  return withToast(
    {
      ...state,
      missionIso,
      missionLabel,
      blocks: state.blocks.filter((block) => block.kind !== "repas"),
      transports: state.transports
        .filter((transport) => !transport.cancelled)
        .map((transport) => ({ ...transport, crewId: undefined, departMin: undefined, pinned: false })),
    },
    `Courses reprises pour le ${missionLabel}, sans affectation.`,
    "ok",
  );
}

function importSeries(state: GameState): GameState {
  const dossiers = new Set(state.transports.map((transport) => transport.dossier));
  const ids = new Set(state.transports.map((transport) => transport.id));
  const added = state.tomorrowTransports
    .filter((transport) => !transport.cancelled && !ids.has(transport.id) && !dossiers.has(transport.dossier))
    .map((transport) => ({ ...transport, crewId: undefined, departMin: undefined, cancelled: false }));
  if (!added.length) return withToast(state, "Aucune série nouvelle à ajouter.", "info");
  return withToast(
    { ...state, transports: [...state.transports, ...added] },
    `${added.length} course${added.length > 1 ? "s" : ""} de série ajoutée${added.length > 1 ? "s" : ""} au planning.`,
    "ok",
  );
}

function hydrate(state: GameState, snapshot: GameState, label: string): GameState {
  const backToBriefing = snapshot.phase === "briefing";
  return {
    ...snapshot,
    phase: backToBriefing ? "briefing" : state.phase,
    view: backToBriefing ? snapshot.view : state.view,
    modal: backToBriefing ? null : state.modal,
    nowMin: state.live ? state.nowMin : snapshot.nowMin,
    paused: state.paused,
    speed: state.speed,
    regulationMs: state.regulationMs,
    followNow: state.followNow,
    live: state.live,
    selectedId: backToBriefing ? undefined : state.selectedId,
    toastSeq: state.toastSeq + 1,
    toast: { id: state.toastSeq + 1, message: label, tone: "info" },
  };
}

function toggleTomorrow(state: GameState, id: string): GameState {
  const item = state.tomorrowItems.find((entry) => entry.id === id);
  if (!item) return state;
  const include = !item.include;
  return {
    ...state,
    tomorrowStops: null,
    tomorrowItems: state.tomorrowItems.map((entry) => (entry.id === id ? { ...entry, include } : entry)),
    tomorrowTransports: state.tomorrowTransports.map((transport) =>
      transport.id === item.transportId ? { ...transport, cancelled: !include } : transport,
    ),
  };
}
