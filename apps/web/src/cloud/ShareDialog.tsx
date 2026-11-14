import { useEffect, useRef, useState } from "react";
import { Modal } from "../ui/Modal";
import { cloud, shareUrl } from "./session";

type State =
  | { kind: "loading" }
  | { kind: "off" }
  /** A link exists, but it was made on another device and only its fingerprint is stored. */
  | { kind: "elsewhere" }
  | { kind: "on"; url: string };

/** A read-only link to the open layout. Anyone with it can view, nobody can change it. */
export function ShareDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cloud
      .shareState()
      .then(({ active, token }) =>
        setState(
          token ? { kind: "on", url: shareUrl(token) } : { kind: active ? "elsewhere" : "off" },
        ),
      )
      .catch((failure) => {
        console.error(failure);
        setError("Sharing could not be checked. Check your connection and try again.");
        setState({ kind: "off" });
      });
  }, []);

  const act = async (action: () => Promise<State>) => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      setState(await action());
    } catch (failure) {
      console.error(failure);
      setError("That did not work. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };
  const create = (renew: boolean) =>
    act(async () => ({ kind: "on", url: shareUrl(await cloud.share(renew)) }));
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; leave the link selected so it can be copied by hand.
      field.current?.select();
    }
  };

  return (
    <Modal title="Share" testId="share-dialog" onClose={onClose}>
      <p className="muted">
        Anyone with the link can view this layout and its weights and parts list. They cannot change
        your copy. The link shows your latest changes.
      </p>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {state.kind === "loading" && <p className="muted">Loading</p>}
      {state.kind === "off" && (
        <button
          type="button"
          className="button button--primary modal-submit"
          data-testid="share-create"
          disabled={busy}
          onClick={() => create(false)}
        >
          Create a link
        </button>
      )}
      {state.kind === "elsewhere" && (
        <>
          <p>
            This layout already has a link, made on another device. Make a new one here, and the old
            link stops working.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="button button--primary"
              data-testid="share-renew"
              disabled={busy}
              onClick={() => create(true)}
            >
              Make a new link
            </button>
            <button
              type="button"
              className="button button--danger"
              data-testid="share-stop"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await cloud.stopSharing();
                  return { kind: "off" };
                })
              }
            >
              Stop sharing
            </button>
          </div>
        </>
      )}
      {state.kind === "on" && (
        <>
          <div className="inline-form">
            <input
              ref={field}
              className="text-input share-url"
              data-testid="share-url"
              aria-label="Share link"
              readOnly
              value={state.url}
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="button button--primary"
              data-testid="share-copy"
              onClick={() => copy(state.url)}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button button--danger"
              data-testid="share-stop"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await cloud.stopSharing();
                  return { kind: "off" };
                })
              }
            >
              Stop sharing
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
