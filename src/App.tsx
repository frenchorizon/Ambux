import { Briefing } from "./components/Briefing";
import { CallDock } from "./components/CallDock";
import { GameDialogs } from "./components/GameDialogs";
import { KpiBar } from "./components/KpiBar";
import { PlanningWorkspace } from "./components/planning/PlanningWorkspace";
import { Report } from "./components/Report";
import {
  CompaniesView,
  CrewsView,
  LomacoView,
  PatientsView,
  TomorrowView,
  VehiclesView,
} from "./components/SecondaryViews";
import { Sidebar } from "./components/Sidebar";
import { Toaster } from "./components/Toaster";
import { TopBar } from "./components/TopBar";
import { Button } from "./components/ui/button";
import { useData } from "./game/context";
import { matrixSource, useRoutingVersion } from "./lib/routing";

export function App() {
  const { phase } = useData();
  if (phase === "briefing") return <Briefing />;
  if (phase === "report") return <Report />;
  return <Dashboard />;
}

function RoutingBanner() {
  useRoutingVersion();
  const source = matrixSource();
  if (source !== "estimate") return null;
  return (
    <div className="bg-rose-700 px-3 py-1.5 text-sm font-semibold text-white">
      Routage dégradé : durées et kilomètres estimés, non opposables. Les courses concernées portent la mention « km estimé ».
    </div>
  );
}

function LiveCalls() {
  const { live } = useData();
  if (!live) return null;
  return <CallDock />;
}

function Dashboard() {
  const { phase, view, dispatch } = useData();
  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {phase === "review" && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-navy px-3 py-2 text-sm text-white">
            <span>Journée clôturée. Les feuilles restent consultables, le planning de demain aussi.</span>
            <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "SHOW_REPORT" })}>
              Revoir le bilan
            </Button>
          </div>
        )}
        <TopBar />
        <RoutingBanner />
        <KpiBar />
        <main className="min-h-0 flex-1">
          {view === "gantt" && <PlanningWorkspace />}
          {view === "tomorrow" && <TomorrowView />}
          {view === "crews" && <CrewsView />}
          {view === "vehicles" && <VehiclesView />}
          {view === "patients" && <PatientsView />}
          {view === "companies" && <CompaniesView />}
          {view === "lomaco" && <LomacoView />}
        </main>
      </div>
      {phase === "playing" && <LiveCalls />}
      <Toaster />
      <GameDialogs />
    </div>
  );
}
