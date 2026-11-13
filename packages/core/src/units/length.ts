/**
 * Lengths are stored in millimetres everywhere in the model. Inches and feet exist only at
 * the UI edge: `parseLength` turns what a person typed into mm, `formatLength` turns mm back
 * into something a person would write on a cut list.
 */

export type UnitSystem = "metric" | "imperial";

export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

/** Imperial lengths are displayed to the nearest 1/16 inch. */
export const IMPERIAL_DENOMINATOR = 16;

/** Round to 0.001 mm so float noise never reaches a stored document. */
export function quantizeMm(mm: number): number {
  const q = Math.round(mm * 1000) / 1000;
  return q === 0 ? 0 : q;
}

export type ParsedLength =
  | { ok: true; kind: "absolute" | "relative"; mm: number }
  | { ok: false; error: string };

const NUM = String.raw`(?:\d+\.?\d*|\.\d+)`;
const MIXED_RE = new RegExp(`^(?:(${NUM})\\s+)?(${NUM})\\s*/\\s*(${NUM})$`);
const PLAIN_RE = new RegExp(`^${NUM}$`);
const FEET_RE = /^(.+?)\s*(?:'|ft|feet|foot)\s*(?:(.+?)\s*(?:"|in|inch|inches)?)?$/;
const UNIT_RE = /^(.+?)\s*(mm|cm|m|"|in|inch|inches)?$/;

const UNIT_TO_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  '"': MM_PER_INCH,
  in: MM_PER_INCH,
  inch: MM_PER_INCH,
  inches: MM_PER_INCH,
};

/** "600", "23.5", "5/8", "23 5/8" and "1200/2" all resolve to a plain number. */
function parseNumber(text: string): number | null {
  const s = text.trim();
  if (PLAIN_RE.test(s)) return Number(s);
  const m = MIXED_RE.exec(s);
  if (!m) return null;
  const whole = m[1] === undefined ? 0 : Number(m[1]);
  const denominator = Number(m[3]);
  if (denominator === 0) return null;
  return whole + Number(m[2]) / denominator;
}

function parseQuantity(text: string, system: UnitSystem): number | null {
  const s = text.trim();
  if (s === "") return null;

  const feet = FEET_RE.exec(s);
  if (feet?.[1] !== undefined) {
    const ft = parseNumber(feet[1]);
    if (ft === null) return null;
    if (feet[2] === undefined) return ft * MM_PER_FOOT;
    const inches = parseNumber(feet[2]);
    if (inches === null) return null;
    return ft * MM_PER_FOOT + inches * MM_PER_INCH;
  }

  const m = UNIT_RE.exec(s);
  if (m?.[1] === undefined) return null;
  const value = parseNumber(m[1]);
  if (value === null) return null;
  const factor = m[2] === undefined ? (system === "metric" ? 1 : MM_PER_INCH) : UNIT_TO_MM[m[2]];
  if (factor === undefined) return null;
  return value * factor;
}

/**
 * Parse a typed length. Accepts `600`, `600mm`, `60 cm`, `1.2m`, `23 5/8"`, `23.5in`,
 * `2' 3"`, `1200/2` and sums such as `600 + 18`. A leading `+` or `-` makes the result
 * relative (a nudge from the current value). A bare number uses the active unit system.
 */
export function parseLength(input: string, system: UnitSystem): ParsedLength {
  let s = input.trim().toLowerCase().replace(/[″“”]/g, '"').replace(/[′‘’]/g, "'");
  if (s === "") return { ok: false, error: "Enter a length" };

  let relative = false;
  let leadingSign = 1;
  if (s.startsWith("+") || s.startsWith("-")) {
    relative = true;
    leadingSign = s.startsWith("-") ? -1 : 1;
    s = s.slice(1);
  }

  // Split into terms on + and -, keeping the sign of each term.
  const terms: { sign: number; text: string }[] = [];
  let sign = leadingSign;
  let current = "";
  for (const ch of s) {
    if (ch === "+" || ch === "-") {
      terms.push({ sign, text: current });
      sign = ch === "-" ? -1 : 1;
      current = "";
    } else {
      current += ch;
    }
  }
  terms.push({ sign, text: current });

  let total = 0;
  for (const term of terms) {
    const mm = parseQuantity(term.text, system);
    if (mm === null) return { ok: false, error: `Cannot read "${input.trim()}" as a length` };
    total += term.sign * mm;
  }
  if (!Number.isFinite(total)) return { ok: false, error: "Length is out of range" };
  return { ok: true, kind: relative ? "relative" : "absolute", mm: quantizeMm(total) };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** Format inches as a builder would write them: `23 5/8"`, `3/4"`, `24"`. */
export function formatInches(mm: number): string {
  const totalParts = Math.round((Math.abs(mm) / MM_PER_INCH) * IMPERIAL_DENOMINATOR);
  const sign = mm < 0 && totalParts !== 0 ? "-" : "";
  const whole = Math.floor(totalParts / IMPERIAL_DENOMINATOR);
  const rest = totalParts % IMPERIAL_DENOMINATOR;
  if (rest === 0) return `${sign}${whole}"`;
  const divisor = gcd(rest, IMPERIAL_DENOMINATOR);
  const fraction = `${rest / divisor}/${IMPERIAL_DENOMINATOR / divisor}`;
  return whole === 0 ? `${sign}${fraction}"` : `${sign}${whole} ${fraction}"`;
}

/** Format millimetres to at most one decimal: `600 mm`, `600.5 mm`. */
export function formatMillimetres(mm: number): string {
  const rounded = Math.round(mm * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text === "-0" ? "0" : text} mm`;
}

export function formatLength(mm: number, system: UnitSystem): string {
  return system === "metric" ? formatMillimetres(mm) : formatInches(mm);
}

/** Compact "W x D" style size label, e.g. `1200 x 600 mm` or `47 1/4" x 23 5/8"`. */
export function formatSize(dimensionsMm: readonly number[], system: UnitSystem): string {
  if (system === "imperial") return dimensionsMm.map(formatInches).join(" x ");
  const parts = dimensionsMm.map((mm) => formatMillimetres(mm).replace(" mm", ""));
  return `${parts.join(" x ")} mm`;
}

/** Arrow-key nudge step for the active unit system: fine, or coarse with Shift. */
export function nudgeStepMm(system: UnitSystem, coarse: boolean): number {
  if (system === "metric") return coarse ? 10 : 1;
  return coarse ? MM_PER_INCH : MM_PER_INCH / IMPERIAL_DENOMINATOR;
}
