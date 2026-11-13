import { wallDistances } from "../editing/placement";
import {
  type DefinitionLookup,
  partBox,
  partDimensions,
  partName,
  requireDefinition,
} from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import type { PartInstance } from "../schema/part";
import type { VanShell } from "../schema/shell";
import { maxHalfWidth, outlineAt } from "../shell/geometry";
import { formatLength, formatSize, type UnitSystem } from "../units/length";
import { type DrawItem, type Drawing, dimension, FAINT, INK, THIN } from "./ir";

export interface PlanOptions {
  units: UnitSystem;
  /** Defaults to A4 for metric and US Letter for imperial. */
  paper?: "a4" | "letter";
  /** Printed in the title block. Passed in so the output stays deterministic. */
  date?: string;
}

const PAPER = {
  a4: { width: 297, height: 210 },
  letter: { width: 279.4, height: 215.9 },
} as const;

const MARGIN = 10;
const TITLE_HEIGHT = 14;
const SCALES = [10, 15, 20, 25, 30, 40, 50] as const;
const ROW_HEIGHT = 4.4;
const SCHEDULE_COLUMNS = 2;
const SCHEDULE_GAP = 8;
/** Share of the table width per column: #, part, size, front, driver, off floor. */
const COLUMN_SHARE = [0.07, 0.3, 0.33, 0.11, 0.11, 0.08] as const;
const COLUMN_TITLES = ["#", "Part", "W x D x H", "Front", "Driver", "Up"] as const;

/** Helvetica averages about half an em per character. Good enough to decide if a label fits. */
function textWidth(text: string, size: number): number {
  return text.length * size * 0.52;
}

/** Parts in reading order (front to rear, then driver side to passenger side). */
export function partsInDrawingOrder(doc: DesignDoc): PartInstance[] {
  return Object.values(doc.parts).sort((a, b) => {
    const boxA = partBox(a);
    const boxB = partBox(b);
    return boxA.min.x - boxB.min.x || boxA.min.y - boxB.min.y || a.id.localeCompare(b.id);
  });
}

/**
 * One landscape page: a dimensioned top-down plan with numbered parts, and a schedule that
 * lists each part's size and its clear distance from the front wall and the driver-side wall.
 */
