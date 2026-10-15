import type { PlacementPreview } from "../../game/schedule";

export interface DragState {
  transportId: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  moved: boolean;
  hoverCrewId?: string;
  hoverMinute?: number;
  overUnassigned: boolean;
  preview?: PlacementPreview;
}
