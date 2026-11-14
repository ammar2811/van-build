import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

interface ModalProps {
  title: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
  /** Buttons along the bottom. */
  footer?: ReactNode;
}

/**
 * A dialog over the editor: centred on wide screens, a sheet from the bottom on phones.
 * Built on <dialog>, so focus stays inside it and Escape closes it.
 */
export function Modal({ title, testId, onClose, children, footer }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // Start on the field marked for it, or on the dialog itself: never on the close button,
    // where Enter would throw away what the dialog is for.
    const first = dialog.querySelector<HTMLElement>("[data-autofocus]");
    (first ?? dialog).focus();
  }, []);

  // Rendered at the end of the page, so styles of whatever opened it never leak in.
  return createPortal(
    <dialog
      ref={ref}
      className="modal"
      data-testid={testId}
      aria-labelledby={titleId}
      tabIndex={-1}
      onClose={onClose}
      // Escape inside the dialog is for the dialog, not the editor's shortcuts behind it.
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className="modal-body">
        <header className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button modal-close"
            aria-label="Close"
            onClick={() => ref.current?.close()}
          >
            <CloseIcon />
          </button>
        </header>
        {children}
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>,
    document.body,
  );
}
