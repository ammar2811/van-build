import { getPartDefinition, getShell } from "@vanbuild/catalog";
import {
  bomToCsv,
  buildBom,
  buildPack,
  type DesignDoc,
  drawingToSvg,
  planDrawing,
  type UnitSystem,
} from "@vanbuild/core";

export type ExportKind = "pack" | "plan-svg" | "parts-csv";

export const EXPORTS: { kind: ExportKind; label: string; detail: string }[] = [
  {
    kind: "pack",
    label: "Build pack (PDF)",
    detail: "Floor plan, side elevation, weight estimate and parts list",
  },
  { kind: "plan-svg", label: "Floor plan (SVG)", detail: "For editing in a drawing program" },
  { kind: "parts-csv", label: "Parts list (CSV)", detail: "For a spreadsheet" },
];

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "van-layout"
  );
}

function download(data: BlobPart, type: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Build one of the export files from the design and hand it to the browser as a download. */
export async function exportDesign(
  kind: ExportKind,
  doc: DesignDoc,
  units: UnitSystem,
): Promise<void> {
  const shell = getShell(doc.shellId);
  const name = slug(doc.name);
  const date = new Date().toISOString().slice(0, 10);
  switch (kind) {
    case "pack": {
      // The PDF writer is loaded on demand so it never slows down opening the editor.
      const { drawingsToPdf } = await import("@vanbuild/core/pdf");
      const pack = buildPack(doc, shell, getPartDefinition, { units, date });
      download(
        drawingsToPdf(pack, `${doc.name} - build pack`),
        "application/pdf",
        `${name}-build-pack.pdf`,
      );
      return;
    }
    case "plan-svg": {
      const drawing = planDrawing(doc, shell, getPartDefinition, { units, date });
      download(drawingToSvg(drawing), "image/svg+xml", `${name}-floor-plan.svg`);
      return;
    }
    case "parts-csv": {
      const csv = bomToCsv(buildBom(doc, getPartDefinition), units);
      // The byte order mark makes spreadsheet programs read names with accents correctly.
      download(`﻿${csv}`, "text/csv;charset=utf-8", `${name}-parts-list.csv`);
      return;
    }
  }
}
