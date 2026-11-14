import type { Bom } from "../bom/bom";
import type { DesignDoc } from "../schema/design";
import type { VanShell } from "../schema/shell";
import { formatSize } from "../units/length";
import { formatMoney } from "../units/money";
import { type DrawItem, type Drawing, FAINT, INK } from "./ir";
import { fitText, type SheetOptions, sheetArea, titleBlock, unitNote } from "./sheet";

const ROW_HEIGHT = 4.6;
/** Share of the table width per column: quantity, part, category, size, unit price, total. */
const COLUMN_SHARE = [0.07, 0.35, 0.14, 0.22, 0.11, 0.11] as const;
const COLUMN_TITLES = ["Qty", "Part", "Category", "W x D x H", "Each", "Total"] as const;
/** Quantity and the two money columns are right-aligned. */
const RIGHT_ALIGNED = [true, false, false, false, true, true] as const;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** How many lines fit on one parts-list sheet, leaving a row for the total. */
function rowsPerSheet(options: SheetOptions): number {
  const { top, bottom } = sheetArea(options);
  return Math.floor((bottom - 5 - (top + 13) - 2 * ROW_HEIGHT) / ROW_HEIGHT);
}

/** How many sheets the parts list takes. */
export function bomSheetCount(bom: Bom, options: SheetOptions): number {
  return Math.max(1, Math.ceil(bom.lines.length / rowsPerSheet(options)));
}

/**
 * The parts list: one line per distinct thing to buy or build, with the total on the last
 * sheet. Long lists continue on further sheets. `options.sheet` numbers the first one.
 */
export function bomDrawings(
  doc: DesignDoc,
  shell: VanShell,
  bom: Bom,
  options: SheetOptions,
): Drawing[] {
  const units = options.units;
  const area = sheetArea(options);
  const { page, left, right, top, bottom } = area;
  const perSheet = rowsPerSheet(options);
  const count = bomSheetCount(bom, options);
  const money = (minor: number) => formatMoney(minor, bom.currency);

  const tableLeft = left + 4;
  const tableWidth = right - left - 8;
  const tableTop = top + 13;
  const edges: number[] = [];
  let cursor = tableLeft;
  for (const share of COLUMN_SHARE) {
    edges.push(cursor);
    cursor += share * tableWidth;
  }
  edges.push(cursor);
  const cellStart = (i: number) => (edges[i] ?? tableLeft) + 1;
  const cellEnd = (i: number) => (edges[i + 1] ?? tableLeft) - 1;
  const cellWidth = (i: number) => (COLUMN_SHARE[i] ?? 0) * tableWidth - 2;

  return Array.from({ length: count }, (_, index) => {
    const first = index === 0;
    const last = index === count - 1;
    const items: DrawItem[] = titleBlock(
      area,
      {
        name: doc.name,
        subtitle: `${shell.name} - parts list${count > 1 ? ` (${index + 1} of ${count})` : ""}`,
        caution: "Catalog prices are rough guides. Check current prices before buying.",
        headline: `${bom.count} ${bom.count === 1 ? "part" : "parts"}, ${money(bom.total)}`,
        note: unitNote(units),
      },
      options.sheet
        ? { ...options, sheet: { ...options.sheet, number: options.sheet.number + index } }
        : options,
    );
    const cell = (
      column: number,
      base: number,
      value: string,
      extra: { bold?: boolean; gray?: number } = {},
    ) => {
      const alignRight = RIGHT_ALIGNED[column] ?? false;
      items.push({
        type: "text",
        x: alignRight ? cellEnd(column) : cellStart(column),
        y: base,
        text: fitText(value, 2.4, cellWidth(column)),
        size: 2.4,
        anchor: alignRight ? "end" : "start",
        ...extra,
      });
    };

    items.push({
      type: "text",
      x: tableLeft,
      y: top + 8,
      text: first ? "Parts list" : "Parts list, continued",
      size: 4,
      anchor: "start",
      bold: true,
    });
    COLUMN_TITLES.forEach((title, column) => {
      cell(column, tableTop + ROW_HEIGHT - 1.4, title, { bold: true });
    });
    items.push({
      type: "line",
      x1: tableLeft,
      y1: tableTop + ROW_HEIGHT,
      x2: tableLeft + tableWidth,
      y2: tableTop + ROW_HEIGHT,
      stroke: INK,
    });

    const lines = bom.lines.slice(index * perSheet, (index + 1) * perSheet);
    lines.forEach((line, row) => {
      const base = tableTop + ROW_HEIGHT * (row + 2) - 1.4;
      cell(0, base, String(line.quantity));
      cell(1, base, line.name);
      cell(2, base, capitalize(line.category));
      cell(3, base, formatSize([line.width, line.depth, line.height], units));
      cell(4, base, money(line.unitPrice));
      cell(5, base, money(line.total));
      items.push({
        type: "line",
        x1: tableLeft,
        y1: tableTop + ROW_HEIGHT * (row + 2),
        x2: tableLeft + tableWidth,
        y2: tableTop + ROW_HEIGHT * (row + 2),
        stroke: FAINT,
      });
    });

    const after = tableTop + ROW_HEIGHT * (lines.length + 1);
    if (bom.lines.length === 0) {
      cell(1, after + ROW_HEIGHT - 1.4, "No parts yet.", { gray: 0.35 });
    } else if (last) {
      items.push({
        type: "line",
        x1: tableLeft,
        y1: after,
        x2: tableLeft + tableWidth,
        y2: after,
        stroke: INK,
      });
      cell(0, after + ROW_HEIGHT - 1.4, String(bom.count), { bold: true });
      cell(1, after + ROW_HEIGHT - 1.4, "Total", { bold: true });
      cell(5, after + ROW_HEIGHT - 1.4, money(bom.total), { bold: true });
    } else {
      cell(1, after + ROW_HEIGHT - 1.4, "Continued on the next sheet.", { gray: 0.35 });
    }

    items.push({
      type: "text",
      x: right - 4,
      y: bottom - 2,
      text: "Parts with the same name, size and price are counted together. A price typed on a part replaces the catalog price.",
      size: 2,
      anchor: "end",
      gray: 0.35,
    });

    return {
      width: page.width,
      height: page.height,
      title: `${doc.name} - parts list`,
      items,
    };
  });
}
