/**
 * A drawing is a flat list of primitives in paper millimetres (origin top-left, y down).
 * It is the single description of an export page: the SVG and PDF backends both render it,
 * so the two outputs cannot disagree.
 */

export interface Stroke {
  /** Line width in mm. */
  width: number;
  /** 0 = black, 1 = white. */
  gray: number;
  /** Dash and gap lengths in mm. */
  dash?: [number, number];
}

export type DrawItem =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; stroke: Stroke }
  | {
      type: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      stroke?: Stroke;
      /** Fill gray level, 0 = black, 1 = white. */
      fill?: number;
    }
  | { type: "polygon"; points: [number, number][]; stroke?: Stroke; fill?: number }
  | {
      type: "text";
      x: number;
      y: number;
      text: string;
      /** Cap height-ish font size in mm. */
      size: number;
      anchor: "start" | "middle" | "end";
      bold?: boolean;
      /** Clockwise rotation in degrees about (x, y). */
      rotate?: number;
      gray?: number;
    };

export interface Drawing {
  /** Page size in mm. */
  width: number;
  height: number;
  title: string;
  items: DrawItem[];
}

export const INK: Stroke = { width: 0.35, gray: 0 };
export const THIN: Stroke = { width: 0.18, gray: 0 };
export const FAINT: Stroke = { width: 0.18, gray: 0.55 };

/**
 * A horizontal or vertical dimension: two extension lines, a dimension line with tick marks
 * and a centred label. `offset` is how far the dimension line sits from the measured points
 * (positive = down for horizontal, right for vertical).
 */
export function dimension(
  a: [number, number],
  b: [number, number],
  offset: number,
  label: string,
  textSize = 2.4,
): DrawItem[] {
  const horizontal = Math.abs(a[1] - b[1]) < 1e-6;
  const tick = 0.9;
  const over = Math.sign(offset) * 1.2;
  if (horizontal) {
    const y = a[1] + offset;
    return [
      { type: "line", x1: a[0], y1: a[1], x2: a[0], y2: y + over, stroke: THIN },
      { type: "line", x1: b[0], y1: b[1], x2: b[0], y2: y + over, stroke: THIN },
      { type: "line", x1: a[0], y1: y, x2: b[0], y2: y, stroke: THIN },
      { type: "line", x1: a[0] - tick, y1: y + tick, x2: a[0] + tick, y2: y - tick, stroke: INK },
      { type: "line", x1: b[0] - tick, y1: y + tick, x2: b[0] + tick, y2: y - tick, stroke: INK },
      {
        type: "text",
        x: (a[0] + b[0]) / 2,
        y: y - 1,
        text: label,
        size: textSize,
        anchor: "middle",
      },
    ];
  }
  const x = a[0] + offset;
  return [
    { type: "line", x1: a[0], y1: a[1], x2: x + over, y2: a[1], stroke: THIN },
    { type: "line", x1: b[0], y1: b[1], x2: x + over, y2: b[1], stroke: THIN },
    { type: "line", x1: x, y1: a[1], x2: x, y2: b[1], stroke: THIN },
    { type: "line", x1: x - tick, y1: a[1] + tick, x2: x + tick, y2: a[1] - tick, stroke: INK },
    { type: "line", x1: x - tick, y1: b[1] + tick, x2: x + tick, y2: b[1] - tick, stroke: INK },
    {
      type: "text",
      x: x - 1,
      y: (a[1] + b[1]) / 2,
      text: label,
      size: textSize,
      anchor: "middle",
      rotate: -90,
    },
  ];
}
