import { useSyncExternalStore } from "react";
import { useData } from "../game/context";
import { loadWorkspace, subscribeWorkspace } from "../game/workspace";
import { bannerFromContext, type PlanningBanner } from "../io/exporters/planning";

export function usePlanningBanner(): PlanningBanner {
  const data = useData();
  const profile = useSyncExternalStore(subscribeWorkspace, loadWorkspace, () => null);
  return bannerFromContext({
    mode: profile?.mode ?? "demo",
    companyName: profile?.companyName,
    city: profile?.city,
    depotLabel: profile?.mode === "entreprise" ? profile.depot?.label : undefined,
    places: data.locations,
    missionIso: data.missionIso,
  });
}
