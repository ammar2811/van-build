import { type DefinitionLookup, fillLevelOf, partName, requireDefinition } from "../parts/parts";
import {
  computeWeight,
  designLoads,
  effectiveChassis,
  type LimitCheck,
  OCCUPANT_PREFIX,
  requireChassis,
  type WeightReport,
} from "../physics/weight";
import type { DesignDoc } from "../schema/design";
import { type Chassis, ESTIMATED, type VanShell } from "../schema/shell";
import { formatLength } from "../units/length";
import { formatMass } from "../units/mass";
import { type DrawItem, type Drawing, FAINT, INK, THIN } from "./ir";
import { fitText, type SheetOptions, sheetArea, titleBlock } from "./sheet";

const ROW_HEIGHT = 4.4;
const COLUMNS = 2;
const COLUMN_GAP = 8;
/** Share of the table width per column: item, weight, position, on front axle, on rear axle. */
const COLUMN_SHARE = [0.4, 0.15, 0.17, 0.14, 0.14] as const;
const COLUMN_TITLES = ["Item", "Weight", "Behind front axle", "On front", "On rear"] as const;

const STATUS_TEXT = { ok: "OK", warn: "Near limit", over: "OVER LIMIT" } as const;
const STATUS_FILL = { ok: 0.7, warn: 0.45, over: 0.15 } as const;

interface LoadRow {
  name: string;
  /** Grams. */
  mass: number;
  /** mm behind the front axle, or null when a position means nothing (the empty van). */
  position: number | null;
  front: number;
  rear: number;
  bold?: boolean;
}

const VEHICLE_FIELDS: { field: keyof Omit<Chassis, "id" | "name">; label: string }[] = [
  { field: "gvwr", label: "Gross rating (GVWR)" },
  { field: "gawrFront", label: "Front axle rating" },
  { field: "gawrRear", label: "Rear axle rating" },
  { field: "curbFront", label: "Empty, front axle" },
  { field: "curbRear", label: "Empty, rear axle" },
];

function occupantName(seat: number): string {
  if (seat === 0) return "Driver";
  return seat === 1 ? "Passenger" : `Passenger ${seat}`;
}

/**
 * One landscape page: axle loads against their ratings, the vehicle numbers the estimate
 * rests on and where each came from, and every load with its share on each axle.
 */
