import { useEffect, useRef, useState } from "react";
import { useWeight } from "../state/selectors";
import { WeightPanel, worstStatus } from "./WeightPanel";

/**
 * Phones have no room for the weight panel beside the plan, so the three bars shrink into a
 * strip over the plan. Tapping it opens the full panel.
 */
export function WeightStrip() {
  const weight = useWeight();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const status = worstStatus([weight.front, weight.rear, weight.gross]);
  const rows = [
    { key: "front", label: "Front", check: weight.front },
    { key: "rear", label: "Rear", check: weight.rear },
    { key: "gross", label: "Total", check: weight.gross },
  ];

  useEffect(() => {
    if (open) dialog.current?.showModal();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="weight-strip"
        data-status={status}
        data-testid="weight-strip"
        onClick={() => setOpen(true)}
      >
        {rows.map(({ key, label, check }) => (
          <span className="weight-strip-item" data-status={check.status} key={key}>
            <span className="weight-strip-label">
              {label} <strong data-testid={`strip-${key}`}>{Math.round(check.used * 100)}%</strong>
            </span>
            <span className="weight-bar">
              <span
                className="weight-bar-fill"
                style={{ width: `${Math.min(check.used, 1) * 100}%` }}
              />
            </span>
          </span>
        ))}
        <span className="visually-hidden">Open weight details</span>
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="sheet"
          data-testid="weight-dialog"
          onClose={() => setOpen(false)}
        >
          <WeightPanel />
          <button
            type="button"
            className="button button--primary sheet-close"
            data-testid="weight-dialog-close"
            onClick={() => dialog.current?.close()}
          >
            Done
          </button>
        </dialog>
      )}
    </>
  );
}
