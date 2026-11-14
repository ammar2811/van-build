import { type DefinitionLookup, partBox, partName, requireDefinition } from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import type { VanShell } from "../schema/shell";
import { interiorHeightAt } from "../shell/geometry";
import { formatLength } from "../units/length";
import { type DrawItem, type Drawing, dimension, INK, THIN } from "./ir";
import { partsInDrawingOrder } from "./plan";
import { type SheetOptions, sheetArea, textWidth, titleBlock, unitNote } from "./sheet";

const SCALES = [10, 15, 20, 25, 30, 40, 50] as const;
const NUMBER_SIZE = 3.2;
const NAME_SIZE = 2.2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * One landscape page: the van seen from the driver side, front at the left like the floor
 * plan. It shows what the plan cannot: how high things sit and what is above what. Parts
 * carry the same numbers as on the floor plan.
 */
export function elevationDrawing(
  doc: DesignDoc,
  shell: VanShell,
  definitions: DefinitionLookup,
  options: SheetOptions,
): Drawing {
  const units = options.units;
  const area = sheetArea(options);
  const { page, left, right, top, bottom } = area;
  const numbers = new Map(partsInDrawingOrder(doc).map((part, index) => [part.id, index + 1]));
  // Passenger side first, so parts nearer the viewer (the driver side) are drawn on top.
  const parts = Object.values(doc.parts)
    .map((part) => ({ part, box: partBox(part) }))
    .sort((a, b) => b.box.min.y - a.box.min.y || a.part.id.localeCompare(b.part.id));

  const length = shell.cargoLength;
  const ceiling = Math.max(interiorHeightAt(shell, 0), interiorHeightAt(shell, length));
  // Roof-mounted parts stand above the ceiling and need room on the sheet too.
  const highest = Math.max(ceiling, ...parts.map(({ box }) => box.max.z));

  const drawLeft = left + 16;
  const drawTop = top + 9;
  // Below the floor: the rear axle mark, the length dimension and the FRONT / REAR labels.
  const below = 26;
  const scale =
    SCALES.find(
      (s) => drawLeft + length / s <= right - 6 && drawTop + highest / s + below <= bottom,
    ) ?? 50;
  const floor = drawTop + highest / scale;
  const px = (x: number) => drawLeft + x / scale;
  const pz = (z: number) => floor - z / scale;

  const items: DrawItem[] = titleBlock(
    area,
    {
      name: doc.name,
      subtitle: `${shell.name} - side elevation from the driver side`,
      caution: "Planning estimate. Measure your own van before cutting.",
      headline: `Scale 1:${scale}`,
      note: unitNote(units),
    },
    options,
  );

  // Interior outline: floor, front wall, ceiling through every station, rear doors.
  const outline: [number, number][] = [
    [px(0), pz(0)],
    [px(0), pz(interiorHeightAt(shell, 0))],
    ...shell.stations
      .filter((station) => station.x > 0 && station.x < length)
      .map((station): [number, number] => [px(station.x), pz(interiorHeightAt(shell, station.x))]),
    [px(length), pz(interiorHeightAt(shell, length))],
    [px(length), pz(0)],
  ];
  items.push({ type: "polygon", points: outline, stroke: { width: 0.6, gray: 0 }, fill: 1 });

  const well = shell.wheelWells[0];
  if (well) {
    const w = (well.max.x - well.min.x) / scale;
    const h = well.max.z / scale;
    items.push({
      type: "rect",
      x: px(well.min.x),
      y: pz(well.max.z),
      w,
      h,
      stroke: THIN,
      fill: 0.8,
    });
    if (textWidth("wheel well", 1.8) < w - 1 && h > 3) {
      items.push({
        type: "text",
        x: px(well.min.x) + w / 2,
        y: pz(well.max.z) + h / 2 + 0.6,
        text: "wheel well",
        size: 1.8,
        anchor: "middle",
        gray: 0.3,
      });
    }
  }

  const rects = parts.map(({ box }) => ({
    x: px(box.min.x),
    y: pz(box.max.z),
    w: (box.max.x - box.min.x) / scale,
    h: (box.max.z - box.min.z) / scale,
  }));
  // Where a number outside its part may not go: over any part, the wheel well or another number.
  const taken: Rect[] = [...rects];
  if (well) {
    taken.push({
      x: px(well.min.x),
      y: pz(well.max.z),
      w: (well.max.x - well.min.x) / scale,
      h: well.max.z / scale,
    });
  }
  parts.forEach(({ part }, index) => {
    const rect = rects[index];
    if (!rect) return;
    items.push({ type: "rect", ...rect, stroke: INK, fill: 0.93 });

    // A label is only printed where no nearer part covers it: first the middle of the part,
    // then its corners. A part hidden behind others is still identified on the floor plan.
    const number = String(numbers.get(part.id) ?? "");
    const name = partName(requireDefinition(definitions, part.defId), part);
    const nearer = rects.slice(index + 1);
    const clear = (box: Rect) =>
      box.x >= rect.x &&
      box.y >= rect.y &&
      box.x + box.w <= rect.x + rect.w &&
      box.y + box.h <= rect.y + rect.h &&
      !nearer.some((other) => overlaps(box, other));

    const nameWidth = textWidth(name, NAME_SIZE);
    const full: Rect = {
      x: rect.x + rect.w / 2 - nameWidth / 2 - 0.5,
      y: rect.y + rect.h / 2 - 4,
      w: nameWidth + 1,
      h: 8,
    };
    if (clear(full)) {
      items.push(
        {
          type: "text",
          x: rect.x + rect.w / 2,
          y: rect.y + rect.h / 2 - 0.6,
          text: number,
          size: NUMBER_SIZE,
          anchor: "middle",
          bold: true,
        },
        {
          type: "text",
          x: rect.x + rect.w / 2,
          y: rect.y + rect.h / 2 + 2.8,
          text: name,
          size: NAME_SIZE,
          anchor: "middle",
        },
      );
      return;
    }
    const numberWidth = textWidth(number, NUMBER_SIZE) + 1.4;
    const numberHeight = NUMBER_SIZE + 1;
    const spots: Rect[] = [
      {
        x: rect.x + rect.w / 2 - numberWidth / 2,
        y: rect.y + rect.h / 2 - numberHeight / 2,
        w: numberWidth,
        h: numberHeight,
      },
      { x: rect.x + 0.4, y: rect.y + 0.4, w: numberWidth, h: numberHeight },
      { x: rect.x + rect.w - numberWidth - 0.4, y: rect.y + 0.4, w: numberWidth, h: numberHeight },
      {
        x: rect.x + 0.4,
        y: rect.y + rect.h - numberHeight - 0.4,
        w: numberWidth,
        h: numberHeight,
      },
      {
        x: rect.x + rect.w - numberWidth - 0.4,
        y: rect.y + rect.h - numberHeight - 0.4,
        w: numberWidth,
        h: numberHeight,
      },
    ];
    // A part too thin to hold its number (a solar panel, a bed platform) gets it just outside,
    // above or below, where nothing else is drawn. Not when it is hidden behind another part.
    const hidden = nearer.some(
      (other) =>
        other.x <= rect.x &&
        other.y <= rect.y &&
        other.x + other.w >= rect.x + rect.w &&
        other.y + other.h >= rect.y + rect.h,
    );
    const outside: Rect[] = hidden
      ? []
      : [
          { x: rect.x, y: rect.y - numberHeight - 0.3, w: numberWidth, h: numberHeight },
          {
            x: rect.x + rect.w - numberWidth,
            y: rect.y - numberHeight - 0.3,
            w: numberWidth,
            h: numberHeight,
          },
          { x: rect.x, y: rect.y + rect.h + 0.3, w: numberWidth, h: numberHeight },
          {
            x: rect.x + rect.w - numberWidth,
            y: rect.y + rect.h + 0.3,
            w: numberWidth,
            h: numberHeight,
          },
        ];
    const free = (box: Rect) =>
      box.x >= px(0) &&
      box.x + box.w <= px(length) &&
      box.y >= top + 1 &&
      box.y + box.h <= floor &&
      !taken.some((other) => overlaps(box, other));
    const spot = spots.find(clear) ?? outside.find(free);
    if (spot) {
      taken.push(spot);
      items.push({
        type: "text",
        x: spot.x + spot.w / 2,
        y: spot.y + spot.h - 0.9,
        text: number,
        size: NUMBER_SIZE,
        anchor: "middle",
        bold: true,
      });
    }
  });

  // Rear axle, overall dimensions and orientation.
  const axle = px(shell.rearAxleX);
  if (shell.rearAxleX > 0 && shell.rearAxleX < length) {
    items.push({ type: "line", x1: axle, y1: floor, x2: axle, y2: floor + 2.5, stroke: INK });
    items.push({
      type: "text",
      x: axle,
      y: floor + 5.4,
      text: "rear axle",
      size: 2,
      anchor: "middle",
      gray: 0.3,
    });
  }
  items.push(
    ...dimension([px(0), floor], [px(length), floor], 11, formatLength(length, units)),
    ...dimension(
      [px(0), pz(interiorHeightAt(shell, 0))],
      [px(0), floor],
      -8,
      formatLength(interiorHeightAt(shell, 0), units),
    ),
  );
  items.push({
    type: "text",
    x: px(0),
    y: floor + 17,
    text: "FRONT (cab)",
    size: 2.4,
    anchor: "start",
    bold: true,
  });
  items.push({
    type: "text",
    x: px(length),
    y: floor + 17,
    text: "REAR (doors)",
    size: 2.4,
    anchor: "end",
    bold: true,
  });
  items.push({
    type: "text",
    x: right - 4,
    y: bottom - 2,
    text: "Part numbers match the floor plan, which lists every part's size and height off the floor.",
    size: 2,
    anchor: "end",
    gray: 0.35,
  });

  return {
    width: page.width,
    height: page.height,
    title: `${doc.name} - side elevation`,
    items,
  };
}
