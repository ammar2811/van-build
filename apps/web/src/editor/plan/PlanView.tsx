import { getPartDefinition } from "@vanbuild/catalog";
import {
  clearances,
  DEFAULT_SNAP_PX,
  type DesignDoc,
  formatLength,
  formatSize,
  gridForScale,
  halfWidthAt,
  maxHalfWidth,
  minHalfWidth,
  type Obstacle,
  obstaclesFor,
  outlineAt,
  type PartInstance,
  parseLength,
  partBox,
  partDimensions,
  partExtents,
  partName,
  quantizeMm,
  ridersOf,
  type SnapGuide,
  type Sticky,
  solveDrag,
  solveStackedDrag,
  supportSurfaces,
  TOUCH_SNAP_PX,
  type UnitSystem,
  type VanShell,
  type Vec3,
  type WallDistances,
} from "@vanbuild/core";
import {
  type PointerEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isLocked, movePart, setGap } from "../../state/actions";
import { useDocStore } from "../../state/docStore";
import { useIssues, useShell, useWeight } from "../../state/selectors";
import { useUiStore } from "../../state/uiStore";
import { FitIcon, MinusIcon, PlusIcon } from "../../ui/icons";
import { type PlanTransform, screenRect, usePlanTransform } from "./usePlanTransform";

/** Pointer travel, in pixels, before a press turns into a drag. */
const DRAG_THRESHOLD = 4;
const ZOOM_STEP = 1.5;

type Side = keyof WallDistances;

interface PartGesture {
  kind: "part";
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Offset from the pointer to the part's centre, in mm. */
  grab: { x: number; y: number };
  size: Vec3;
  z: number;
  obstacles: Obstacle[];
  /** Set for parts that drop onto whatever is under them. */
  stacking: { supports: Obstacle[]; baseZ: number } | null;
  /** Parts resting on this one, as offsets from its position. */
  riders: { id: string; offset: Vec3 }[];
  sticky: Sticky;
  lastGood: { x: number; y: number };
  moved: boolean;
  /** Parts under the pointer when the press started, topmost first. */
  stack: string[];
  wasSelected: boolean;
}

interface PanGesture {
  kind: "pan";
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  moved: boolean;
  /** A tap that started on empty floor clears the selection. */
  onPart: boolean;
}

interface PinchGesture {
  kind: "pinch";
  a: number;
  b: number;
  distance: number;
  cx: number;
  cy: number;
}

type Gesture = PartGesture | PanGesture | PinchGesture;

interface GapEdit {
  side: Side;
  x: number;
  y: number;
  value: number;
}

function points(view: PlanTransform, polygon: { x: number; y: number }[]): string {
  return polygon
    .map((p) => {
      const s = view.toScreen(p.x, p.y);
      return `${s.x.toFixed(1)},${s.y.toFixed(1)}`;
    })
    .join(" ");
}

/** Rough text width at the plan's label size. Only used to decide whether a label fits. */
function fits(text: string, available: number, charWidth = 6.6): boolean {
  return text.length * charWidth + 12 <= available;
}

function gapPill(target: EventTarget | null): SVGGElement | null {
  return target instanceof Element ? target.closest<SVGGElement>("[data-gap]") : null;
}

