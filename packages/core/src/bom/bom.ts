import {
  type DefinitionLookup,
  partDimensions,
  partName,
  partPrice,
  requireDefinition,
} from "../parts/parts";
import type { DesignDoc } from "../schema/design";
import type { PartCategory } from "../schema/part";
import { MM_PER_INCH, type UnitSystem } from "../units/length";

/**
 * Bill of materials. One line per distinct thing to buy or build: parts that share a
 * definition, name, size and unit price are counted together.
 */

export interface BomLine {
  defId: string;
  name: string;
  category: PartCategory;
  /** The part's own dimensions in mm. */
  width: number;
  depth: number;
  height: number;
  quantity: number;
  /** Minor units (cents). */
  unitPrice: number;
  total: number;
  currency: string;
  url?: string;
  /** The parts in the design this line stands for, in a stable order. */
  partIds: string[];
}

export interface Bom {
  lines: BomLine[];
  /** Number of parts. */
  count: number;
  /** Minor units. */
  total: number;
  currency: string;
}

/** The order categories are listed in, roughly the order a build goes in. */
const CATEGORY_ORDER: PartCategory[] = [
  "opening",
  "climate",
  "electrical",
  "water",
  "bed",
  "galley",
  "storage",
  "seating",
  "appliance",
  "load",
];

export function buildBom(doc: DesignDoc, definitions: DefinitionLookup): Bom {
  const byKey = new Map<string, BomLine>();
  for (const id of Object.keys(doc.parts).sort()) {
    const part = doc.parts[id];
    if (!part) continue;
    const def = requireDefinition(definitions, part.defId);
    const { width, depth, height } = partDimensions(part);
    const name = partName(def, part);
    const unitPrice = partPrice(def, part);
    const key = [def.id, name, width, depth, height, unitPrice].join("|");
    const line = byKey.get(key);
    if (line) {
      line.quantity += 1;
      line.total += unitPrice;
      line.partIds.push(id);
      continue;
    }
    const created: BomLine = {
      defId: def.id,
      name,
      category: def.category,
      width,
      depth,
      height,
      quantity: 1,
      unitPrice,
      total: unitPrice,
      currency: def.price.currency,
      partIds: [id],
    };
    if (def.url) created.url = def.url;
    byKey.set(key, created);
  }

  const lines = [...byKey.values()].sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category) ||
      a.name.localeCompare(b.name) ||
      b.width * b.depth * b.height - a.width * a.depth * a.height ||
      a.unitPrice - b.unitPrice,
  );
  return {
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: lines.reduce((sum, line) => sum + line.total, 0),
    currency: lines[0]?.currency ?? "USD",
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(minor: number): string {
  return (minor / 100).toFixed(2);
}

/** Plain numbers for a spreadsheet: mm as written, inches to two decimals. */
function dimension(mm: number, units: UnitSystem): string {
  if (units === "metric") return String(Math.round(mm * 10) / 10);
  return (mm / MM_PER_INCH).toFixed(2);
}

/** The bill of materials as CSV (RFC 4180), ready for a spreadsheet. */
export function bomToCsv(bom: Bom, units: UnitSystem): string {
  const unit = units === "metric" ? "mm" : "in";
  const rows: (string | number)[][] = [
    [
      "Quantity",
      "Part",
      "Category",
      `Width (${unit})`,
      `Depth (${unit})`,
      `Height (${unit})`,
      `Unit price (${bom.currency})`,
      `Total (${bom.currency})`,
      "Link",
    ],
    ...bom.lines.map((line) => [
      line.quantity,
      line.name,
      line.category,
      dimension(line.width, units),
      dimension(line.depth, units),
      dimension(line.height, units),
      money(line.unitPrice),
      money(line.total),
      line.url ?? "",
    ]),
    [bom.count, "Total", "", "", "", "", "", money(bom.total), ""],
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
