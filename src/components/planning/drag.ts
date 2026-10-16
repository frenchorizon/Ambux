import type { PlacementPreview } from "../../game/schedule";

export interface DragState {
  transportId: string;
  pointerId: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
  moved: boolean;
  hoverCrewId?: string;
  hoverMinute?: number;
  overUnassigned: boolean;
  preview?: PlacementPreview;
}
