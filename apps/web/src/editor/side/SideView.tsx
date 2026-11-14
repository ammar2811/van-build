import { getPartDefinition } from "@vanbuild/catalog";
import {
  formatLength,
  interiorHeightAt,
  type PartInstance,
  partBox,
  partName,
  type VanShell,
} from "@vanbuild/core";
import { type PointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useIssues, useLiveDoc, useShell } from "../../state/selectors";
import { useUiStore } from "../../state/uiStore";

/** Room around the drawing for the FRONT / REAR labels. */
const PADDING = 36;

interface SideTransform {
  width: number;
  height: number;
  scale: number;
  toScreen: (x: number, z: number) => { x: number; y: number };
  toModel: (sx: number, sy: number) => { x: number; z: number };
}

/** `highest` is the top of the tallest thing to show, which a roof-mounted part can raise. */
function useSideTransform(shell: VanShell, highest: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const view = useMemo<SideTransform>(() => {
    const length = shell.cargoLength;
    const top = Math.max(interiorHeightAt(shell, 0), interiorHeightAt(shell, length), highest);
    const scale = Math.max(
      0.01,
      Math.min((size.width - 2 * PADDING) / length, (size.height - 2 * PADDING) / top),
    );
    const left = (size.width - length * scale) / 2;
    const floor = (size.height + top * scale) / 2;
    return {
      ...size,
      scale,
      toScreen: (x, z) => ({ x: left + x * scale, y: floor - z * scale }),
      toModel: (sx, sy) => ({ x: (sx - left) / scale, z: (floor - sy) / scale }),
    };
  }, [shell, size, highest]);
  return { ref, view };
}

function fits(text: string, available: number): boolean {
  return text.length * 6.6 + 12 <= available;
}

/**
 * Side elevation, seen from the driver side so the front is on the left like the plan:
 * length left to right, height bottom to top.
 * It shows what the plan cannot: how high things sit and what is above what. Parts can be
 * selected here; they are moved in the plan or 3D view and by the fields in the side panel.
 */
