/** Money is stored in minor units (cents) everywhere in the model. */

/** `$1,200` or `$12.50`: cents are only shown when there are some. */
export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

export type ParsedMoney = { ok: true; minor: number } | { ok: false; error: string };

const MONEY_RE = /^(\d+\.?\d{0,2}|\.\d{1,2})$/;

/** Parse a typed price: `1200`, `$1,200`, `12.50`. Zero is allowed (free or salvaged). */
export function parseMoney(input: string): ParsedMoney {
  const text = input
    .trim()
    .replace(/^[$\u20ac\u00a3]\s*/, "")
    .replace(/,/g, "");
  if (text === "") return { ok: false, error: "Enter a price" };
  if (!MONEY_RE.test(text)) {
    return { ok: false, error: `Cannot read "${input.trim()}" as a price` };
  }
  return { ok: true, minor: Math.round(Number(text) * 100) };
}