export function weightDrawing(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  options: SheetOptions,
): Drawing {
  const units = options.units;
  const area = sheetArea(options);
  const { page, left, right, top, bottom } = area;
  const chassis = effectiveChassis(shell, doc);
  const catalogChassis = requireChassis(shell, doc.chassisId);
  const loads = designLoads(doc, shell, definitions);
  const report: WeightReport = computeWeight({
    frontAxleX: shell.frontAxleX,
    rearAxleX: shell.rearAxleX,
    chassis,
    loads,
  });
  const wheelbase = shell.rearAxleX - shell.frontAxleX;
  const mass = (grams: number) => formatMass(grams, units);

  const items: DrawItem[] = titleBlock(
    area,
    {
      name: doc.name,
      subtitle: `${shell.name} - weight estimate`,
      caution: "An estimate, not a measurement. Weigh the finished van on a scale.",
      headline: `Gross ${mass(report.gross.load)}`,
      note: units === "metric" ? "Weights in kg" : "Weights in lb",
    },
    options,
  );
  const text = (
    x: number,
    y: number,
    value: string,
    extra: Partial<Extract<DrawItem, { type: "text" }>> = {},
  ) => {
    items.push({ type: "text", x, y, text: value, size: 2.4, anchor: "start", ...extra });
  };

  const x0 = left + 4;
  text(x0, top + 8, "Weight estimate", { size: 4, bold: true });

  // Axle loads against their ratings.
  const tableTop = top + 13;
  const loadEnd = x0 + 52;
  const ratingEnd = x0 + 76;
  const usedEnd = x0 + 90;
  const barLeft = x0 + 95;
  const barWidth = 45;
  const statusLeft = barLeft + barWidth + 4;
  const headerBase = tableTop + 3.1;
  text(loadEnd, headerBase, "Load", { size: 2.2, bold: true, anchor: "end" });
  text(ratingEnd, headerBase, "Rating", { size: 2.2, bold: true, anchor: "end" });
  text(usedEnd, headerBase, "Used", { size: 2.2, bold: true, anchor: "end" });
  items.push({
    type: "line",
    x1: x0,
    y1: tableTop + ROW_HEIGHT,
    x2: statusLeft + 18,
    y2: tableTop + ROW_HEIGHT,
    stroke: INK,
  });
  const checks: { label: string; check: LimitCheck }[] = [
    { label: "Front axle", check: report.front },
    { label: "Rear axle", check: report.rear },
    { label: "Gross weight", check: report.gross },
  ];
  checks.forEach(({ label, check }, row) => {
    const rowTop = tableTop + ROW_HEIGHT + row * 7;
    const base = rowTop + 4.7;
    text(x0, base, label, { size: 2.8, bold: true });
    text(loadEnd, base, mass(check.load), { size: 2.8, anchor: "end" });
    text(ratingEnd, base, mass(check.limit), { size: 2.8, anchor: "end" });
    text(usedEnd, base, `${Math.round(check.used * 100)}%`, { size: 2.8, anchor: "end" });
    const filled = Math.min(Math.max(check.used, 0), 1) * barWidth;
    if (filled > 0) {
      items.push({
        type: "rect",
        x: barLeft,
        y: rowTop + 1.8,
        w: filled,
        h: 3.6,
        fill: STATUS_FILL[check.status],
      });
    }
    items.push({ type: "rect", x: barLeft, y: rowTop + 1.8, w: barWidth, h: 3.6, stroke: THIN });
    // The warning threshold.
    items.push({
      type: "line",
      x1: barLeft + 0.9 * barWidth,
      y1: rowTop + 1,
      x2: barLeft + 0.9 * barWidth,
      y2: rowTop + 6.2,
      stroke: THIN,
    });
    text(statusLeft, base, STATUS_TEXT[check.status], {
      size: 2.6,
      bold: check.status !== "ok",
    });
    items.push({
      type: "line",
      x1: x0,
      y1: rowTop + 7,
      x2: statusLeft + 18,
      y2: rowTop + 7,
      stroke: FAINT,
    });
  });

  // Summary lines under the table.
  const summaryWidth = statusLeft + 18 - x0;
  const capacity = chassis.gvwr - chassis.curbFront - chassis.curbRear;
  const payload =
    report.payloadRemaining >= 0
      ? `Payload remaining: ${mass(report.payloadRemaining)} of ${mass(capacity)}.`
      : `Over the gross rating by ${mass(-report.payloadRemaining)}.`;
  const lateral = Math.abs(report.cgLateral);
  const sideways =
    lateral < 0.5
      ? "on the centreline"
      : `${formatLength(Math.round(lateral), units)} toward the ${report.cgLateral > 0 ? "passenger" : "driver"} side`;
  const balance = `Centre of gravity: ${formatLength(Math.round(report.cgBehindFrontAxle), units)} behind the front axle (${Math.round(
    (report.cgBehindFrontAxle / wheelbase) * 100,
  )}% of the wheelbase), ${sideways}.`;
  const seated = Math.min(doc.loadCase.occupants, shell.cabSeats.length);
  const people =
    seated === 0
      ? "nobody in the cab"
      : `${seated} ${seated === 1 ? "person" : "people"} at ${mass(doc.loadCase.occupantMass)}${seated === 1 ? "" : " each"}`;
  const tanks = Object.keys(doc.parts)
    .sort()
    .flatMap((id) => {
      const part = doc.parts[id];
      if (!part) return [];
      const def = requireDefinition(definitions, part.defId);
      if (!def.mass.contents) return [];
      return [`${partName(def, part)} ${Math.round(fillLevelOf(doc, def, id) * 100)}% full`];
    });
  const onBoard = `On board: ${[people, ...tanks].join(", ")}.`;
  const summaryTop = tableTop + ROW_HEIGHT + 21 + 6.5;
  text(x0, summaryTop, payload, { size: 2.8, bold: true });
  text(x0, summaryTop + 5.5, fitText(balance, 2.6, summaryWidth), { size: 2.6 });
  text(x0, summaryTop + 11, fitText(onBoard, 2.6, summaryWidth), { size: 2.6 });

  // The vehicle numbers the estimate rests on, and where each one came from.
  const vehicleWidth = 80;
  const vehicleLeft = right - 4 - vehicleWidth;
  const valueEnd = vehicleLeft + 55;
  text(vehicleLeft, headerBase, "Vehicle", { size: 2.2, bold: true });
  items.push({
    type: "line",
    x1: vehicleLeft,
    y1: tableTop + ROW_HEIGHT,
    x2: vehicleLeft + vehicleWidth,
    y2: tableTop + ROW_HEIGHT,
    stroke: INK,
  });
  const vehicleRows: [string, string, string][] = [
    [fitText(shell.name, 2.4, vehicleWidth), "", ""],
    [fitText(catalogChassis.name, 2.4, vehicleWidth), "", ""],
    ["Wheelbase", formatLength(wheelbase, units), ""],
    ...VEHICLE_FIELDS.map(({ field, label }): [string, string, string] => {
      const origin =
        doc.vehicle[field] !== undefined
          ? "your number"
          : shell.provenance[`chassis.${catalogChassis.id}.${field}`]?.source === ESTIMATED
            ? "estimate"
            : "published";
      return [label, mass(chassis[field]), origin];
    }),
  ];
  vehicleRows.forEach(([label, value, origin], row) => {
    const base = tableTop + ROW_HEIGHT + (row + 1) * 4.6 - 1.2;
    text(vehicleLeft, base, label);
    if (value) text(valueEnd, base, value, { anchor: "end" });
    if (origin) text(valueEnd + 3, base, origin, { size: 2.2, gray: 0.35 });
  });

  // Every load, front to rear, with its share on each axle.
  const tableWidth = (right - left - 8 - COLUMN_GAP * (COLUMNS - 1)) / COLUMNS;
  const loadsTop = tableTop + 54;
  const rowsPerColumn = Math.max(2, Math.floor((bottom - 5 - loadsTop - ROW_HEIGHT) / ROW_HEIGHT));
  const room = rowsPerColumn * COLUMNS - 2;

  let rows: LoadRow[] = loads.map((load) => {
    const position = load.cg.x - shell.frontAxleX;
    const rear = (load.mass * position) / wheelbase;
    let name: string;
    if (load.id.startsWith(OCCUPANT_PREFIX)) {
      name = occupantName(Number(load.id.slice(OCCUPANT_PREFIX.length)));
    } else {
      const part = doc.parts[load.id];
      name = part ? partName(requireDefinition(definitions, part.defId), part) : load.id;
    }
    return { name, mass: load.mass, position, front: load.mass - rear, rear };
  });
  if (rows.length > room) {
    // Too many to list: the lightest ones are added up into one line, at their shared
    // centre of gravity, so the columns still sum to the totals.
    const byMass = [...rows].sort((a, b) => b.mass - a.mass);
    const kept = byMass.slice(0, room - 1);
    const merged = byMass.slice(room - 1);
    const total = merged.reduce((sum, row) => sum + row.mass, 0);
    const rear = merged.reduce((sum, row) => sum + row.rear, 0);
    rows = [
      ...kept,
      {
        name: `${merged.length} lighter items`,
        mass: total,
        position: total > 0 ? (rear * wheelbase) / total : null,
        front: total - rear,
        rear,
      },
    ];
  }
  rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
  rows = [
    {
      name: "Empty van",
      mass: chassis.curbFront + chassis.curbRear,
      position: null,
      front: chassis.curbFront,
      rear: chassis.curbRear,
    },
    ...rows,
    {
      name: "Total",
      mass: report.gross.load,
      position: report.cgBehindFrontAxle,
      front: report.front.load,
      rear: report.rear.load,
      bold: true,
    },
  ];

  const columnCount = Math.max(1, Math.ceil(rows.length / rowsPerColumn));
  for (let column = 0; column < columnCount; column++) {
    const tableLeft = left + 4 + column * (tableWidth + COLUMN_GAP);
    const edges: number[] = [];
    let cursor = tableLeft;
    for (const share of COLUMN_SHARE) {
      cursor += share * tableWidth;
      edges.push(cursor);
    }
    const cellEnd = (i: number) => (edges[i] ?? tableLeft) - 1;
    const titleBase = loadsTop + ROW_HEIGHT - 1.3;
    COLUMN_TITLES.forEach((title, i) => {
      if (i === 0) text(tableLeft + 1, titleBase, title, { size: 2.2, bold: true });
      else text(cellEnd(i), titleBase, title, { size: 2.2, bold: true, anchor: "end" });
    });
    items.push({
      type: "line",
      x1: tableLeft,
      y1: loadsTop + ROW_HEIGHT,
      x2: tableLeft + tableWidth,
      y2: loadsTop + ROW_HEIGHT,
      stroke: INK,
    });
    rows.slice(column * rowsPerColumn, (column + 1) * rowsPerColumn).forEach((row, index) => {
      const base = loadsTop + ROW_HEIGHT * (index + 2) - 1.3;
      const style = { size: 2.2, bold: row.bold ?? false };
      text(tableLeft + 1, base, fitText(row.name, 2.2, COLUMN_SHARE[0] * tableWidth - 2), style);
      text(cellEnd(1), base, mass(row.mass), { ...style, anchor: "end" });
      if (row.position !== null) {
        text(cellEnd(2), base, formatLength(Math.round(row.position), units), {
          ...style,
          anchor: "end",
        });
      }
      text(cellEnd(3), base, mass(row.front), { ...style, anchor: "end" });
      text(cellEnd(4), base, mass(row.rear), { ...style, anchor: "end" });
      items.push({
        type: "line",
        x1: tableLeft,
        y1: loadsTop + ROW_HEIGHT * (index + 2),
        x2: tableLeft + tableWidth,
        y2: loadsTop + ROW_HEIGHT * (index + 2),
        stroke: FAINT,
      });
    });
  }

  text(
    right - 4,
    bottom - 2,
    "Each load is a point mass at the centre of its box, on level ground. A load behind the rear axle takes weight off the front axle.",
    { size: 2, anchor: "end", gray: 0.35 },
  );

  return {
    width: page.width,
    height: page.height,
    title: `${doc.name} - weight estimate`,
    items,
  };
}
