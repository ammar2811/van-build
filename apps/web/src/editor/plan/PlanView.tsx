import { getPartDefinition } from "@vanbuild/catalog";
import {
  clearances,
  DEFAULT_SNAP_PX,
  type DesignDoc,
  defaultGridMm,
  formatLength,
  formatSize,
  halfWidthAt,
  maxHalfWidth,
  minHalfWidth,
  type Obstacle,
  outlineAt,
  type PartInstance,
  partBox,
  partDimensions,
  partExtents,
  partName,
  quantizeMm,
  type SnapGuide,
  type Sticky,
  sceneObstacles,
  solveDrag,
  TOUCH_SNAP_PX,
  type UnitSystem,
  type VanShell,
  type Vec3,
} from "@vanbuild/core";
import { type PointerEvent, useMemo, useRef } from "react";
import { movePart } from "../../state/actions";
import { useDocStore } from "../../state/docStore";
import { useIssues, useShell } from "../../state/selectors";
import { useUiStore } from "../../state/uiStore";
import { type PlanTransform, screenRect, usePlanTransform } from "./usePlanTransform";

/** Pointer travel, in pixels, before a press turns into a drag. */
const DRAG_THRESHOLD = 4;

interface DragSession {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  /** Offset from the pointer to the part's centre, in mm. */
  grab: { x: number; y: number };
  size: Vec3;
  z: number;
  obstacles: Obstacle[];
  sticky: Sticky;
  lastGood: { x: number; y: number };
  moved: boolean;
  /** Parts under the pointer when the press started, topmost first. */
  stack: string[];
  wasSelected: boolean;
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

export function PlanView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const session = useRef<DragSession | null>(null);

  const shell = useShell();
  const view = usePlanTransform(containerRef, shell);
  const doc = useDocStore((state) => state.doc);
  const units = useUiStore((state) => state.units);
  const selectedId = useUiStore((state) => state.selectedId);
  const drag = useUiStore((state) => state.drag);
  const issues = useIssues();

  // Lower parts first, so raised parts (beds, overhead cabinets) draw on top.
  const parts = useMemo(() => {
    const live = Object.values(doc.parts).map((part) =>
      drag?.id === part.id ? { ...part, position: drag.position } : part,
    );
    return live.sort((a, b) => a.position.z - b.position.z || a.id.localeCompare(b.id));
  }, [doc.parts, drag]);

  const selected = parts.find((part) => part.id === selectedId) ?? null;

  const toModel = (event: PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return view.toModel(event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0));
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

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || session.current) return;
    const point = toModel(event);
    const stack = partsAt(point);
    const ui = useUiStore.getState();
    if (stack.length === 0) {
      ui.select(null);
      return;
    }
    // A selected part keeps the drag even when something is stacked above it, so a tank
    // under a bed can still be moved once it has been selected.
    const wasSelected = ui.selectedId !== null && stack.includes(ui.selectedId);
    const id = wasSelected ? (ui.selectedId as string) : (stack[0] as string);
    const part = doc.parts[id];
    if (!part) return;
    ui.select(id);
    event.currentTarget.setPointerCapture(event.pointerId);
    session.current = {
      id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      grab: { x: point.x - part.position.x, y: point.y - part.position.y },
      size: partExtents(part),
      z: part.position.z,
      obstacles: sceneObstacles(doc, shell, id),
      sticky: {},
      lastGood: { x: part.position.x, y: part.position.y },
      moved: false,
      stack,
      wasSelected,
    };
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!active.moved) {
      const travel = Math.hypot(event.clientX - active.startX, event.clientY - active.startY);
      if (travel < DRAG_THRESHOLD) return;
      active.moved = true;
    }
    const point = toModel(event);
    const result = solveDrag({
      shell,
      obstacles: active.obstacles,
      size: active.size,
      z: active.z,
      proposed: { x: point.x - active.grab.x, y: point.y - active.grab.y },
      mmPerPx: 1 / view.scale,
      snapPx: event.pointerType === "touch" ? TOUCH_SNAP_PX : DEFAULT_SNAP_PX,
      gridMm: defaultGridMm(units),
      sticky: active.sticky,
      fallback: active.lastGood,
      noSnap: event.altKey,
    });
    active.sticky = result.sticky;
    if (result.collisions.length === 0 && !result.outOfBounds) {
      active.lastGood = { x: result.position.x, y: result.position.y };
    }
    useUiStore.getState().setDrag({
      id: active.id,
      position: {
        x: quantizeMm(result.position.x),
        y: quantizeMm(result.position.y),
        z: active.z,
      },
      guides: result.guides,
    });
  };

  const endDrag = (event: PointerEvent<SVGSVGElement>, cancelled: boolean) => {
    const active = session.current;
    if (!active || event.pointerId !== active.pointerId) return;
    session.current = null;
    const ui = useUiStore.getState();
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

  const ready = view.width > 0 && view.height > 0;
  const half = maxHalfWidth(shell);

  return (
    <div className="plan" ref={containerRef}>
      {ready && (
        <svg
          ref={svgRef}
          className={`plan-svg${drag ? " is-dragging" : ""}`}
          width={view.width}
          height={view.height}
          role="application"
          aria-label="Floor plan. Drag parts to move them."
          data-testid="plan"
          data-orientation={view.portrait ? "portrait" : "landscape"}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(event) => endDrag(event, false)}
          onPointerCancel={(event) => endDrag(event, true)}
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

          {selected && <WallAtHeight shell={shell} view={view} part={selected} />}

          {parts.map((part) => (
            <PartShape
              key={part.id}
              part={part}
              view={view}
              units={units}
              selected={part.id === selectedId}
              flagged={issues.has(part.id) && drag?.id !== part.id}
            />
          ))}

          {drag && <Guides guides={drag.guides} shell={shell} view={view} half={half} />}
          {selected && (
            <Clearances doc={doc} shell={shell} view={view} part={selected} units={units} />
          )}
        </svg>
      )}
    </div>
  );
}