export function PlanView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [gapEdit, setGapEdit] = useState<GapEdit | null>(null);

  const shell = useShell();
  const view = usePlanTransform(containerRef, shell);
  const doc = useDocStore((state) => state.doc);
  const units = useUiStore((state) => state.units);
  const selectedId = useUiStore((state) => state.selectedId);
  const drag = useUiStore((state) => state.drag);
  const issues = useIssues();

  // Lower parts first, so raised parts (beds, overhead cabinets) draw on top.
  const parts = useMemo(() => {
    const live = Object.values(doc.parts).map((part) => {
      if (drag?.id === part.id) return { ...part, position: drag.position };
      const followed = drag?.followers[part.id];
      return followed ? { ...part, position: followed } : part;
    });
    // Lower parts first so raised parts draw on top; at the same height, bigger parts first
    // so a tank inside a cabinet stays visible and clickable.
    const area = (part: PartInstance) => {
      const size = partExtents(part);
      return size.x * size.y;
    };
    return live.sort(
      (a, b) => a.position.z - b.position.z || area(b) - area(a) || a.id.localeCompare(b.id),
    );
  }, [doc.parts, drag]);

  // The live document: what the plan is showing right now, mid-drag included.
  const liveDoc = useMemo<DesignDoc>(
    () => ({ ...doc, parts: Object.fromEntries(parts.map((part) => [part.id, part])) }),
    [doc, parts],
  );

  const selected = parts.find((part) => part.id === selectedId) ?? null;
  const ready = view.width > 0 && view.height > 0;

  // The wheel zooms around the cursor. Registered by hand because it has to be able to
  // stop the page from scrolling, which React's own wheel handler cannot do.
  const { zoomAt } = view;
  useEffect(() => {
    const svg = svgRef.current;
    if (!ready || !svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const lines = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : 1;
      zoomAt(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        Math.exp(-event.deltaY * lines * 0.0025),
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [ready, zoomAt]);

  const local = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };

  const partsAt = (point: { x: number; y: number }): string[] =>
    [...parts]
      .reverse()
      .filter((part) => {
        const box = partBox(part);
        return (
          point.x >= box.min.x &&
          point.x <= box.max.x &&
          point.y >= box.min.y &&
          point.y <= box.max.y
        );
      })
      .map((part) => part.id);

  const cancelPartDrag = () => {
    if (gesture.current?.kind === "part") useUiStore.getState().setDrag(null);
    gesture.current = null;
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    // A gap label is a text field in disguise. The click that follows opens it; nothing
    // should start dragging in the meantime.
    if (event.button === 0 && pointers.current.size === 0 && gapPill(event.target)) return;
    setGapEdit(null);

    const at = local(event);
    const ui = useUiStore.getState();
    pointers.current.set(event.pointerId, at);
    event.currentTarget.setPointerCapture(event.pointerId);

    if (pointers.current.size === 2) {
      // A second finger turns whatever was happening into a pinch.
      cancelPartDrag();
      const [a, b] = [...pointers.current.entries()];
      if (!a || !b) return;
      gesture.current = {
        kind: "pinch",
        a: a[0],
        b: b[0],
        distance: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
        cx: (a[1].x + b[1].x) / 2,
        cy: (a[1].y + b[1].y) / 2,
      };
      return;
    }
    if (pointers.current.size > 2 || gesture.current) return;

    const pan = (onPart: boolean): PanGesture => ({
      kind: "pan",
      pointerId: event.pointerId,
      startX: at.x,
      startY: at.y,
      lastX: at.x,
      lastY: at.y,
      moved: false,
      onPart,
    });

    const point = view.toModel(at.x, at.y);
    const stack = event.button === 0 ? partsAt(point) : [];
    if (stack.length === 0) {
      gesture.current = pan(false);
      return;
    }
    // A selected part keeps the drag even when something is stacked above it, so a tank
    // under a bed can still be moved once it has been selected.
    const wasSelected = ui.selectedId !== null && stack.includes(ui.selectedId);
    const id = wasSelected ? (ui.selectedId as string) : (stack[0] as string);
    const part = doc.parts[id];
    if (!part) return;
    ui.select(id);
    if (isLocked(part)) {
      // Locked parts can be selected but not dragged; dragging pans the view instead.
      gesture.current = pan(true);
      return;
    }
    const def = getPartDefinition(part.defId);
    const riderIds = ridersOf(doc, getPartDefinition, id);
    const moving = [id, ...riderIds];
    gesture.current = {
      kind: "part",
      id,
      pointerId: event.pointerId,
      startX: at.x,
      startY: at.y,
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
      moved: false,
      stack,
      wasSelected,
    };
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const at = local(event);
    pointers.current.set(event.pointerId, at);
    const active = gesture.current;
    if (!active) return;

    if (active.kind === "pinch") {
      const a = pointers.current.get(active.a);
      const b = pointers.current.get(active.b);
      if (!a || !b) return;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      view.panBy(cx - active.cx, cy - active.cy);
      if (active.distance > 0) view.zoomAt({ x: cx, y: cy }, distance / active.distance);
      active.distance = distance;
      active.cx = cx;
      active.cy = cy;
      return;
    }
    if (event.pointerId !== active.pointerId) return;
    if (!active.moved) {
      if (Math.hypot(at.x - active.startX, at.y - active.startY) < DRAG_THRESHOLD) return;
      active.moved = true;
    }
    if (active.kind === "pan") {
      view.panBy(at.x - active.lastX, at.y - active.lastY);
      active.lastX = at.x;
      active.lastY = at.y;
      return;
    }

    const point = view.toModel(at.x, at.y);
    const input = {
      shell,
      obstacles: active.obstacles,
      size: active.size,
      proposed: { x: point.x - active.grab.x, y: point.y - active.grab.y },
      mmPerPx: 1 / view.scale,
      snapPx: event.pointerType === "touch" ? TOUCH_SNAP_PX : DEFAULT_SNAP_PX,
      gridMm: gridForScale(units, view.scale),
      sticky: active.sticky,
      fallback: active.lastGood,
      noSnap: event.altKey,
    };
    const result = active.stacking
      ? solveStackedDrag({ ...input, ...active.stacking })
      : solveDrag({ ...input, z: active.z });
    active.sticky = result.sticky;
    if (result.collisions.length === 0 && !result.outOfBounds) {
      active.lastGood = { x: result.position.x, y: result.position.y };
    }
    const position = {
      x: quantizeMm(result.position.x),
      y: quantizeMm(result.position.y),
      z: quantizeMm(result.position.z),
    };
    useUiStore.getState().setDrag({
      id: active.id,
      position,
      guides: result.guides,
      followers: Object.fromEntries(
        active.riders.map((rider) => [
          rider.id,
          {
            x: quantizeMm(position.x + rider.offset.x),
            y: quantizeMm(position.y + rider.offset.y),
            z: quantizeMm(position.z + rider.offset.z),
          },
        ]),
      ),
    });
  };

  const endGesture = (event: PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    if (!pointers.current.delete(event.pointerId)) return;
    const active = gesture.current;
    if (!active) return;
    if (active.kind === "pinch") {
      // Lifting either finger ends the pinch. The other finger does nothing until it lifts too.
      if (event.pointerId === active.a || event.pointerId === active.b) gesture.current = null;
      return;
    }
    if (event.pointerId !== active.pointerId) return;
    gesture.current = null;
    const ui = useUiStore.getState();

    if (active.kind === "pan") {
      if (!active.moved && !cancelled && !active.onPart) ui.select(null);
      return;
    }
    const live = ui.drag;
    ui.setDrag(null);
    if (cancelled) return;
    if (active.moved) {
      if (live?.id === active.id) movePart(active.id, live.position);
      return;
    }
    // A plain click on an already selected part picks the next part underneath it.
    if (active.wasSelected && active.stack.length > 1) {
      const index = active.stack.indexOf(active.id);
      ui.select(active.stack[(index + 1) % active.stack.length] ?? active.id);
    }
  };

  const onClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const pill = gapPill(event.target);
    if (!pill) return;
    const box = pill.getBoundingClientRect();
    const origin = containerRef.current?.getBoundingClientRect();
    setGapEdit({
      side: pill.dataset.gap as Side,
      value: Number(pill.dataset.gapValue),
      x: box.left + box.width / 2 - (origin?.left ?? 0),
      y: box.top + box.height / 2 - (origin?.top ?? 0),
    });
  };

  const onDoubleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    const at = local(event);
    if (partsAt(view.toModel(at.x, at.y)).length === 0) view.reset();
  };

  const half = maxHalfWidth(shell);
  const centre = { x: view.width / 2, y: view.height / 2 };

  // Raised parts label themselves in their corner. When several share a corner (a mattress
  // on a bed platform), each one gets the next line down.
  const labelSlots = new Map<string, number>();
  const corners: { x: number; y: number }[] = [];
  if (ready) {
    for (const part of parts) {
      if (part.position.z <= 0) continue;
      const box = partBox(part);
      const rect = screenRect(view, box.min, box.max);
      const taken = corners.filter(
        (corner) => Math.abs(corner.x - rect.x) < 6 && Math.abs(corner.y - rect.y) < 6,
      ).length;
      labelSlots.set(part.id, taken);
      corners.push({ x: rect.x, y: rect.y });
    }
  }

  return (
    <div className="plan" ref={containerRef}>
      {ready && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: gap labels are a pointer shortcut; the inspector fields are the keyboard path
        <svg
          ref={svgRef}
          className={`plan-svg${drag ? " is-dragging" : ""}`}
          width={view.width}
          height={view.height}
          role="application"
          aria-label="Floor plan. Drag parts to move them."
          data-testid="plan"
          data-orientation={view.portrait ? "portrait" : "landscape"}
          data-zoom={view.zoom.toFixed(2)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endGesture(event, false)}
          onPointerCancel={(event) => endGesture(event, true)}
          onClick={onClick}
          onDoubleClick={onDoubleClick}
        >
          <defs>
            <pattern
              id="hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" className="plan-hatch-line" />
            </pattern>
            <clipPath id="floor-clip">
              <polygon points={points(view, outlineAt(shell, 0))} />
            </clipPath>
          </defs>

          <polygon className="plan-floor" points={points(view, outlineAt(shell, 0))} />
          <FloorGrid shell={shell} view={view} half={half} />
          <WheelWells shell={shell} view={view} />
          <polygon className="plan-walls" points={points(view, outlineAt(shell, 0))} />
          <Openings shell={shell} view={view} />
          <EndLabels shell={shell} view={view} />

          <RearAxle shell={shell} view={view} half={half} />
          {selected && <WallAtHeight shell={shell} view={view} part={selected} />}

          {parts.map((part) => (
            <PartShape
              key={part.id}
              part={part}
              view={view}
              units={units}
              selected={part.id === selectedId}
              flagged={issues.has(part.id) && drag === null}
              labelSlot={labelSlots.get(part.id) ?? 0}
            />
          ))}

          <CentreOfGravity shell={shell} view={view} />
          {drag && <Guides guides={drag.guides} shell={shell} view={view} half={half} />}
          {selected && (
            <Clearances
              doc={liveDoc}
              shell={shell}
              view={view}
              part={selected}
              units={units}
              editable={drag === null && !isLocked(selected)}
            />
          )}
        </svg>
      )}

      {ready && gapEdit && selected && (
        <GapInput
          key={`${selected.id}:${gapEdit.side}`}
          edit={gapEdit}
          units={units}
          onApply={(mm) => setGap(selected.id, gapEdit.side, mm)}
          onClose={() => setGapEdit(null)}
        />
      )}

      {ready && (
        <div className="plan-zoom">
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom out"
            title="Zoom out"
            data-testid="zoom-out"
            disabled={view.zoom <= 1}
            onClick={() => view.zoomAt(centre, 1 / ZOOM_STEP)}
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Fit the whole van"
            title="Fit the whole van"
            data-testid="zoom-fit"
            disabled={view.zoom <= 1}
            onClick={view.reset}
          >
            <FitIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Zoom in"
            title="Zoom in"
            data-testid="zoom-in"
            onClick={() => view.zoomAt(centre, ZOOM_STEP)}
          >
            <PlusIcon />
          </button>
        </div>
      )}
    </div>
  );
}

