import type { UnitSystem } from "@vanbuild/core";
import { useRef, useState } from "react";
import { copySharedDesign } from "../cloud/session";
import type { SyncStatus } from "../cloud/sync";
import { EXPORTS, type ExportKind, exportDesign } from "../export/exports";
import type { SaveStatus } from "../persistence/autosave";
import type { DesignRepository } from "../persistence/repository";
import { renameDesign } from "../state/actions";
import { useDocStore } from "../state/docStore";
import { useShell } from "../state/selectors";
import { useUiStore } from "../state/uiStore";
import { CopyIcon, DownloadIcon, RedoIcon, UndoIcon } from "../ui/icons";
import { MenuButton } from "../ui/MenuButton";
import { MainMenu } from "./MainMenu";

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

/** What a signed-in person sees. The device copy always comes first, so offline is not an error. */
const SYNC_LABEL: Record<Exclude<SyncStatus, "signedOut">, string> = {
  synced: "Saved to your account",
  syncing: "Saving",
  offline: "Saved on this device, will sync",
  conflict: "Changed on another device",
  error: "Saved on this device, not synced",
};

type StatusTone = "saved" | "pending" | "warn" | "failed";

function useStatus(): { tone: StatusTone; text: string; title?: string } {
  const saveStatus = useUiStore((state) => state.saveStatus);
  const syncStatus = useUiStore((state) => state.syncStatus);
  const signedIn = useUiStore((state) => state.account !== null);
  if (saveStatus === "failed") {
    return {
      tone: "failed",
      text: SAVE_LABEL.failed,
      title:
        "This browser is not letting the design be saved. Export the build pack to keep a copy.",
    };
  }
  if (saveStatus !== "saved") return { tone: "pending", text: SAVE_LABEL[saveStatus] };
  if (!signedIn || syncStatus === "signedOut") return { tone: "saved", text: SAVE_LABEL.saved };
  const tone: Record<Exclude<SyncStatus, "signedOut">, StatusTone> = {
    synced: "saved",
    syncing: "pending",
    offline: "warn",
    conflict: "failed",
    error: "warn",
  };
  return { tone: tone[syncStatus], text: SYNC_LABEL[syncStatus] };
}

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

/** Viewing someone else's layout: say so, and offer to keep a copy. */
function SharedActions({ repository }: { repository: DesignRepository }) {
  const [busy, setBusy] = useState(false);
  return (
    <>
      <span className="save-status" data-status="shared" data-testid="save-status" role="status">
        <span className="save-dot" aria-hidden="true" />
        <span className="save-text">Shared layout, changes are not saved</span>
      </span>
      <button
        type="button"
        className="button"
        data-testid="copy-shared"
        aria-label="Make a copy to keep working on it"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          copySharedDesign(repository).catch((error) => {
            console.error(error);
            setBusy(false);
            useUiStore.getState().setNotice("The copy could not be saved in this browser.");
          });
        }}
      >
        <CopyIcon />
        <span className="button-label">{busy ? "Copying" : "Make a copy"}</span>
        <span className="button-label-short" aria-hidden="true">
          {busy ? "Copying" : "Copy"}
        </span>
      </button>
    </>
  );
}

export function Toolbar({ repository }: { repository: DesignRepository }) {
  const canUndo = useDocStore((state) => state.past.length > 0);
  const canRedo = useDocStore((state) => state.future.length > 0);
  const undo = useDocStore((state) => state.undo);
  const redo = useDocStore((state) => state.redo);
  const units = useUiStore((state) => state.units);
  const setUnits = useUiStore((state) => state.setUnits);
  const status = useStatus();
  const shared = useUiStore((state) => state.mode === "shared");
  const shell = useShell();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const onExport = async (kind: ExportKind) => {
    setExporting(true);
    setExportError(null);
    try {
      await exportDesign(kind, useDocStore.getState().doc, units);
    } catch (error) {
      console.error(error);
      setExportError("Could not create the file. Please try again.");
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
        {shared ? (
          <SharedActions repository={repository} />
        ) : (
          <span
            className="save-status"
            data-status={status.tone}
            data-testid="save-status"
            role="status"
            title={status.title}
          >
            <span className="save-dot" aria-hidden="true" />
            <span className="save-text">{status.text}</span>
          </span>
        )}
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

        {!shared && <MainMenu />}

        <MenuButton
          label={exporting ? "Exporting" : "Export"}
          icon={<DownloadIcon />}
          className="button button--primary"
          testId="export-menu"
          disabled={exporting}
          items={EXPORTS.map((item) => ({
            id: item.kind,
            label: item.label,
            detail: item.detail,
            testId: `export-${item.kind}`,
          }))}
          onSelect={(kind) => onExport(kind as ExportKind)}
        />
      </div>
    </header>
  );
}