function FloorGrid({ shell, view, half }: { shell: VanShell; view: PlanTransform; half: number }) {
  const step = 500;
  const lines: { key: string; a: { x: number; y: number }; b: { x: number; y: number } }[] = [];
  for (let x = step; x < shell.cargoLength; x += step) {
    lines.push({ key: `x${x}`, a: view.toScreen(x, -half), b: view.toScreen(x, half) });
  }
  for (let y = 0; y < half; y += step) {
    for (const side of y === 0 ? [0] : [y, -y]) {
      lines.push({
        key: `y${side}`,
        a: view.toScreen(0, side),
        b: view.toScreen(shell.cargoLength, side),
      });
    }
  }
  return (
    <g className="plan-grid" clipPath="url(#floor-clip)">
      {lines.map(({ key, a, b }) => (
        <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      ))}
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
}: {
  part: PartInstance;
  view: PlanTransform;
  units: UnitSystem;
  selected: boolean;
  flagged: boolean;
}) {
  const def = getPartDefinition(part.defId);
  if (!def) return null;
  const box = partBox(part);
  const rect = screenRect(view, box.min, box.max);
  const name = partName(def, part);
  const { width, depth } = partDimensions(part);
  const sizeLabel = formatSize([width, depth], units);
  const raised = part.position.z > 0;

  const classes = ["part", `part--${def.category}`];
  if (raised) classes.push("is-raised");
  if (selected) classes.push("is-selected");
  if (flagged) classes.push("is-flagged");

  // Labels run along the part: sideways when it is wide, turned when it is tall and narrow.
  const turned = !raised && !fits(name, rect.width) && rect.height > rect.width;
  const along = turned ? rect.height : rect.width;
  const across = turned ? rect.width : rect.height;
  const showName = fits(name, along) && across >= 20;
  const showSize = showName && fits(sizeLabel, along, 6) && across >= 38;
  // Raised parts label themselves in a corner so they do not cover what is underneath.
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const labelX = raised ? rect.x + 8 : cx;
  const labelY = raised ? rect.y + 16 : cy + (showSize ? -3 : 4);
  const labelTransform = turned ? `rotate(-90 ${cx} ${cy})` : undefined;

  return (
    <g
      className={classes.join(" ")}
      data-testid={`part-${part.id}`}
      data-part-name={name}
      data-selected={selected}
      data-flagged={flagged}
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
          {raised ? `${sizeLabel}, ${formatLength(part.position.z, units)} up` : sizeLabel}
        </text>
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
}: {
  doc: DesignDoc;
  shell: VanShell;
  view: PlanTransform;
  part: PartInstance;
  units: UnitSystem;
}) {
  const box = partBox(part);
  const gaps = clearances(doc, shell, part);
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const spans = [
    {
      key: "front",
      gap: gaps.front,
      from: { x: box.min.x - gaps.front.distance, y: cy },
      to: { x: box.min.x, y: cy },
    },
    {
      key: "rear",
      gap: gaps.rear,
      from: { x: box.max.x, y: cy },
      to: { x: box.max.x + gaps.rear.distance, y: cy },
    },
    {
      key: "driver",
      gap: gaps.driver,
      from: { x: cx, y: box.min.y - gaps.driver.distance },
      to: { x: cx, y: box.min.y },
    },
    {
      key: "passenger",
      gap: gaps.passenger,
      from: { x: cx, y: box.max.y },
      to: { x: cx, y: box.max.y + gaps.passenger.distance },
    },
  ];
  return (
    <g className="plan-distances">
      {spans.map(({ key, gap, from, to }) => {
        const a = view.toScreen(from.x, from.y);
        const b = view.toScreen(to.x, to.y);
        const pixels = Math.hypot(a.x - b.x, a.y - b.y);
        if (gap.distance < 0.5 || pixels < 12) return null;
        const text = formatLength(gap.distance, units);
        const pillWidth = text.length * 6.4 + 12;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        return (
          <g key={key} data-testid={`distance-${key}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
            {pixels >= 30 && (
              <>
                <rect x={mx - pillWidth / 2} y={my - 9} width={pillWidth} height={18} rx={9} />
                <text x={mx} y={my + 4}>
                  {text}
                </text>
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}