function FloorGrid({ shell, view, half }: { shell: VanShell; view: PlanTransform; half: number }) {
  // 500 mm squares, with 100 mm squares once there is room to show them.
  const step = view.scale * 100 >= 24 ? 100 : 500;
  const lines: {
    key: string;
    major: boolean;
    a: { x: number; y: number };
    b: { x: number; y: number };
  }[] = [];
  for (let x = step; x < shell.cargoLength; x += step) {
    lines.push({
      key: `x${x}`,
      major: x % 500 === 0,
      a: view.toScreen(x, -half),
      b: view.toScreen(x, half),
    });
  }
  for (let y = 0; y < half; y += step) {
    for (const side of y === 0 ? [0] : [y, -y]) {
      lines.push({
        key: `y${side}`,
        major: y % 500 === 0,
        a: view.toScreen(0, side),
        b: view.toScreen(shell.cargoLength, side),
      });
    }
  }
  return (
    <g className="plan-grid" clipPath="url(#floor-clip)">
      {lines.map(({ key, major, a, b }) => (
        <line
          key={key}
          className={major ? undefined : "is-minor"}
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
        />
      ))}
    </g>
  );
}

/** Where the rear axle is: loads behind this line lift weight off the front axle. */
function RearAxle({ shell, view, half }: { shell: VanShell; view: PlanTransform; half: number }) {
  const a = view.toScreen(shell.rearAxleX, -half);
  const b = view.toScreen(shell.rearAxleX, half);
  const label = view.toScreen(shell.rearAxleX, -half - 13 / view.scale);
  return (
    <g className="plan-axle">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      <text
        className="plan-note"
        x={label.x}
        y={label.y}
        transform={view.portrait ? `rotate(90 ${label.x} ${label.y})` : undefined}
      >
        Rear axle
      </text>
    </g>
  );
}

