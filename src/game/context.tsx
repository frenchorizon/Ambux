import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { indexById } from "../lib/collections";
import { useRoutingVersion, warmLegs, warmMatrix } from "../lib/routing";
import type { Metrics } from "./scoring";
import { metricsFromSchedules } from "./scoring";
import { indexLocations, scheduleFleet, type CrewSchedule } from "./schedule";
import { latestEnterpriseDraft, saveDraft } from "./persist";
import { depotFromProfile, loadWorkspace } from "./workspace";
import { saveRules } from "../lib/rulesStore";
import { reviewIssues, type Issue } from "./review";
import { isTracked, recordHistory } from "./history";
import { initialState, reducer, type Action } from "./reducer";
import type {
  Call,
  Crew,
  Density,
  GameState,
  Location,
  LomacoLog,
  ModalId,
  Patient,
  Phase,
  PlanStop,
  Speed,
  Rules,
  StaffMember,
  Stats,
  TimeBlock,
  Toast,
  TomorrowItem,
  Transport,
  Vehicle,
  ViewId,
} from "./types";

interface ClockValue {
  nowMin: number;
  paused: boolean;
  speed: Speed;
  regulationMs: number;
}

export interface DataValue {
  phase: Phase;
  view: ViewId;
  modal: ModalId | null;
  seed: number;
  density: Density;
  ambCount: number;
  vslCount: number;
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
  selectedId?: string;
  crewFilter?: string;
  followNow: boolean;
  live: boolean;
  rules: Rules;
  vehicles: Vehicle[];
  staff: StaffMember[];
  missionIso: string;
  missionLabel: string;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  dispatch: Dispatch<Action>;
  metrics: Metrics;
  schedules: Map<string, CrewSchedule>;
  locMap: Map<string, Location>;
  patientById: Map<string, Patient>;
  transportById: Map<string, Transport>;
  issues: Issue[];
}

function bootWorkspace(state: GameState): GameState {
  if (state.phase !== "briefing") return state;
  const profile = loadWorkspace();
  if (!profile || profile.mode !== "entreprise") return state;
  const draft = latestEnterpriseDraft();
  if (draft) return reducer(state, { type: "RESTORE", snapshot: draft });
  const depot = depotFromProfile(profile);
  if (!depot) return state;
  return reducer(state, {
    type: "START_COMPANY",
    depot,
    amplitudeMin: profile.amplitudeMin,
    view: "reglages",
  });
}

