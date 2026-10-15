import { generateDay } from "./generate";
import {
  bestSlotFor,
  findPauseStart,
  indexLocations,
  previewPlacement,
  scheduleFleet,
  startedIds,
  suggestCompact,
} from "./schedule";
import type {
  Call,
  Density,
  GameState,
  ModalId,
  PlanStop,
  Speed,
  TimeBlock,
  Toast,
  Transport,
  ViewId,
} from "./types";
import { DAY_END, DAY_START } from "./types";

export type Choice = "accept" | "refuse" | "expire";

export type Action =
  | { type: "START"; amb: number; vsl: number; density: Density; seed: number }
  | { type: "TICK"; dt: number }
  | { type: "PAUSE" }
  | { type: "SET_SPEED"; speed: Speed }
  | { type: "SET_VIEW"; view: ViewId }
  | { type: "OPEN_MODAL"; modal: ModalId }
  | { type: "CLOSE_MODAL" }
  | { type: "SELECT"; id?: string }
  | { type: "SET_CREW_FILTER"; crewId?: string }
  | { type: "TOGGLE_FOLLOW" }
  | { type: "ASSIGN"; transportId: string; crewId: string; departMin: number }
  | { type: "UNASSIGN"; transportId: string }
  | { type: "BEST_SLOT"; transportId: string }
  | { type: "COMPACT" }
  | { type: "APPLY_STOPS"; stops: PlanStop[] }
  | { type: "NOTE_OPTIMIZER" }
  | { type: "RESOLVE_CALL"; callId: string; choice: Choice }
  | { type: "SEND_LOMACO" }
  | { type: "CLOSE_DAY" }
  | { type: "REVIEW"; view?: ViewId }
  | { type: "SHOW_REPORT" }
  | { type: "TOGGLE_TOMORROW"; id: string }
  | { type: "SET_TOMORROW_STOPS"; stops: PlanStop[] }
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
};

export function msPerGameMinute(speed: Speed): number {
  return 750 / speed;
}

export function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "START": {
      const world = generateDay(action);
      return {
        ...initialState,
        ...world,
        phase: "playing",
        view: "gantt",
        modal: null,
        ambCount: action.amb,
        vslCount: action.vsl,
        nowMin: DAY_START,
        paused: false,
        speed: 1,
        regulationMs: 0,
        tomorrowStops: null,
        toastSeq: 1,
        followNow: false,
        toast: {
          id: 1,
          tone: "info",
          message: "Prise de poste. L'après-midi est encore au standard : à vous de placer les courses.",
        },
      };
    }
    case "TICK": {
      if (state.phase !== "playing") return state;
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
      return assign(state, action.transportId, action.crewId, action.departMin);
    case "UNASSIGN":
      return unassign(state, action.transportId);
    case "BEST_SLOT":
      return bestSlot(state, action.transportId);
    case "COMPACT":
      return compact(state);
    case "APPLY_STOPS":
      return applyStops(state, action.stops);
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
    case "SET_TOMORROW_STOPS":
      return { ...state, tomorrowStops: action.stops, toast: toast(state, "Brouillon de demain calculé.", "ok") };
    case "TOAST":
      return { ...state, toast: toast(state, action.message, action.tone) };
    case "DISMISS_TOAST":
      return { ...state, toast: null };
    case "REPLAY":
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

function assign(state: GameState, transportId: string, crewId: string, departMin: number): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  const crew = state.crews.find((item) => item.id === crewId);
  if (!transport || !crew) return state;
  const locMap = indexLocations(state.locations);
  const preview = previewPlacement(
    crew,
    transport,
    departMin,
    state.transports,
    state.blocks,
    locMap,
    state.nowMin,
  );
  if (!preview.ok) return withToast(state, preview.message, "warn");
  return {
    ...state,
    transports: state.transports.map((item) =>
      item.id === transport.id ? { ...item, crewId: crew.id, departMin: preview.departMin } : item,
    ),
    stats: { ...state.stats, moves: state.stats.moves + 1 },
    selectedId: transport.id,
    toastSeq: preview.warning ? state.toastSeq + 1 : state.toastSeq,
    toast: preview.warning ? { id: state.toastSeq + 1, message: preview.warning, tone: "warn" } : state.toast,
  };
}

function unassign(state: GameState, transportId: string): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  if (!transport?.crewId) return state;
  const locMap = indexLocations(state.locations);
  const schedules = scheduleFleet(state.crews, state.transports, state.blocks, locMap);
  if (startedIds(schedules, state.nowMin).has(transport.id)) {
    return withToast(state, "Course déjà engagée : impossible de la retirer.", "warn");
  }
  return {
    ...state,
    transports: state.transports.map((item) =>
      item.id === transport.id ? { ...item, crewId: undefined, departMin: undefined } : item,
    ),
    stats: { ...state.stats, moves: state.stats.moves + 1 },
    selectedId: transport.id,
  };
}

