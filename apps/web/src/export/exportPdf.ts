import { getPartDefinition, getShell } from "@vanbuild/catalog";
import { type DesignDoc, planDrawing, type UnitSystem } from "@vanbuild/core";

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "van-layout"}-floor-plan.pdf`;
}

/** Build the floor plan sheet and hand it to the browser as a download. */
export async function exportPdf(doc: DesignDoc, units: UnitSystem): Promise<void> {
  // The PDF writer is loaded on demand so it never slows down opening the editor.
  const { drawingToPdf } = await import("@vanbuild/core/pdf");
  const drawing = planDrawing(doc, getShell(doc.shellId), getPartDefinition, {
    units,
    date: new Date().toISOString().slice(0, 10),
  });
  const url = URL.createObjectURL(new Blob([drawingToPdf(drawing)], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(doc.name);
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
