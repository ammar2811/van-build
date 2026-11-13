import { getPartDefinition } from "@vanbuild/catalog";
import {
  formatMass,
  formatMoney,
  type PartIssue,
  partDimensions,
  partMass,
  partName,
  partPrice,
  WHEEL_WELL_PREFIX,
  wallDistances,
} from "@vanbuild/core";
import {
  clearAll,
  deletePart,
  duplicate,
  isLocked,
  resize,
  rotate,
  setDistance,
  setElevation,
  toggleLock,
} from "../state/actions";
import { useDocStore } from "../state/docStore";
import { useIssues, useSelectedPart, useShell, useTotals } from "../state/selectors";
import { useUiStore } from "../state/uiStore";
import { CheckIcon, CopyIcon, LockIcon, RotateIcon, TrashIcon, UnlockIcon } from "../ui/icons";
import { LengthField } from "./LengthField";

/** Look up display names for the things an issue refers to. */
function useNameOf(): (id: string) => string {
  const parts = useDocStore((state) => state.doc.parts);
  return (id) => {
    if (id.startsWith(WHEEL_WELL_PREFIX)) return "a wheel well";
    const part = parts[id];
    const def = part && getPartDefinition(part.defId);
    return part && def ? partName(def, part) : "another part";
  };
}

function describeIssue(issue: PartIssue, nameOf: (id: string) => string): string {
  if (issue.kind === "outOfBounds") return "Sticks out through a wall.";
  if (issue.kind === "tooTall") return "Taller than the interior here.";
  return `Overlaps ${issue.withIds.map(nameOf).join(", ")}.`;
}

export function Inspector() {
  const part = useSelectedPart();
  const shell = useShell();
  const units = useUiStore((state) => state.units);
  const issues = useIssues();
  const nameOf = useNameOf();

  if (!part) return <LayoutSummary />;
  const def = getPartDefinition(part.defId);
  if (!def) return null;

  const { width, depth, height } = partDimensions(part);
  const distances = wallDistances(shell, part);
  const locked = isLocked(part);
  const limits = (key: string) => {
    const param = def.params.find((p) => p.key === key);
    return param?.kind === "length" ? { min: param.min, max: param.max } : {};
  };
  const partIssues = issues.get(part.id) ?? [];

  return (
    // Keyed by part so a half-typed value never carries over to another part.
    <section className="inspector" aria-label="Selected part" data-testid="inspector" key={part.id}>
      <header className="inspector-head">
        <span className={`swatch part--${def.category}`} aria-hidden="true" />
        <div>
          <h2 data-testid="inspector-name">{partName(def, part)}</h2>
          <p className="muted">
            {formatMass(partMass(def, part), units)} ·{" "}
            {formatMoney(partPrice(def, part), def.price.currency)}
            {locked && " · Locked"}
          </p>
        </div>
      </header>

      {partIssues.length > 0 && (
        <div className="notice" role="status" data-testid="inspector-issues">
          {partIssues.map((issue) => (
            <p key={issue.kind}>{describeIssue(issue, nameOf)}</p>
          ))}
        </div>
      )}

      <h3>Size</h3>
      <div className="field-grid field-grid--size">
        <LengthField
          label="Width"
          testId="field-width"
          value={width}
          units={units}
          disabled={locked}
          {...limits("width")}
          onCommit={(mm) => resize(part.id, "width", mm)}
        />
        <LengthField
          label="Depth"
          testId="field-depth"
          value={depth}
          units={units}
          disabled={locked}
          {...limits("depth")}
          onCommit={(mm) => resize(part.id, "depth", mm)}
        />
        <LengthField
          label="Height"
          testId="field-height"
          value={height}
          units={units}
          disabled={locked}
          {...limits("height")}
          onCommit={(mm) => resize(part.id, "height", mm)}
        />
      </div>

      <h3>Position</h3>
      <div className="field-grid field-grid--position">
        <LengthField
          label="From front"
          testId="field-front"
          value={distances.front}
          units={units}
          disabled={locked}
          onCommit={(mm) => setDistance(part.id, "front", mm)}
        />
        <LengthField
          label="From driver side"
          testId="field-driver"
          value={distances.driver}
          units={units}
          disabled={locked}
          onCommit={(mm) => setDistance(part.id, "driver", mm)}
        />
        <LengthField
          label="Off floor"
          testId="field-elevation"
          value={part.position.z}
          units={units}
          min={0}
          disabled={locked}
          onCommit={(mm) => setElevation(part.id, mm)}
        />
      </div>

      <div className="inspector-actions">
        <button
          type="button"
          className="button"
          data-testid="rotate"
          aria-label="Rotate 90 degrees"
          title="Rotate 90 degrees (R)"
          disabled={locked}
          onClick={() => rotate(part.id)}
        >
          <RotateIcon />
          <span className="button-label">Rotate 90°</span>
        </button>
        <button
          type="button"
          className="button"
          data-testid="duplicate"
          aria-label="Duplicate part"
          title="Duplicate (Ctrl+D)"
          onClick={() => duplicate(part.id)}
        >
          <CopyIcon />
          <span className="button-label">Duplicate</span>
        </button>
        <button
          type="button"
          className="button"
          data-testid="lock"
          aria-pressed={locked}
          aria-label={locked ? "Unlock part" : "Lock part"}
          title={locked ? "Unlock (L)" : "Lock so it cannot be moved or changed (L)"}
          onClick={() => toggleLock(part.id)}
        >
          {locked ? <LockIcon /> : <UnlockIcon />}
          <span className="button-label">{locked ? "Unlock" : "Lock"}</span>
        </button>
        <button
          type="button"
          className="button button--danger"
          data-testid="delete"
          aria-label="Delete part"
          title="Delete (Del)"
          disabled={locked}
          onClick={() => deletePart(part.id)}
        >
          <TrashIcon />
          <span className="button-label">Delete</span>
        </button>
        <button
          type="button"
          className="button inspector-done"
          data-testid="deselect"
          aria-label="Done editing this part"
          onClick={() => useUiStore.getState().select(null)}
        >
          <CheckIcon />
        </button>
      </div>
    </section>
  );
}