export function planDrawing(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  options: PlanOptions,
): Drawing {
  const units = options.units;
  const page = PAPER[options.paper ?? (units === "metric" ? "a4" : "letter")];
  const items: DrawItem[] = [];
  const parts = partsInDrawingOrder(doc);

  const left = MARGIN;
  const right = page.width - MARGIN;
  const top = MARGIN;
  const bottom = page.height - MARGIN - TITLE_HEIGHT;

  const halfWidth = maxHalfWidth(shell);
  const planLeft = left + 16;
  const planTop = top + 9;

  // The largest scale at which the plan fits across the page and the schedule fits below it.
  const rowsAt = (scale: number) => {
    const scheduleTop = planTop + (2 * halfWidth) / scale + 17;
    return Math.max(0, Math.floor((bottom - 3 - scheduleTop - ROW_HEIGHT) / ROW_HEIGHT));
  };
  const fits = (scale: number) =>
    planLeft + shell.cargoLength / scale <= right - 6 &&
    rowsAt(scale) * SCHEDULE_COLUMNS >= parts.length;
  const scale = SCALES.find(fits) ?? 50;

  const planWidth = shell.cargoLength / scale;
  const planHeight = (2 * halfWidth) / scale;
  const planBottom = planTop + planHeight;
  const px = (x: number) => planLeft + x / scale;
  // Passenger side (+Y) is drawn at the top, so the view is a true top-down view, not mirrored.
  const py = (y: number) => planTop + (halfWidth - y) / scale;

  // Sheet border and title block.
  items.push({
    type: "rect",
    x: left,
    y: top,
    w: right - left,
    h: page.height - 2 * MARGIN,
    stroke: INK,
  });
  items.push({ type: "line", x1: left, y1: bottom, x2: right, y2: bottom, stroke: INK });
  items.push({
    type: "text",
    x: left + 4,
    y: bottom + 6,
    text: doc.name,
    size: 4,
    anchor: "start",
    bold: true,
  });
  items.push({
    type: "text",
    x: left + 4,
    y: bottom + 11,
    text: `${shell.name} - floor plan`,
    size: 2.6,
    anchor: "start",
  });
  items.push({
    type: "text",
    x: (left + right) / 2,
    y: bottom + 8.5,
    text: "Planning estimate. Measure your own van before cutting.",
    size: 2.4,
    anchor: "middle",
    gray: 0.35,
  });
  items.push({
    type: "text",
    x: right - 4,
    y: bottom + 6,
    text: `Scale 1:${scale}`,
    size: 2.8,
    anchor: "end",
    bold: true,
  });
  const unitNote = units === "metric" ? "Dimensions in mm" : "Dimensions in inches";
  items.push({
    type: "text",
    x: right - 4,
    y: bottom + 11,
    text: options.date ? `${unitNote} - ${options.date}` : unitNote,
    size: 2.4,
    anchor: "end",
  });

  // Van interior at floor level.
  items.push({
    type: "polygon",
    points: outlineAt(shell, 0).map((p) => [px(p.x), py(p.y)]),
    stroke: { width: 0.6, gray: 0 },
    fill: 1,
  });
  for (const well of shell.wheelWells) {
    const x = px(well.min.x);
    const y = py(well.max.y);
    const w = (well.max.x - well.min.x) / scale;
    const h = (well.max.y - well.min.y) / scale;
    items.push({ type: "rect", x, y, w, h, stroke: THIN, fill: 0.8 });
    if (textWidth("wheel well", 1.8) < w - 1 && h > 3) {
      items.push({
        type: "text",
        x: x + w / 2,
        y: y + h / 2 + 0.6,
        text: "wheel well",
        size: 1.8,
        anchor: "middle",
        gray: 0.3,
      });
    }
  }
  for (const opening of shell.openings) {
    if (opening.side === "rear") continue;
    const y = py(opening.side === "passenger" ? halfWidth : -halfWidth);
    items.push({
      type: "line",
      x1: px(opening.from),
      y1: y,
      x2: px(opening.to),
      y2: y,
      stroke: { width: 1.1, gray: 0.55 },
    });
    items.push({
      type: "text",
      x: px((opening.from + opening.to) / 2),
      y: opening.side === "passenger" ? y - 2 : y + 4,
      text: opening.label,
      size: 2.2,
      anchor: "middle",
      gray: 0.3,
    });
  }

  // Parts, numbered in reading order. Floor parts are drawn first so the dashed outline of a
  // raised part (a bed, an overhead cabinet) is never hidden by the fill of what is under it.
  const numbered = parts.map((part, index) => ({ part, number: index + 1 }));
  const floorFirst = [...numbered].sort(
    (a, b) => Number(a.part.position.z > 0) - Number(b.part.position.z > 0),
  );
  // Corner labels already placed, so parts stacked on the same footprint do not overprint.
  const cornerLabels: { x: number; y: number }[] = [];
  for (const { part, number } of floorFirst) {
    const def = requireDefinition(definitions, part.defId);
    const box = partBox(part);
    const x = px(box.min.x);
    const y = py(box.max.y);
    const w = (box.max.x - box.min.x) / scale;
    const h = (box.max.y - box.min.y) / scale;
    const raised = part.position.z > 0;
    items.push(
      raised
        ? { type: "rect", x, y, w, h, stroke: { width: 0.3, gray: 0, dash: [1.2, 0.8] } }
        : { type: "rect", x, y, w, h, stroke: INK, fill: 0.93 },
    );
    const name = partName(def, part);
    if (raised) {
      // Raised parts are labelled in their corner so they do not sit on the label below them.
      const label = textWidth(name, 2.2) < w - 8 ? `${number}  ${name}` : String(number);
      const sameCorner = cornerLabels.filter(
        (corner) => Math.abs(corner.x - x) < 1 && Math.abs(corner.y - y) < 1,
      ).length;
      cornerLabels.push({ x, y });
      items.push({
        type: "text",
        x: x + 1.5,
        y: y + 3.6 + sameCorner * 3.6,
        text: label,
        size: 2.6,
        anchor: "start",
        bold: true,
      });
      continue;
    }
    const showName = textWidth(name, 2.2) < w - 1.5 && h > 8;
    items.push({
      type: "text",
      x: x + w / 2,
      y: y + h / 2 + (showName ? -0.6 : 1.1),
      text: String(number),
      size: 3.2,
      anchor: "middle",
      bold: true,
    });
    if (showName) {
      items.push({
        type: "text",
        x: x + w / 2,
        y: y + h / 2 + 2.8,
        text: name,
        size: 2.2,
        anchor: "middle",
      });
    }
  }

  // Overall dimensions and orientation.
  items.push(
    ...dimension(
      [planLeft, planBottom],
      [planLeft + planWidth, planBottom],
      7,
      formatLength(shell.cargoLength, units),
    ),
    ...dimension(
      [planLeft, planTop],
      [planLeft, planBottom],
      -8,
      formatLength(2 * halfWidth, units),
    ),
  );
  items.push({
    type: "text",
    x: planLeft,
    y: planBottom + 13,
    text: "FRONT (cab)",
    size: 2.4,
    anchor: "start",
    bold: true,
  });
  items.push({
    type: "text",
    x: planLeft + planWidth,
    y: planBottom + 13,
    text: "REAR (doors)",
    size: 2.4,
    anchor: "end",
    bold: true,
  });

  // Schedule.
  const scheduleTop = planBottom + 17;
  const tableWidth = (right - left - 8 - SCHEDULE_GAP * (SCHEDULE_COLUMNS - 1)) / SCHEDULE_COLUMNS;
  const rowsPerColumn = Math.max(1, rowsAt(scale));
  const listed = parts.slice(0, rowsPerColumn * SCHEDULE_COLUMNS);
  const columnCount = Math.max(1, Math.ceil(listed.length / rowsPerColumn));

  for (let column = 0; column < columnCount; column++) {
    const tableLeft = left + 4 + column * (tableWidth + SCHEDULE_GAP);
    const cellLeft: number[] = [];
    let cursor = tableLeft;
    for (const share of COLUMN_SHARE) {
      cellLeft.push(cursor);
      cursor += share * tableWidth;
    }
    const cell = (i: number) => (cellLeft[i] ?? tableLeft) + 1;
    const headerBase = scheduleTop + ROW_HEIGHT - 1.3;
    COLUMN_TITLES.forEach((title, i) => {
      items.push({
        type: "text",
        x: cell(i),
        y: headerBase,
        text: title,
        size: 2.2,
        anchor: "start",
        bold: true,
      });
    });
    items.push({
      type: "line",
      x1: tableLeft,
      y1: scheduleTop + ROW_HEIGHT,
      x2: tableLeft + tableWidth,
      y2: scheduleTop + ROW_HEIGHT,
      stroke: INK,
    });

    const rows = listed.slice(column * rowsPerColumn, (column + 1) * rowsPerColumn);
    rows.forEach((part, row) => {
      const def = requireDefinition(definitions, part.defId);
      const { width, depth, height } = partDimensions(part);
      const distances = wallDistances(shell, part);
      const base = scheduleTop + ROW_HEIGHT * (row + 2) - 1.3;
      const values = [
        String(column * rowsPerColumn + row + 1),
        partName(def, part),
        formatSize([width, depth, height], units).replace(" mm", ""),
        formatLength(distances.front, units).replace(" mm", ""),
        formatLength(distances.driver, units).replace(" mm", ""),
        formatLength(part.position.z, units).replace(" mm", ""),
      ];
      values.forEach((text, i) => {
        items.push({ type: "text", x: cell(i), y: base, text, size: 2.2, anchor: "start" });
      });
      items.push({
        type: "line",
        x1: tableLeft,
        y1: scheduleTop + ROW_HEIGHT * (row + 2),
        x2: tableLeft + tableWidth,
        y2: scheduleTop + ROW_HEIGHT * (row + 2),
        stroke: FAINT,
      });
    });
  }

  const notes = ["Front / Driver: clear distance from the front wall / driver-side wall."];
  notes.push("Up: height of the underside above the floor.");
  if (listed.length < parts.length) {
    notes.push(`${parts.length - listed.length} more parts do not fit on this sheet.`);
  }
  items.push({
    type: "text",
    x: right - 4,
    y: bottom - 2,
    text: notes.join(" "),
    size: 2,
    anchor: "end",
    gray: 0.35,
  });

  return { width: page.width, height: page.height, title: `${doc.name} - floor plan`, items };
}
