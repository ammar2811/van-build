import type { UnitSystem } from "@vanbuild/core";
import { useRef, useState } from "react";
import { exportPdf } from "../export/exportPdf";
import type { SaveStatus } from "../persistence/autosave";
import { renameDesign } from "../state/actions";
import { useDocStore } from "../state/docStore";
import { useShell } from "../state/selectors";
import { useUiStore } from "../state/uiStore";
import { DownloadIcon, RedoIcon, UndoIcon } from "../ui/icons";

const UNIT_OPTIONS: { value: UnitSystem; label: string; name: string }[] = [
  { value: "metric", label: "mm", name: "Millimetres" },
  { value: "imperial", label: "in", name: "Inches" },
];

const SAVE_LABEL: Record<SaveStatus, string> = {
  saved: "Saved on this device",
  pending: "Saving",
  saving: "Saving",
  failed: "Not saved",
};

/** The design's name. Click it to rename; Enter applies, Escape cancels. */
function DesignName() {
  const name = useDocStore((state) => state.doc.name);
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  if (draft === null) {
    return (
      <button
        type="button"
        className="toolbar-design"
        data-testid="design-name"
        title="Rename this design"
        onClick={() => {
          cancelled.current = false;
          setDraft(name);
        }}
      >
        {name}
      </button>
    );
  }
  return (
    <input
      className="toolbar-design-input"
      data-testid="design-name-input"
      aria-label="Design name"
      value={draft}
      maxLength={60}
      // biome-ignore lint/a11y/noAutofocus: the field replaces the button that was just pressed
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        if (!cancelled.current) renameDesign(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

export function Toolbar() {
  const canUndo = useDocStore((state) => state.past.length > 0);
  const canRedo = useDocStore((state) => state.future.length > 0);
  const undo = useDocStore((state) => state.undo);
  const redo = useDocStore((state) => state.redo);
  const units = useUiStore((state) => state.units);
  const setUnits = useUiStore((state) => state.setUnits);
  const saveStatus = useUiStore((state) => state.saveStatus);
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
        <DesignName />
        <span className="toolbar-shell">{shell.name}</span>
        <span
          className="save-status"
          data-status={saveStatus}
          data-testid="save-status"
          role="status"
          title={
            saveStatus === "failed"
              ? "This browser is not letting the design be saved. Export a PDF to keep a copy."
              : undefined
          }
        >
          <span className="save-dot" aria-hidden="true" />
          <span className="save-text">{SAVE_LABEL[saveStatus]}</span>
        </span>
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
          aria-label="Export PDF"
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
