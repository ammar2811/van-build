import type { UnitSystem } from "../units/length";
import { type DrawItem, INK } from "./ir";

/** Options shared by every sheet of the build pack. */
export interface SheetOptions {
  units: UnitSystem;
  /** Defaults to A4 for metric and US Letter for imperial. */
  paper?: "a4" | "letter";
  /** Printed in the title block. Passed in so the output stays deterministic. */
  date?: string;
  /** Position in a multi-page pack, printed as "sheet 2 of 4". */
  sheet?: { number: number; of: number };
}

export const PAPER = {
  a4: { width: 297, height: 210 },
  letter: { width: 279.4, height: 215.9 },
} as const;

export const MARGIN = 10;
export const TITLE_HEIGHT = 14;

export interface SheetText {
  /** Bold first line of the title block, usually the design's name. */
  name: string;
  /** Second line: which van and which sheet this is. */
  subtitle: string;
  /** The caution printed in the middle of the title block. */
  caution: string;
  /** Bold text at the right, for example the scale. */
  headline: string;
  /** Small text under the headline, before the date and sheet number. */
  note: string;
}

/** The drawable area of a sheet: inside the border and above the title block. */
export interface SheetArea {
  page: { width: number; height: number };
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Helvetica averages about half an em per character. Good enough to decide if a label fits. */
export function textWidth(text: string, size: number): number {
  return text.length * size * 0.52;
}

/** Shorten text with "..." so it fits a width. */
export function fitText(text: string, size: number, width: number): string {
  if (textWidth(text, size) <= width) return text;
  let cut = text.length - 1;
  while (cut > 1 && textWidth(`${text.slice(0, cut)}...`, size) > width) cut--;
  return `${text.slice(0, cut).trimEnd()}...`;
}

export function sheetArea(options: SheetOptions): SheetArea {
  const page = PAPER[options.paper ?? (options.units === "metric" ? "a4" : "letter")];
  return {
    page,
    left: MARGIN,
    right: page.width - MARGIN,
    top: MARGIN,
    bottom: page.height - MARGIN - TITLE_HEIGHT,
  };
}

/** The border and title block every sheet shares. */
export function titleBlock(area: SheetArea, text: SheetText, options: SheetOptions): DrawItem[] {
  const { left, right, top, bottom, page } = area;
  const small = [text.note];
  if (options.date) small.push(options.date);
  if (options.sheet) small.push(`sheet ${options.sheet.number} of ${options.sheet.of}`);
  return [
    { type: "rect", x: left, y: top, w: right - left, h: page.height - 2 * MARGIN, stroke: INK },
    { type: "line", x1: left, y1: bottom, x2: right, y2: bottom, stroke: INK },
    {
      type: "text",
      x: left + 4,
      y: bottom + 6,
      text: text.name,
      size: 4,
      anchor: "start",
      bold: true,
    },
    { type: "text", x: left + 4, y: bottom + 11, text: text.subtitle, size: 2.6, anchor: "start" },
    {
      type: "text",
      x: (left + right) / 2,
      y: bottom + 8.5,
      text: text.caution,
      size: 2.4,
      anchor: "middle",
      gray: 0.35,
    },
    {
      type: "text",
      x: right - 4,
      y: bottom + 6,
      text: text.headline,
      size: 2.8,
      anchor: "end",
      bold: true,
    },
    {
      type: "text",
      x: right - 4,
      y: bottom + 11,
      text: small.join(" - "),
      size: 2.4,
      anchor: "end",
    },
  ];
}

export function unitNote(units: UnitSystem): string {
  return units === "metric" ? "Dimensions in mm" : "Dimensions in inches";
}