/** The loaded van's centre of gravity, live. */
function CentreOfGravity({ shell, view }: { shell: VanShell; view: PlanTransform }) {
  const weight = useWeight();
  const at = view.toScreen(shell.frontAxleX + weight.cgBehindFrontAxle, weight.cgLateral);
  return (
    <g
      className="plan-cg"
      data-testid="cg-marker"
      data-cg={Math.round(weight.cgBehindFrontAxle)}
      transform={`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`}
    >
      <title>Centre of gravity of the loaded van</title>
      <circle r="8" className="plan-cg-ring" />
      <path d="M0 -8A8 8 0 0 1 8 0H0ZM0 8A8 8 0 0 1 -8 0H0Z" className="plan-cg-fill" />
    </g>
  );
}

function WheelWells({ shell, view }: { shell: VanShell; view: PlanTransform }) {
  return (
    <g>
      {shell.wheelWells.map((well) => {
        const rect = screenRect(view, well.min, well.max);
        return (
          <g key={`${well.min.x}:${well.min.y}`}>
            <rect className="plan-wheelwell" {...rect} />
            <rect className="plan-wheelwell-hatch" {...rect} fill="url(#hatch)" />
          </g>
        );
      })}
    </g>
  );
}

function Openings({ shell, view }: { shell: VanShell; view: PlanTransform }) {
  const outward = 13 / view.scale;
  return (
    <g>
      {shell.openings.map((opening) => {
        if (opening.side === "rear") {
          const a = view.toScreen(shell.cargoLength, opening.from);
          const b = view.toScreen(shell.cargoLength, opening.to);
          return (
            <line key={opening.id} className="plan-opening" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          );
        }
        const sign = opening.side === "passenger" ? 1 : -1;
        const mid = (opening.from + opening.to) / 2;
        const wall = sign * halfWidthAt(shell, mid, 0);
        const a = view.toScreen(opening.from, wall);
        const b = view.toScreen(opening.to, wall);
        const label = view.toScreen(mid, wall + sign * outward);
        return (
          <g key={opening.id}>
            <line className="plan-opening" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            <text
              className="plan-note"
              x={label.x}
              y={label.y}
              transform={view.portrait ? `rotate(90 ${label.x} ${label.y})` : undefined}
            >
              {opening.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function EndLabels({ shell, view }: { shell: VanShell; view: PlanTransform }) {
  const outward = 16 / view.scale;
  const front = view.toScreen(-outward, 0);
  const rear = view.toScreen(shell.cargoLength + outward, 0);
  const turn = (p: { x: number; y: number }) =>
    view.portrait ? undefined : `rotate(-90 ${p.x} ${p.y})`;
  return (
    <g>
      <text className="plan-end" x={front.x} y={front.y} transform={turn(front)}>
        FRONT
      </text>
      <text className="plan-end" x={rear.x} y={rear.y} transform={turn(rear)}>
        REAR
      </text>
    </g>
  );
}

/**
 * Van walls lean in toward the roof. When the selected part is tall enough to be limited by
 * that, show where the wall actually is at the part's height.
 */
function WallAtHeight({
  shell,
  view,
  part,
}: {
  shell: VanShell;
  view: PlanTransform;
  part: PartInstance;
}) {
  const box = partBox(part);
  const limit = minHalfWidth(shell, 0, shell.cargoLength, box.min.z, box.max.z);
  if (limit > maxHalfWidth(shell) - 1) return null;
  return (
    <polygon
      className="plan-wall-at-height"
      data-testid="wall-at-height"
      points={points(view, outlineAt(shell, box.max.z))}
    />
  );
}

function PartShape({
  part,
  view,
  units,
  selected,
  flagged,
  labelSlot,
}: {
  part: PartInstance;
  view: PlanTransform;
  units: UnitSystem;
  selected: boolean;
  flagged: boolean;
  labelSlot: number;
}) {
  const def = getPartDefinition(part.defId);
  if (!def) return null;
  const box = partBox(part);
  const rect = screenRect(view, box.min, box.max);
  const name = partName(def, part);
  const { width, depth } = partDimensions(part);
  const sizeLabel = formatSize([width, depth], units);
  const raised = part.position.z > 0;
  const locked = isLocked(part);

  const classes = ["part", `part--${def.category}`];
  if (raised) classes.push("is-raised");
  if (selected) classes.push("is-selected");
  if (flagged) classes.push("is-flagged");
  if (locked) classes.push("is-locked");

  // Labels run along the part: sideways when it is wide, turned when it is tall and narrow.
  const turned = !raised && !fits(name, rect.width) && rect.height > rect.width;
  const along = turned ? rect.height : rect.width;
  const across = turned ? rect.width : rect.height;
  const slotOffset = raised ? labelSlot * 32 : 0;
  const detail = raised ? `${sizeLabel}, ${formatLength(part.position.z, units)} up` : sizeLabel;
  const showName = fits(name, along) && across >= 20 + slotOffset;
  const showSize = showName && fits(detail, along, 6) && across >= 38 + slotOffset;
  // Raised parts label themselves in a corner so they do not cover what is underneath.
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const labelX = raised ? rect.x + 8 : cx;
  const labelY = raised ? rect.y + 16 + slotOffset : cy + (showSize ? -3 : 4);
  const labelTransform = turned ? `rotate(-90 ${cx} ${cy})` : undefined;

  return (
    <g
      className={classes.join(" ")}
      data-testid={`part-${part.id}`}
      data-part-name={name}
      data-selected={selected}
      data-flagged={flagged}
      data-locked={locked}
      data-elevation={part.position.z}
    >
      <title>{`${name}, ${sizeLabel}`}</title>
      <rect className="part-body" {...rect} rx={3} />
      {showName && (
        <text className="part-name" x={labelX} y={labelY} transform={labelTransform}>
          {name}
        </text>
      )}
      {showSize && (
        <text className="part-size" x={labelX} y={labelY + 15} transform={labelTransform}>
          {detail}
        </text>
      )}
      {locked && rect.width >= 26 && rect.height >= 26 && (
        <g className="part-lock" transform={`translate(${rect.x + rect.width - 18} ${rect.y + 6})`}>
          <path d="M2.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" />
          <rect x="0.75" y="5.5" width="8.5" height="6.5" rx="1.5" />
        </g>
      )}
    </g>
  );
}

function Guides({
  guides,
  shell,
  view,
  half,
}: {
  guides: SnapGuide[];
  shell: VanShell;
  view: PlanTransform;
  half: number;
}) {
  return (
    <g className="plan-guides" data-testid="guides">
      {guides.map((guide) => {
        const a = guide.axis === "x" ? view.toScreen(guide.at, -half) : view.toScreen(0, guide.at);
        const b =
          guide.axis === "x"
            ? view.toScreen(guide.at, half)
            : view.toScreen(shell.cargoLength, guide.at);
        return (
          <line
            key={`${guide.axis}:${guide.at}`}
            data-kind={guide.kind}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
          />
        );
      })}
    </g>
  );
}

/** Live gaps from the selected part to its nearest neighbour or wall on each side. */
function Clearances({
  doc,
  shell,
  view,
  part,
  units,
  editable,
}: {
  doc: DesignDoc;
  shell: VanShell;
  view: PlanTransform;
  part: PartInstance;
  units: UnitSystem;
  editable: boolean;
}) {
  const box = partBox(part);
  const gaps = clearances(doc, shell, part);
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const spans: {
    key: Side;
    distance: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
  }[] = [
    {
      key: "front",
      distance: gaps.front.distance,
      from: { x: box.min.x - gaps.front.distance, y: cy },
      to: { x: box.min.x, y: cy },
    },
    {
      key: "rear",
      distance: gaps.rear.distance,
      from: { x: box.max.x, y: cy },
      to: { x: box.max.x + gaps.rear.distance, y: cy },
    },
    {
      key: "driver",
      distance: gaps.driver.distance,
      from: { x: cx, y: box.min.y - gaps.driver.distance },
      to: { x: cx, y: box.min.y },
    },
    {
      key: "passenger",
      distance: gaps.passenger.distance,
      from: { x: cx, y: box.max.y },
      to: { x: cx, y: box.max.y + gaps.passenger.distance },
    },
  ];
  return (
    <g className="plan-distances">
      {spans.map(({ key, distance, from, to }) => {
        const a = view.toScreen(from.x, from.y);
        const b = view.toScreen(to.x, to.y);
        const pixels = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance < 0.5 || pixels < 12) return null;
        const text = formatLength(distance, units);
        const pillWidth = text.length * 6.4 + 12;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={key} data-testid={`distance-${key}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {pixels >= 30 && (
              <g
                className={editable ? "plan-gap is-editable" : "plan-gap"}
                data-gap={editable ? key : undefined}
                data-gap-value={distance}
              >
                {editable && <title>Click to type this gap</title>}
                <rect x={mx - pillWidth / 2} y={my - 9} width={pillWidth} height={18} rx={9} />
                <text x={mx} y={my + 4}>
                  {text}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** The text field that appears over a gap label when it is pressed. */
function GapInput({
  edit,
  units,
  onApply,
  onClose,
}: {
  edit: GapEdit;
  units: UnitSystem;
  onApply: (mm: number) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(formatLength(edit.value, units));
  const [invalid, setInvalid] = useState(false);
  // Enter closes the field, which also blurs it. This stops the value being applied twice.
  const done = useRef(false);

  const apply = (): boolean => {
    const parsed = parseLength(text, units);
    if (!parsed.ok) return false;
    const next = parsed.kind === "relative" ? edit.value + parsed.mm : parsed.mm;
    if (next < 0) return false;
    if (next !== edit.value) onApply(next);
    return true;
  };

  return (
    <input
      className="plan-gap-input"
      data-testid="gap-input"
      style={{ left: edit.x, top: edit.y }}
      type="text"
      inputMode={units === "metric" ? "decimal" : "text"}
      autoComplete="off"
      spellCheck={false}
      aria-label={`Gap on the ${edit.side} side`}
      aria-invalid={invalid}
      value={text}
      // biome-ignore lint/a11y/noAutofocus: the field only exists because its label was just pressed
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => {
        setText(event.currentTarget.value);
        setInvalid(false);
      }}
      onBlur={() => {
        if (done.current) return;
        done.current = true;
        // Leaving applies a readable value and drops an unreadable one.
        apply();
        onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") {
          if (!apply()) {
            setInvalid(true);
            return;
          }
          done.current = true;
          onClose();
        } else if (event.key === "Escape") {
          done.current = true;
          onClose();
        }
      }}
    />
  );
}