function bestSlot(state: GameState, transportId: string): GameState {
  const transport = state.transports.find((item) => item.id === transportId);
  if (!transport) return state;
  const locMap = indexLocations(state.locations);
  const slot = bestSlotFor(transport, state.crews, state.transports, state.blocks, locMap, state.nowMin);
  if (!slot) return withToast(state, "Conflit horaire : aucun équipage compatible n'a de créneau.", "warn");
  return assign(state, transport.id, slot.crewId, slot.departMin);
}

function compact(state: GameState): GameState {
  const locMap = indexLocations(state.locations);
  const updates = suggestCompact(state.crews, state.transports, state.blocks, locMap, state.nowMin);
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
    saved > 1
      ? `Recalcul terminé — ${Math.round(saved)} min d'attente resserrées.`
      : "Feuilles de route recalculées.",
    "ok",
  );
}

function applyStops(state: GameState, stops: PlanStop[]): GameState {
  const locMap = indexLocations(state.locations);
  const frozen = startedIds(
    scheduleFleet(state.crews, state.transports, state.blocks, locMap),
    state.nowMin,
  );
  const stopMap = new Map(stops.map((stop) => [stop.transportId, stop]));
  const transports = state.transports.map((transport) => {
    if (transport.cancelled || frozen.has(transport.id)) return transport;
    const stop = stopMap.get(transport.id);
    if (!stop) {
      return transport.crewId ? { ...transport, crewId: undefined, departMin: undefined } : transport;
    }
    return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
  });
  return withToast(
    {
      ...state,
      transports,
      modal: null,
      stats: { ...state.stats, optimizerApplied: true, optimizerUsed: true },
    },
    "Plan optimisé appliqué aux courses qui n'ont pas encore démarré.",
    "ok",
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
    call.draft.patient && !known.has(call.draft.patient.id)
      ? [...state.patients, call.draft.patient]
      : state.patients;
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
  const schedules = scheduleFleet(state.crews, state.transports, state.blocks, locMap);
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
        item.id === transport.id
          ? { ...item, cancelled: true, crewId: undefined, departMin: undefined }
          : item,
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
  return withToast(
    {
      ...state,
      crews: state.crews.map((item) =>
        item.id === call.crewId ? { ...item, delayUntil: state.nowMin + 50 } : item,
      ),
      transports: state.transports.map((item) => {
        if (item.crewId !== call.crewId || item.departMin == null || item.cancelled) return item;
        if (item.departMin <= state.nowMin) return item;
        return { ...item, departMin: item.departMin + delta };
      }),
    },
    expired
      ? `${crew?.code ?? "L'équipage"} encaisse ${delta} min de retard, appel non pris.`
      : `${crew?.code ?? "L'équipage"} : courses suivantes décalées de ${delta} min.`,
    "warn",
  );
}

function breakCrew(
  state: GameState,
  call: Call,
  kind: "pause" | "panne",
  expired: boolean,
): GameState {
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
    label: kind === "panne" ? "Panne" : "Pause repas",
  };
  const blocks = [...state.blocks, block];
  let released = 0;
  const transports = state.transports.map((transport) => {
    if (kind !== "panne" || transport.crewId !== crew.id || transport.departMin == null || transport.cancelled) {
      return transport;
    }
    const overlaps = transport.departMin < block.endMin && transport.departMin + 35 > block.startMin;
    const started = transport.departMin <= state.nowMin;
    if (!overlaps || started) return transport;
    released += 1;
    return { ...transport, crewId: undefined, departMin: undefined };
  });
  const label = kind === "panne" ? "Panne enregistrée" : "Pause posée";
  const extra = released ? ` ${released} course${released > 1 ? "s" : ""} remise${released > 1 ? "s" : ""} au standard.` : "";
  return withToast(
    {
      ...state,
      blocks,
      transports,
      crews: state.crews.map((item) =>
        item.id === crew.id ? { ...item, delayUntil: kind === "panne" ? block.endMin : item.delayUntil } : item,
      ),
    },
    expired ? `${label} automatiquement sur ${crew.code}.${extra}` : `${label} sur ${crew.code}.${extra}`,
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
      lomaco: [...state.lomaco, ...lines, {
        id: `lomaco-ok-${state.toastSeq}`,
        atMin: state.nowMin,
        message: "Accusé Lomaco : synchronisation terminée (démo).",
        ok: true,
      }],
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
