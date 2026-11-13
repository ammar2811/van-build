import { getPartDefinition } from "@vanbuild/catalog";
import {
  DEFAULT_SNAP_PX,
  type DesignDoc,
  gridForScale,
  type Obstacle,
  obstaclesFor,
  type PartInstance,
  partExtents,
  quantizeMm,
  ridersOf,
  type Sticky,
  solveDrag,
  solveStackedDrag,
  supportSurfaces,
  TOUCH_SNAP_PX,
  type UnitSystem,
  type VanShell,
  type Vec3,
} from "@vanbuild/core";
import { movePart } from "../../state/actions";
import { useUiStore } from "../../state/uiStore";

/**
 * One part being dragged. The plan view and the 3D view both drive a drag through this
 * module, so a part snaps, collides and stacks identically whichever view it is dragged in.
 * The views only differ in how they turn a pointer into a point on the floor.
 */
export interface PartDrag {
  id: string;
  /** Offset from the pointer to the part's centre, in mm. */
  grab: { x: number; y: number };
  size: Vec3;
  z: number;
  obstacles: Obstacle[];
  /** Set for parts that drop onto whatever is under them. */
  stacking: { supports: Obstacle[]; baseZ: number } | null;
  /** Parts travelling with this one, as offsets from its position. */
  riders: { id: string; offset: Vec3 }[];
  sticky: Sticky;
  lastGood: { x: number; y: number };
}

export function beginPartDrag(
  doc: DesignDoc,
  shell: VanShell,
  part: PartInstance,
  point: { x: number; y: number },
): PartDrag {
  const def = getPartDefinition(part.defId);
  const riderIds = ridersOf(doc, getPartDefinition, part.id);
  const moving = [part.id, ...riderIds];
  return {
    id: part.id,
    grab: { x: point.x - part.position.x, y: point.y - part.position.y },
    size: partExtents(part),
    z: part.position.z,
    obstacles: obstaclesFor(doc, shell, getPartDefinition, part, riderIds),
    stacking: def?.stacks
      ? {
          supports: supportSurfaces(doc, shell, getPartDefinition, moving),
          baseZ: def.defaultElevation ?? 0,
        }
      : null,
    riders: riderIds.flatMap((riderId) => {
      const rider = doc.parts[riderId];
      if (!rider) return [];
      return [
        {
          id: riderId,
          offset: {
            x: rider.position.x - part.position.x,
            y: rider.position.y - part.position.y,
            z: rider.position.z - part.position.z,
          },
        },
      ];
    }),
    sticky: {},
    lastGood: { x: part.position.x, y: part.position.y },
  };
}

export interface DragPointer {
  /** Screen pixels per millimetre where the part is, for snap reach and grid step. */
  pxPerMm: number;
  touch: boolean;
  units: UnitSystem;
  /** Alt held: place freely. */
  noSnap: boolean;
}

/** Move the drag to where the pointer is now. Updates the live drag state, not the document. */
export function movePartDrag(
  drag: PartDrag,
  shell: VanShell,
  point: { x: number; y: number },
  pointer: DragPointer,
): void {
  const input = {
    shell,
    obstacles: drag.obstacles,
    size: drag.size,
    proposed: { x: point.x - drag.grab.x, y: point.y - drag.grab.y },
    mmPerPx: 1 / pointer.pxPerMm,
    snapPx: pointer.touch ? TOUCH_SNAP_PX : DEFAULT_SNAP_PX,
    gridMm: gridForScale(pointer.units, pointer.pxPerMm),
    sticky: drag.sticky,
    fallback: drag.lastGood,
    noSnap: pointer.noSnap,
  };
  const result = drag.stacking
    ? solveStackedDrag({ ...input, ...drag.stacking })
    : solveDrag({ ...input, z: drag.z });
  drag.sticky = result.sticky;
  if (result.collisions.length === 0 && !result.outOfBounds) {
    drag.lastGood = { x: result.position.x, y: result.position.y };
  }
  const position = {
    x: quantizeMm(result.position.x),
    y: quantizeMm(result.position.y),
    z: quantizeMm(result.position.z),
  };
  useUiStore.getState().setDrag({
    id: drag.id,
    position,
    guides: result.guides,
    followers: Object.fromEntries(
      drag.riders.map((rider) => [
        rider.id,
        {
          x: quantizeMm(position.x + rider.offset.x),
          y: quantizeMm(position.y + rider.offset.y),
          z: quantizeMm(position.z + rider.offset.z),
        },
      ]),
    ),
  });
}

/** End the drag: commit the live position as one undo step, or drop it. */
export function endPartDrag(drag: PartDrag, commit: boolean): void {
  const ui = useUiStore.getState();
  const live = ui.drag;
  ui.setDrag(null);
  if (commit && live?.id === drag.id) movePart(drag.id, live.position);
}
