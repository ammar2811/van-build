import { getShell } from "@vanbuild/catalog";
import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import type { CloudDesignSummary } from "./backend";
import { cloud } from "./session";
import { when } from "./when";

function vanName(shellId: string): string {
  try {
    return getShell(shellId).name;
  } catch {
    return "Unknown van";
  }
}

/** Every layout in the account: open one, start a new one, or delete one. */
export function DesignsDialog({ onClose }: { onClose: () => void }) {
  const [designs, setDesigns] = useState<CloudDesignSummary[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const currentId = cloud.currentDesignId();

  const load = () =>
    cloud
      .listDesigns()
      .then(setDesigns)
      .catch((failure) => {
        console.error(failure);
        setError("Your layouts could not be loaded. Check your connection and try again.");
      });

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the dialog opens
  useEffect(() => {
    void load();
  }, []);

  const run = async (action: () => Promise<void>, close: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (close) onClose();
      else await load();
    } catch (failure) {
      console.error(failure);
      setError(failure instanceof Error ? failure.message : "That did not work. Try again.");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  };

  return (
    <Modal
      title="My layouts"
      testId="designs-dialog"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="button button--primary"
          data-testid="design-new"
          disabled={busy}
          onClick={() => run(cloud.newDesign, true)}
        >
          New layout
        </button>
      }
    >
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {designs === null && !error && <p className="muted">Loading</p>}
      {designs?.length === 0 && <p className="muted">No layouts in your account yet.</p>}
      {designs && designs.length > 0 && (
        <ul className="design-list" data-testid="design-list">
          {designs.map((design) => {
            const open = design.id === currentId;
            return (
              <li key={design.id} data-testid="design-row" data-open={open}>
                <div className="design-text">
                  <span className="design-name">{design.name}</span>
                  <span className="muted">
                    {vanName(design.shellId)} · {when(design.updatedAt)}
                  </span>
                </div>
                {open ? (
                  <span className="design-open">Open now</span>
                ) : (
                  <button
                    type="button"
                    className="button"
                    data-testid="design-open"
                    disabled={busy}
                    onClick={() => run(() => cloud.openDesign(design.id), true)}
                  >
                    Open
                  </button>
                )}
                <button
                  type="button"
                  className={
                    confirming === design.id
                      ? "button button--danger-solid"
                      : "button button--danger"
                  }
                  data-testid="design-delete"
                  aria-label={
                    confirming === design.id
                      ? `Confirm deleting ${design.name}`
                      : `Delete ${design.name}`
                  }
                  disabled={busy}
                  onClick={() =>
                    confirming === design.id
                      ? run(() => cloud.deleteDesign(design), false)
                      : setConfirming(design.id)
                  }
                >
                  {confirming === design.id ? "Delete?" : "Delete"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
