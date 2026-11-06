import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { CompanyWizard, ModeBanner, ModeChoice } from "./components/ModeGate";
import { EnterpriseNotice, LegalDocument, useLegalPage } from "./components/legal/Legal";
import { useData } from "./game/context";
import { DEMO_PROFILE, depotFromProfile, loadWorkspace, saveWorkspace, subscribeWorkspace } from "./game/workspace";
import type { ModalId, ViewId } from "./game/types";
import { matrixSource, useRoutingVersion } from "./lib/routing";

export function App() {
  const legal = useLegalPage();
  return (
    <>
      {legal ? <LegalDocument id={legal} /> : <AppScreen />}
      <Toaster />
    </>
  );
}

function AppScreen() {
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  const [picking, setPicking] = useState<null | "choice" | "wizard">(null);
  const { phase, dispatch } = useData();
  const onChange = () => setPicking("choice");

  if (picking === "wizard") {
    return (
      <>
        <ModeBanner onChange={onChange} />
        <CompanyWizard
          initial={profile?.mode === "entreprise" ? profile : null}
          onBack={() => setPicking("choice")}
          onEnter={(next, view, modal) => enterCompany(next, view, modal, dispatch, () => setPicking(null))}
        />
      </>
    );
  }

  if (picking === "choice" || !profile) {
    return (
      <>
        <ModeBanner onChange={onChange} />
        <EnterpriseNotice />
        <ModeChoice
          canCancel={Boolean(profile)}
          onCancel={() => setPicking(null)}
          onDemo={() => {
            const was = loadWorkspace()?.mode;
            saveWorkspace(DEMO_PROFILE);
            if (was !== "demo") dispatch({ type: "REPLAY" });
            setPicking(null);
          }}
          onCompany={() => setPicking("wizard")}
        />
      </>
    );
  }

  if (profile.mode === "entreprise" && phase === "briefing") {
    return (
      <>
        <ModeBanner onChange={onChange} />
        <EnterpriseNotice />
        <p className="px-4 py-6 text-sm text-muted">Ouverture de {profile.companyName}…</p>
      </>
    );
  }

  if (phase === "briefing") {
    return (
      <div className="min-h-dvh">
        <ModeBanner onChange={onChange} />
        <Landing />
      </div>
    );
  }
  if (phase === "report") {
    return (
      <div className="min-h-dvh bg-paper">
        <ModeBanner onChange={onChange} />
        <EnterpriseNotice />
        <Report />
      </div>
    );
  }
  return <Dashboard onChangeMode={onChange} />;
}

function enterCompany(
  profile: Parameters<typeof saveWorkspace>[0],
  view: ViewId,
  modal: ModalId | undefined,
  dispatch: ReturnType<typeof useData>["dispatch"],
  done: () => void,
): void {
  saveWorkspace(profile);
  const depot = depotFromProfile(profile);
  if (!depot) return;
  dispatch({ type: "START_COMPANY", depot, amplitudeMin: profile.amplitudeMin, view });
  if (modal) dispatch({ type: "OPEN_MODAL", modal });
  done();
}

function DataScreen({ children }: { children: ReactNode }) {
  const { dispatch } = useData();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-line bg-card px-3">
        <button
          type="button"
          className="inline-flex h-11 items-center text-sm font-semibold text-brand"
          onClick={() => dispatch({ type: "SET_VIEW", view: "reglages" })}
        >
          Retour aux réglages
        </button>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function RoutingBanner() {
  useRoutingVersion();
  const source = matrixSource();
  if (source !== "estimate") return null;
  return (
    <div className="routing-banner glass">
      Routage dégradé : durées et kilomètres estimés, non opposables. Les courses concernées portent la mention « km
      estimé ».
    </div>
  );
}

function LiveCalls() {
  const { live } = useData();
  if (!live) return null;
  return <CallDock />;
}

function Dashboard({ onChangeMode }: { onChangeMode: () => void }) {
  const { phase, view, dispatch } = useData();
  const [entry] = useState(claimEntry);
  const [cinema, setCinema] = useState(entry.cinema);
  const [tour, setTour] = useState(() => entry.tour && !entry.cinema && !tourSeen());

  useEffect(() => {
    if (!tour || cinema) return;
    dispatch({ type: "SET_VIEW", view: "gantt" });
  }, [cinema, dispatch, tour]);

  return (
    <div className="app-frame text-ink">
      <Sidebar />
      <div className="app-column">
        {phase === "review" && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-navy px-3 py-2 text-sm text-white">
            <span>Journée clôturée. Les feuilles restent consultables, le planning de demain aussi.</span>
            <Button size="sm" variant="secondary" onClick={() => dispatch({ type: "SHOW_REPORT" })}>
              Revoir le bilan
            </Button>
          </div>
        )}
        <EnterpriseNotice />
        <TopBar onChangeMode={onChangeMode} />
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
          {view === "tomorrow" && (
            <DataScreen>
              <TomorrowView />
            </DataScreen>
          )}
          {view === "crews" && (
            <DataScreen>
              <CrewsView />
            </DataScreen>
          )}
          {view === "vehicles" && (
            <DataScreen>
              <VehiclesView />
            </DataScreen>
          )}
          {view === "patients" && (
            <DataScreen>
              <PatientsView />
            </DataScreen>
          )}
          {view === "companies" && <CompaniesView />}
          {view === "lomaco" && <LomacoView />}
          {view === "feuille" && <CrewSheet />}
        </main>
        <BottomNav />
      </div>
      {phase === "playing" && <LiveCalls />}
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
  let cinema: boolean;
  let tour: boolean;
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
