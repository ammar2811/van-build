import { type FormEvent, useEffect, useId, useState } from "react";
import { Modal } from "../ui/Modal";
import type { CloudVersion } from "./backend";
import { cloud } from "./session";
import { when } from "./when";

/** Named snapshots of the open layout. Restoring one is a normal edit, so it can be undone. */
export function VersionsDialog({ onClose }: { onClose: () => void }) {
  const [versions, setVersions] = useState<CloudVersion[] | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState<string | null>(null);
  const id = useId();

  const load = () =>
    cloud
      .listVersions()
      .then(setVersions)
      .catch((failure) => {
        console.error(failure);
        setError("Versions could not be loaded. Check your connection and try again.");
      });

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once when the dialog opens
  useEffect(() => {
    void load();
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const name = label.trim() || `Version ${(versions?.length ?? 0) + 1}`;
    setBusy(true);
    setError(null);
    try {
      await cloud.saveVersion(name.slice(0, 120));
      setLabel("");
      await load();
    } catch (failure) {
      console.error(failure);
      setError(failure instanceof Error ? failure.message : "The version was not saved.");
    } finally {
      setBusy(false);
    }
  };

  const restore = async (version: CloudVersion) => {
    setBusy(true);
    setError(null);
    try {
      await cloud.restoreVersion(version.id);
      setRestored(version.label);
    } catch (failure) {
      console.error(failure);
      setError(failure instanceof Error ? failure.message : "The version was not restored.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Versions" testId="versions-dialog" onClose={onClose}>
      <form className="inline-form" onSubmit={save}>
        <label className="visually-hidden" htmlFor={id}>
          Version name
        </label>
        <input
          id={id}
          className="text-input"
          data-testid="version-label"
          placeholder={`Version ${(versions?.length ?? 0) + 1}`}
          maxLength={120}
          value={label}
          onChange={(event) => setLabel(event.currentTarget.value)}
        />
        <button
          type="submit"
          className="button button--primary"
          data-testid="version-save"
          disabled={busy}
        >
          Save version
        </button>
      </form>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {restored && (
        <p className="success" role="status" data-testid="version-restored">
          Restored "{restored}". Undo brings back what you had.
        </p>
      )}
      {versions?.length === 0 && (
        <p className="muted">
          Save a version before a big change, and you can always come back to it.
        </p>
      )}
      {versions && versions.length > 0 && (
        <ul className="design-list" data-testid="version-list">
          {versions.map((version) => (
            <li key={version.id} data-testid="version-row">
              <div className="design-text">
                <span className="design-name">{version.label}</span>
                <span className="muted">{when(version.createdAt)}</span>
              </div>
              <button
                type="button"
                className="button"
                data-testid="version-restore"
                disabled={busy}
                onClick={() => restore(version)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