export function SideView() {
  const shell = useShell();
  const doc = useLiveDoc();
  const units = useUiStore((state) => state.units);
  const selectedId = useUiStore((state) => state.selectedId);
  const dragging = useUiStore((state) => state.drag !== null);
  const issues = useIssues();
  const svgRef = useRef<SVGSVGElement>(null);

  // Passenger side first, so parts nearer the viewer (the driver side) are drawn on top.
  const parts = useMemo(
    () =>
      Object.values(doc.parts).sort(
        (a, b) => partBox(b).min.y - partBox(a).min.y || a.id.localeCompare(b.id),
      ),
    [doc.parts],
  );
  // Whole centimetres, so the view does not rescale on every frame of a drag.
  const highest = Math.ceil(Math.max(0, ...parts.map((part) => partBox(part).max.z)) / 10) * 10;
  const { ref, view } = useSideTransform(shell, highest);
  const selected = parts.find((part) => part.id === selectedId) ?? null;
  const ready = view.width > 0 && view.height > 0;

  const rectOf = (part: PartInstance) => {
    const box = partBox(part);
    const a = view.toScreen(box.min.x, box.max.z);
    const b = view.toScreen(box.max.x, box.min.z);
    return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const point = view.toModel(event.clientX - (rect?.left ?? 0), event.clientY - (rect?.top ?? 0));
    const stack = [...parts]
      .reverse()
      .filter((part) => {
        const box = partBox(part);
        return (
          point.x >= box.min.x &&
          point.x <= box.max.x &&
          point.z >= box.min.z &&
          point.z <= box.max.z
        );
      })
      .map((part) => part.id);
    const ui = useUiStore.getState();
    if (stack.length === 0) {
      ui.select(null);
      return;
    }
    // Clicking the selected part again picks the one behind it.
    const index = ui.selectedId ? stack.indexOf(ui.selectedId) : -1;
    ui.select(stack[(index + 1) % stack.length] ?? null);
  };

  const length = shell.cargoLength;
  const outline = [
    view.toScreen(0, 0),
    view.toScreen(0, interiorHeightAt(shell, 0)),
    ...shell.stations
      .filter((station) => station.x > 0 && station.x < length)
      .map((station) => view.toScreen(station.x, interiorHeightAt(shell, station.x))),
    view.toScreen(length, interiorHeightAt(shell, length)),
    view.toScreen(length, 0),
  ];
  const well = shell.wheelWells[0];
  const front = view.toScreen(-16 / view.scale, interiorHeightAt(shell, 0) / 2);
  const rear = view.toScreen(length + 16 / view.scale, interiorHeightAt(shell, length) / 2);
  const axle = view.toScreen(shell.rearAxleX, 0);

  return (
    <div className="plan" ref={ref}>
      {ready && (
        <svg
          ref={svgRef}
          className="plan-svg side-svg"
          width={view.width}
          height={view.height}
          role="application"
          aria-label="Side elevation from the driver side. Select parts to see how high they sit."
          data-testid="side"
          onPointerDown={onPointerDown}
        >
          <polygon
            className="plan-floor"
            points={outline.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          />
          {well && (
            <rect
              className="plan-wheelwell"
              x={view.toScreen(well.min.x, 0).x}
              y={view.toScreen(0, well.max.z).y}
              width={(well.max.x - well.min.x) * view.scale}
              height={well.max.z * view.scale}
            />
          )}
          <polygon
            className="plan-walls"
            points={outline.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          />
          <g className="plan-axle">
            <line x1={axle.x} y1={axle.y} x2={axle.x} y2={axle.y + 10} />
            <text className="plan-note" x={axle.x} y={axle.y + 20}>
              Rear axle
            </text>
          </g>
          <text
            className="plan-end"
            x={front.x}
            y={front.y}
            transform={`rotate(-90 ${front.x} ${front.y})`}
          >
            FRONT
          </text>
          <text
            className="plan-end"
            x={rear.x}
            y={rear.y}
            transform={`rotate(-90 ${rear.x} ${rear.y})`}
          >
            REAR
          </text>

          {parts.map((part) => {
            const def = getPartDefinition(part.defId);
            if (!def) return null;
            const rect = rectOf(part);
            const name = partName(def, part);
            const isSelected = part.id === selectedId;
            const flagged = issues.has(part.id) && !dragging;
            const classes = ["part", "side-part", `part--${def.category}`];
            if (isSelected) classes.push("is-selected");
            if (flagged) classes.push("is-flagged");
            return (
              <g
                key={part.id}
                className={classes.join(" ")}
                data-testid={`side-part-${part.id}`}
                data-part-name={name}
                data-selected={isSelected}
              >
                <title>{name}</title>
                <rect className="part-body" {...rect} rx={2} />
                {fits(name, rect.width) && rect.height >= 18 && (
                  <text
                    className="part-name"
                    x={rect.x + rect.width / 2}
                    y={rect.y + rect.height / 2 + 4}
                  >
                    {name}
                  </text>
                )}
              </g>
            );
          })}

          {selected && <HeightMarks part={selected} units={units} view={view} />}
        </svg>
      )}
    </div>
  );
}

/** How far the selected part's underside and top are above the floor. */
function HeightMarks({
  part,
  units,
  view,
}: {
  part: PartInstance;
  units: "metric" | "imperial";
  view: SideTransform;
}) {
  const box = partBox(part);
  const x = (box.min.x + box.max.x) / 2;
  const floor = view.toScreen(x, 0);
  const under = view.toScreen(x, box.min.z);
  const top = view.toScreen(x, box.max.z);
  const marks = [
    { key: "under", from: floor, to: under, value: box.min.z },
    { key: "top", from: { x: floor.x + 0, y: floor.y }, to: top, value: box.max.z },
  ].filter((mark) => mark.value > 0.5 && Math.abs(mark.from.y - mark.to.y) >= 30);
  // When the part stands on the floor, only its top height is worth showing.
  const shown = box.min.z > 0.5 ? marks.filter((mark) => mark.key === "under") : marks;
  return (
    <g className="plan-distances">
      {shown.map(({ key, from, to, value }) => {
        const text = formatLength(value, units);
        const width = text.length * 6.4 + 12;
        const my = (from.y + to.y) / 2;
        return (
          <g key={key} data-testid={`height-${key}`}>
            <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} />
            <rect x={from.x - width / 2} y={my - 9} width={width} height={18} rx={9} />
            <text x={from.x} y={my + 4}>
              {text}
            </text>
          </g>
        );
      })}
    </g>
  );
}
