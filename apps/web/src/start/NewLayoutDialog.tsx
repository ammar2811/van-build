import { designFromTemplate, getShell, shells, templates } from "@vanbuild/catalog";
import { formatLength } from "@vanbuild/core";
import { useState } from "react";
import { cloud } from "../cloud/session";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { Modal } from "../ui/Modal";

interface NewLayoutDialogProps {
  /** The first-visit welcome: friendlier wording, and closing keeps the example layout. */
  welcome?: boolean;
  onClose: () => void;
}

/** Pick a van and a starting layout. Every template fits every van. */
export function NewLayoutDialog({ welcome = false, onClose }: NewLayoutDialogProps) {
  const currentShell = useDocStore((state) => state.doc.shellId);
  const units = useUiStore((state) => state.units);
  const signedIn = useUiStore((state) => state.account !== null);
  const [shellId, setShellId] = useState(currentShell);
  const [templateId, setTemplateId] = useState(welcome ? "weekender" : "empty");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const doc = designFromTemplate(template, getShell(shellId));
    setBusy(true);
    setError(null);
    try {
      if (signedIn) await cloud.newDesign(doc);
      else useDocStore.getState().replace("New layout", doc);
      const ui = useUiStore.getState();
      ui.select(null);
      ui.setViewMode("plan");
      onClose();
    } catch (failure) {
      console.error(failure);
      setError("The new layout could not be created. Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={welcome ? "Start your layout" : "New layout"}
      testId="new-layout-dialog"
      onClose={onClose}
      footer={
        <>
          {welcome && (
            <button
              type="button"
              className="button"
              data-testid="new-layout-skip"
              onClick={onClose}
            >
              Look around first
            </button>
          )}
          <button
            type="button"
            className="button button--primary"
            data-testid="new-layout-start"
            disabled={busy}
            onClick={start}
          >
            {busy ? "Starting" : "Start"}
          </button>
        </>
      }
    >
      {welcome && (
        <p className="muted">
          Choose your van and a starting point. Everything can be moved, resized or removed, and
          your layout is saved in this browser as you work.
        </p>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}

      <fieldset className="choice-group">
        <legend>Van</legend>
        <div className="choice-grid">
          {shells.map((shell) => (
            <label key={shell.id} className="choice">
              <input
                type="radio"
                name="new-layout-van"
                value={shell.id}
                data-testid={`van-${shell.id}`}
                checked={shellId === shell.id}
                onChange={() => setShellId(shell.id)}
              />
              <span className="choice-body">
                <span className="choice-name">{shell.name}</span>
                <span className="choice-detail">
                  {formatLength(shell.cargoLength, units)} cargo floor
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="choice-group">
        <legend>Start from</legend>
        <div className="choice-list">
          {templates.map((template) => (
            <label key={template.id} className="choice">
              <input
                type="radio"
                name="new-layout-template"
                value={template.id}
                data-testid={`template-${template.id}`}
                checked={templateId === template.id}
                onChange={() => setTemplateId(template.id)}
              />
              <span className="choice-body">
                <span className="choice-name">
                  {template.name}
                  {template.parts.length > 0 && (
                    <span className="choice-count"> · {template.parts.length} parts</span>
                  )}
                </span>
                <span className="choice-detail">{template.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {!welcome && (
        <p className="muted" data-testid="new-layout-note">
          {signedIn
            ? "Your current layout stays in My layouts."
            : "This replaces the layout on screen. Undo brings it back."}
        </p>
      )}
    </Modal>
  );
}
