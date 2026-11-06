import { resumePaused } from "../lib/browserStore";
import { latestRelevantDraft } from "./persist";
import { reducer } from "./reducer";
import type { GameState } from "./types";
import { depotFromProfile, loadWorkspace } from "./workspace";

/** Dernier brouillon du mode en cours. Sans brouillon, l'écran de choix ou l'assistant B1 reste en place. */
export function resumeOnLoad(state: GameState): GameState {
  if (state.phase !== "briefing") return state;
  if (resumePaused()) return state;
  const profile = loadWorkspace();
  if (!profile) return state;
  const draft = latestRelevantDraft();
  if (draft) return reducer(state, { type: "RESTORE", snapshot: draft, quiet: true });
  if (profile.mode !== "entreprise") return state;
  const depot = depotFromProfile(profile);
  if (!depot) return state;
  return reducer(state, {
    type: "START_COMPANY",
    depot,
    amplitudeMin: profile.amplitudeMin,
    view: "reglages",
  });
}