function LayoutSummary() {
  const totals = useTotals();
  const units = useUiStore((state) => state.units);
  const issues = useIssues();
  const nameOf = useNameOf();
  const flagged = [...issues.entries()];

  return (
    <section className="inspector" aria-label="Layout summary" data-testid="summary">
      <header className="inspector-head">
        <div>
          <h2>Layout</h2>
          <p className="muted">Select a part to edit it.</p>
        </div>
      </header>
      <dl className="stats">
        <div>
          <dt>Parts</dt>
          <dd data-testid="total-parts">{totals.count}</dd>
        </div>
        <div>
          <dt>Added weight</dt>
          <dd data-testid="total-mass">{formatMass(totals.mass, units)}</dd>
        </div>
        <div>
          <dt>Parts cost</dt>
          <dd data-testid="total-price">{formatMoney(totals.price, totals.currency)}</dd>
        </div>
      </dl>

      {flagged.length > 0 && (
        <>
          <h3>Needs attention</h3>
          <ul className="issue-list" data-testid="issue-list">
            {flagged.map(([partId, partIssues]) => (
              <li key={partId}>
                <button type="button" onClick={() => useUiStore.getState().select(partId)}>
                  <strong>{nameOf(partId)}</strong>
                  <span className="issue-text">
                    {partIssues.map((issue) => describeIssue(issue, nameOf)).join(" ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="hint">
        Drag parts to move them. They snap to walls and to each other. Hold Alt to place freely,
        press R to rotate, and use the arrow keys to nudge. Scroll or pinch to zoom.
      </p>

      {totals.count > 0 && (
        <button
          type="button"
          className="button button--quiet"
          data-testid="clear-all"
          onClick={clearAll}
        >
          Remove all parts
        </button>
      )}
    </section>
  );
}