const ClockContext = createContext<ClockValue | null>(null);
const DataContext = createContext<DataValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(reducer, initialState, bootWorkspace);
  const stateRef = useRef(state);
  const pastRef = useRef<GameState[]>([]);
  const futureRef = useRef<GameState[]>([]);
  const [historyTick, setHistoryTick] = useState(0);

  const dispatch = useCallback((action: Action) => {
    const current = stateRef.current;
    const burst = action.type === "ASSIGN" && action.coalesce === true;
    if (isTracked(action.type) && !burst) {
      const recorded = recordHistory(pastRef.current, futureRef.current, current, action.type);
      pastRef.current = recorded.past;
      futureRef.current = recorded.future;
      setHistoryTick((tick) => tick + 1);
    }
    stateRef.current = reducer(current, action);
    rawDispatch(action);
  }, []);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(stateRef.current);
    stateRef.current = reducer(stateRef.current, { type: "HYDRATE", state: prev, label: "Modification annulée." });
    rawDispatch({ type: "HYDRATE", state: prev, label: "Modification annulée." });
    setHistoryTick((tick) => tick + 1);
  }, []);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(stateRef.current);
    stateRef.current = reducer(stateRef.current, { type: "HYDRATE", state: next, label: "Modification rétablie." });
    rawDispatch({ type: "HYDRATE", state: next, label: "Modification rétablie." });
    setHistoryTick((tick) => tick + 1);
  }, []);

  const routeVersion = useRoutingVersion();

  useEffect(() => {
    if (!state.locations.length || state.phase === "briefing") return;
    let cancel = false;
    void warmMatrix(state.locations).then((ok) => {
      if (cancel || !ok) return;
      dispatch({
        type: "TOAST",
        tone: "ok",
        message: "Durées calculées sur le réseau routier (OSRM).",
      });
    });
    return () => {
      cancel = true;
    };
  }, [state.seed, state.phase]);

  useEffect(() => {
    if (state.phase === "briefing") return;
    saveDraft(state);
    saveRules(state.rules);
  }, [state]);

  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1500, now - last);
      last = now;
      dispatch({ type: "TICK", dt });
    }, 200);
    return () => window.clearInterval(id);
  }, [dispatch]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return;
      event.preventDefault();
      if (key === "y" || event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, undo]);

  const clock = useMemo<ClockValue>(
    () => ({
      nowMin: state.nowMin,
      paused: state.paused,
      speed: state.speed,
      regulationMs: state.regulationMs,
    }),
    [state.nowMin, state.paused, state.speed, state.regulationMs],
  );

  const locMap = useMemo(() => indexLocations(state.locations), [state.locations]);
  const schedules = useMemo(() => {
    void routeVersion;
    return scheduleFleet(state.crews, state.transports, state.blocks, locMap, "anchored", state.rules);
  }, [state.crews, state.transports, state.blocks, locMap, routeVersion, state.rules]);

  useEffect(() => {
    const pairs: { fromId: string; toId: string; from: Location; to: Location }[] = [];
    for (const transport of state.transports) {
      if (transport.cancelled || !transport.crewId) continue;
      const leg = schedules.get(transport.crewId)?.legs.find((item) => item.transportId === transport.id);
      if (!leg) continue;
      const from = locMap.get(leg.fromId);
      const pickup = locMap.get(transport.pickupId);
      const drop = locMap.get(transport.dropoffId);
      if (from && pickup) pairs.push({ fromId: leg.fromId, toId: transport.pickupId, from, to: pickup });
      if (pickup && drop) pairs.push({ fromId: transport.pickupId, toId: transport.dropoffId, from: pickup, to: drop });
    }
    for (const crew of state.crews) {
      const last = schedules.get(crew.id)?.legs.at(-1);
      const drop = last ? locMap.get(last.dropoffId) : undefined;
      const base = locMap.get(crew.baseId);
      if (last && drop && base) pairs.push({ fromId: last.dropoffId, toId: crew.baseId, from: drop, to: base });
    }
    warmLegs(pairs);
  }, [schedules, state.transports, state.crews, locMap]);
  const metrics = useMemo(
    () => metricsFromSchedules(state.crews, schedules, state.transports, state.blocks),
    [state.crews, schedules, state.transports, state.blocks],
  );
  const patientById = useMemo(() => indexById(state.patients), [state.patients]);
  const transportById = useMemo(() => indexById(state.transports), [state.transports]);
  const issues = useMemo(
    () =>
      reviewIssues({
        crews: state.crews,
        transports: state.transports,
        blocks: state.blocks,
        rules: state.rules,
        schedules,
        patients: patientById,
      }),
    [state.crews, state.transports, state.blocks, state.rules, schedules, patientById],
  );

  const data = useMemo<DataValue>(
    () => ({
      phase: state.phase,
      view: state.view,
      modal: state.modal,
      seed: state.seed,
      density: state.density,
      ambCount: state.ambCount,
      vslCount: state.vslCount,
      locations: state.locations,
      patients: state.patients,
      crews: state.crews,
      transports: state.transports,
      blocks: state.blocks,
      calls: state.calls,
      lomaco: state.lomaco,
      tomorrowItems: state.tomorrowItems,
      tomorrowTransports: state.tomorrowTransports,
      tomorrowStops: state.tomorrowStops,
      stats: state.stats,
      toast: state.toast,
      selectedId: state.selectedId,
      crewFilter: state.crewFilter,
      followNow: state.followNow,
      live: state.live,
      rules: state.rules,
      vehicles: state.vehicles,
      staff: state.staff,
      missionIso: state.missionIso,
      missionLabel: state.missionLabel,
      canUndo: pastRef.current.length > 0,
      canRedo: futureRef.current.length > 0,
      undo,
      redo,
      dispatch,
      metrics,
      schedules,
      locMap,
      patientById,
      transportById,
      issues,
    }),
    [
      state.phase,
      state.view,
      state.modal,
      state.seed,
      state.density,
      state.ambCount,
      state.vslCount,
      state.locations,
      state.patients,
      state.crews,
      state.transports,
      state.blocks,
      state.calls,
      state.lomaco,
      state.tomorrowItems,
      state.tomorrowTransports,
      state.tomorrowStops,
      state.stats,
      state.toast,
      state.selectedId,
      state.crewFilter,
      state.followNow,
      state.live,
      state.rules,
      state.vehicles,
      state.staff,
      state.missionIso,
      state.missionLabel,
      historyTick,
      undo,
      redo,
      dispatch,
      metrics,
      schedules,
      locMap,
      patientById,
      transportById,
      issues,
    ],
  );

  return (
    <ClockContext.Provider value={clock}>
      <DataContext.Provider value={data}>{children}</DataContext.Provider>
    </ClockContext.Provider>
  );
}

export function useClock(): ClockValue {
  const value = useContext(ClockContext);
  if (!value) throw new Error("Horloge indisponible");
  return value;
}

export function useData(): DataValue {
  const value = useContext(DataContext);
  if (!value) throw new Error("Partie indisponible");
  return value;
}

export type { GameState };
