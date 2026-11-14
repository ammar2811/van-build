import { jsPDF } from "jspdf";
import type { Drawing, Stroke } from "./ir";

const PT_PER_MM = 72 / 25.4;

function level(gray: number): number {
  return Math.round(Math.min(Math.max(gray, 0), 1) * 255);
}

/**
 * Render drawings as one vector PDF, a page per drawing. Kept behind its own entry point
 * (`@vanbuild/core/pdf`) so the PDF library is only loaded when someone actually exports.
 */
export function drawingsToPdf(drawings: readonly Drawing[], title?: string): ArrayBuffer {
  const [first, ...rest] = drawings;
  if (!first) throw new Error("A PDF needs at least one drawing");
  const orientation = (drawing: Drawing) =>
    drawing.width >= drawing.height ? "landscape" : "portrait";
  const pdf = new jsPDF({
    unit: "mm",
    format: [first.width, first.height],
    orientation: orientation(first),
    compress: false,
  });
  pdf.setProperties({ title: title ?? first.title, creator: "Van Build" });
  paint(pdf, first);
  for (const drawing of rest) {
    pdf.addPage([drawing.width, drawing.height], orientation(drawing));
    paint(pdf, drawing);
  }
  return pdf.output("arraybuffer");
}

/** Render one drawing as a single-page vector PDF. */
export function drawingToPdf(drawing: Drawing): ArrayBuffer {
  return drawingsToPdf([drawing]);
}

function paint(pdf: jsPDF, drawing: Drawing): void {
  pdf.setLineCap("round");
  pdf.setLineJoin("round");

  const applyStroke = (stroke: Stroke) => {
    pdf.setLineWidth(stroke.width);
    pdf.setDrawColor(level(stroke.gray));
    pdf.setLineDashPattern(stroke.dash ?? [], 0);
  };
  const paintStyle = (stroke: Stroke | undefined, fill: number | undefined) => {
    if (stroke) applyStroke(stroke);
    if (fill !== undefined) {
      const v = level(fill);
      pdf.setFillColor(v, v, v);
    }
    if (stroke && fill !== undefined) return "FD";
    return fill !== undefined ? "F" : "S";
  };

  for (const item of drawing.items) {
    switch (item.type) {
      case "line":
        applyStroke(item.stroke);
        pdf.line(item.x1, item.y1, item.x2, item.y2);
        break;
      case "rect":
        pdf.rect(item.x, item.y, item.w, item.h, paintStyle(item.stroke, item.fill));
        break;
      case "polygon": {
        const [first, ...rest] = item.points;
        if (!first) break;
        let previous = first;
        const deltas = rest.map((point) => {
          const delta = [point[0] - previous[0], point[1] - previous[1]];
          previous = point;
          return delta;
        });
        pdf.lines(deltas, first[0], first[1], [1, 1], paintStyle(item.stroke, item.fill), true);
        break;
      }
      case "text": {
        pdf.setFont("helvetica", item.bold ? "bold" : "normal");
        pdf.setFontSize(item.size * PT_PER_MM);
        pdf.setTextColor(level(item.gray ?? 0));
        const align =
          item.anchor === "middle" ? "center" : item.anchor === "end" ? "right" : "left";
        // jsPDF rotates counter-clockwise; the drawing IR (like SVG) rotates clockwise.
        pdf.text(item.text, item.x, item.y, { align, angle: item.rotate ? -item.rotate : 0 });
        break;
      }
    }
  }
}
