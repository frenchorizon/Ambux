import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import { indexById } from "../lib/collections";
import { useRoutingVersion, warmMatrix } from "../lib/routing";
import type { Metrics } from "./scoring";
import { metricsFromSchedules } from "./scoring";
import { indexLocations, scheduleFleet, type CrewSchedule } from "./schedule";
import { saveDraft } from "./persist";
import { saveRules } from "../lib/rulesStore";
import { reviewIssues, type Issue } from "./review";
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
  dispatch: Dispatch<Action>;
  metrics: Metrics;
  schedules: Map<string, CrewSchedule>;
  locMap: Map<string, Location>;
  patientById: Map<string, Patient>;
  transportById: Map<string, Transport>;
  issues: Issue[];
}

const ClockContext = createContext<ClockValue | null>(null);
const DataContext = createContext<DataValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const routeVersion = useRoutingVersion();

  useEffect(() => {
    if (!state.locations.length || state.phase === "briefing") return;
    let cancel = false;
    void warmMatrix(state.locations).then((ok) => {
      if (cancel) return;
      dispatch({
        type: "TOAST",
        tone: ok ? "ok" : "warn",
        message: ok
          ? "Distances et durées calculées sur le réseau routier (OSRM)."
          : "OSRM indisponible : durées estimées, tracés de secours.",
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
  }, []);

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
    return scheduleFleet(state.crews, state.transports, state.blocks, locMap);
  }, [state.crews, state.transports, state.blocks, locMap, routeVersion]);
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
