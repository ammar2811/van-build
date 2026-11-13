import type { DrawItem, Drawing, Stroke } from "./ir";

/** Fixed two-decimal formatting keeps the output byte-stable for golden tests. */
function n(value: number): string {
  const text = value.toFixed(2).replace(/\.?0+$/, "");
  return text === "-0" || text === "" ? "0" : text;
}

function gray(level: number): string {
  const v = Math.round(Math.min(Math.max(level, 0), 1) * 255);
  return `rgb(${v},${v},${v})`;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function strokeAttrs(stroke: Stroke | undefined): string {
  if (!stroke) return ' stroke="none"';
  const dash = stroke.dash ? ` stroke-dasharray="${n(stroke.dash[0])} ${n(stroke.dash[1])}"` : "";
  return ` stroke="${gray(stroke.gray)}" stroke-width="${n(stroke.width)}"${dash}`;
}

function fillAttr(fill: number | undefined): string {
  return ` fill="${fill === undefined ? "none" : gray(fill)}"`;
}

function itemToSvg(item: DrawItem): string {
  switch (item.type) {
    case "line":
      return `<line x1="${n(item.x1)}" y1="${n(item.y1)}" x2="${n(item.x2)}" y2="${n(item.y2)}"${strokeAttrs(item.stroke)}/>`;
    case "rect":
      return `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.w)}" height="${n(item.h)}"${fillAttr(item.fill)}${strokeAttrs(item.stroke)}/>`;
    case "polygon": {
      const points = item.points.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
      return `<polygon points="${points}"${fillAttr(item.fill)}${strokeAttrs(item.stroke)}/>`;
    }
    case "text": {
      const rotate = item.rotate
        ? ` transform="rotate(${n(item.rotate)} ${n(item.x)} ${n(item.y)})"`
        : "";
      const weight = item.bold ? ' font-weight="bold"' : "";
      return `<text x="${n(item.x)}" y="${n(item.y)}" font-size="${n(item.size)}" text-anchor="${item.anchor}" fill="${gray(item.gray ?? 0)}"${weight}${rotate}>${escapeXml(item.text)}</text>`;
    }
  }
}

/** Render a drawing as a standalone SVG document sized in real millimetres. */
export function drawingToSvg(drawing: Drawing): string {
  const lines = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(drawing.width)}mm" height="${n(drawing.height)}mm" viewBox="0 0 ${n(drawing.width)} ${n(drawing.height)}" font-family="Helvetica, Arial, sans-serif" stroke-linecap="round" stroke-linejoin="round">`,
    `<title>${escapeXml(drawing.title)}</title>`,
    `<rect width="${n(drawing.width)}" height="${n(drawing.height)}" fill="rgb(255,255,255)"/>`,
    ...drawing.items.map(itemToSvg),
    "</svg>",
  ];
  return `${lines.join("\n")}\n`;
}
