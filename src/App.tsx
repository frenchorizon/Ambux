import { useEffect, useState } from "react";
import { CallDock } from "./components/CallDock";
import { GameDialogs } from "./components/GameDialogs";
import { PlanningWorkspace } from "./components/planning/PlanningWorkspace";
import { MapPanel } from "./components/planning/MapPanel";
import { UnassignedPanel } from "./components/planning/UnassignedPanel";
import { Report } from "./components/Report";
import {
  CompaniesView,
  CrewsView,
  LomacoView,
  PatientsView,
  TomorrowView,
  VehiclesView,
} from "./components/SecondaryViews";
import { Cinema } from "./components/pitch/Cinema";
import { CrewSheet } from "./components/pitch/CrewSheet";
import { Landing } from "./components/pitch/Landing";
import { Tour } from "./components/pitch/Tour";
import { BottomNav, Sidebar } from "./components/Sidebar";
import { ReglagesView, SyntheseView } from "./components/WorkViews";
import { Toaster } from "./components/Toaster";
import { TopBar } from "./components/TopBar";
import { Button } from "./components/ui/button";
import { useData } from "./game/context";
import { matrixSource, useRoutingVersion } from "./lib/routing";

export function App() {
  const { phase } = useData();
  if (phase === "briefing") return <Landing />;
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
  const [entry] = useState(claimEntry);
  const [cinema, setCinema] = useState(entry.cinema);
  const [tour, setTour] = useState(() => entry.tour && !entry.cinema && !tourSeen());

  useEffect(() => {
    if (!tour || cinema) return;
    dispatch({ type: "SET_VIEW", view: "gantt" });
  }, [cinema, dispatch, tour]);

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
        <main className="min-h-0 flex-1">
          {view === "gantt" && <PlanningWorkspace />}
          {view === "carte" && (
            <div className="h-full">
              <MapPanel />
            </div>
          )}
          {view === "file" && <UnassignedPanel />}
          {view === "synthese" && <SyntheseView />}
          {view === "reglages" && <ReglagesView />}
          {view === "tomorrow" && <TomorrowView />}
          {view === "crews" && <CrewsView />}
          {view === "vehicles" && <VehiclesView />}
          {view === "patients" && <PatientsView />}
          {view === "companies" && <CompaniesView />}
          {view === "lomaco" && <LomacoView />}
          {view === "feuille" && <CrewSheet />}
        </main>
        <BottomNav />
      </div>
      {phase === "playing" && <LiveCalls />}
      <Toaster />
      <GameDialogs />
      {cinema && (
        <Cinema
          onClose={() => {
            setCinema(false);
            dispatch({ type: "SET_VIEW", view: "gantt" });
            if (localStorage.getItem("ambux.tour.v1") !== "1") setTour(true);
          }}
        />
      )}
      {tour && !cinema && <Tour onDone={() => setTour(false)} />}
    </div>
  );
}

let entryLatch: { cinema: boolean; tour: boolean } | null = null;
let entryLatchTimer = 0;

function tourSeen(): boolean {
  try {
    return localStorage.getItem("ambux.tour.v1") === "1";
  } catch {
    return false;
  }
}

function claimEntry(): { cinema: boolean; tour: boolean } {
  if (entryLatch) return entryLatch;
  let cinema = false;
  let tour = false;
  try {
    cinema = sessionStorage.getItem("ambux.cinema") === "1";
    tour = sessionStorage.getItem("ambux.tour") === "1";
    sessionStorage.removeItem("ambux.cinema");
    sessionStorage.removeItem("ambux.tour");
  } catch {
    cinema = false;
    tour = false;
  }
  entryLatch = { cinema, tour };
  window.clearTimeout(entryLatchTimer);
  entryLatchTimer = window.setTimeout(() => {
    entryLatch = null;
  }, 100);
  return entryLatch;
}
