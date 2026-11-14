import { useState } from "react";
import { useUiStore } from "../state/uiStore";
import { cloud } from "./session";

/**
 * The layout was changed on another device while this one had unsaved changes. Nothing is
 * merged or overwritten until the person picks which copy to keep.
 */
export function ConflictNotice() {
  const conflict = useUiStore((state) => state.syncStatus === "conflict");
  const [busy, setBusy] = useState(false);
  if (!conflict) return null;
  const run = async (action: () => unknown) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
      useUiStore.getState().setNotice("That did not work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="app-notice app-notice--stack" role="alert" data-testid="conflict">
      <p>
        <strong>This layout was changed on another device.</strong> Keep the changes you made here,
        or switch to the other copy.
      </p>
      <div className="modal-actions">
        <button
          type="button"
          className="button button--primary"
          data-testid="conflict-keep-mine"
          disabled={busy}
          onClick={() => run(cloud.keepMine)}
        >
          Keep mine
        </button>
        <button
          type="button"
          className="button"
          data-testid="conflict-take-theirs"
          disabled={busy}
          onClick={() => run(cloud.takeTheirs)}
        >
          Use the other copy
        </button>
      </div>
    </div>
  );
}
