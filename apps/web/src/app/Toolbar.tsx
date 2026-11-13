import type { UnitSystem } from "@vanbuild/core";
import { useState } from "react";
import { exportPdf } from "../export/exportPdf";
import { useDocStore } from "../state/docStore";
import { useShell } from "../state/selectors";
import { useUiStore } from "../state/uiStore";
import { DownloadIcon, RedoIcon, UndoIcon } from "../ui/icons";

const UNIT_OPTIONS: { value: UnitSystem; label: string; name: string }[] = [
  { value: "metric", label: "mm", name: "Millimetres" },
  { value: "imperial", label: "in", name: "Inches" },
];

export function Toolbar() {
  const name = useDocStore((state) => state.doc.name);
  const canUndo = useDocStore((state) => state.past.length > 0);
  const canRedo = useDocStore((state) => state.future.length > 0);
  const undo = useDocStore((state) => state.undo);
  const redo = useDocStore((state) => state.redo);
  const units = useUiStore((state) => state.units);
  const setUnits = useUiStore((state) => state.setUnits);
  const shell = useShell();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await exportPdf(useDocStore.getState().doc, units);
    } catch (error) {
      console.error(error);
      setExportError("Could not create the PDF. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="toolbar">
      <div className="toolbar-title">
        <span className="wordmark">Van Build</span>
        <span className="toolbar-design" data-testid="design-name">
          {name}
        </span>
        <span className="toolbar-shell">{shell.name}</span>
      </div>

      <div className="toolbar-actions">
        {exportError && (
          <span className="toolbar-error" role="alert">
            {exportError}
          </span>
        )}
        <div className="button-group">
          <button
            type="button"
            className="icon-button"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            data-testid="undo"
            disabled={!canUndo}
            onClick={undo}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            data-testid="redo"
            disabled={!canRedo}
            onClick={redo}
          >
            <RedoIcon />
          </button>
        </div>

        <fieldset className="segmented" aria-label="Units">
          {UNIT_OPTIONS.map((option) => (
            <label key={option.value} title={option.name}>
              <input
                type="radio"
                name="units"
                value={option.value}
                checked={units === option.value}
                data-testid={`units-${option.value}`}
                onChange={() => setUnits(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>

        <button
          type="button"
          className="button button--primary"
          data-testid="export-pdf"
          disabled={exporting}
          onClick={onExport}
        >
          <DownloadIcon />
          <span className="button-label">{exporting ? "Exporting" : "Export PDF"}</span>
        </button>
      </div>
    </header>
  );
}
