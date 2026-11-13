import { formatMassInput, parseMass, type UnitSystem } from "@vanbuild/core";
import { useId, useRef, useState } from "react";

interface MassFieldProps {
  label: string;
  /** Current value in grams. */
  value: number;
  units: UnitSystem;
  testId: string;
  disabled?: boolean;
  /** Shown when the value is the user's own number rather than the catalog's. */
  onReset?: (() => void) | undefined;
  onCommit: (grams: number) => void;
}

/**
 * A weight you can type: `1500`, `1500 kg`, `3300 lb`. Enter or leaving the field applies it,
 * Escape puts the old value back. A reset button appears next to a value the user changed.
 */
export function MassField({
  label,
  value,
  units,
  testId,
  disabled = false,
  onReset,
  onCommit,
}: MassFieldProps) {
  const id = useId();
  const [draft, setDraftState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Enter applies and then blurs in the same event; the ref stops a second apply on blur.
  const draftRef = useRef<string | null>(null);
  const setDraft = (next: string | null) => {
    draftRef.current = next;
    setDraftState(next);
  };

  const apply = (text: string): boolean => {
    const parsed = parseMass(text, units);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    if (parsed.grams <= 0) {
      setError("Weight must be more than zero");
      return false;
    }
    setError(null);
    setDraft(null);
    if (parsed.grams !== value) onCommit(parsed.grams);
    return true;
  };

  return (
    <div className={onReset ? "field field--changed" : "field"}>
      <label htmlFor={id}>{label}</label>
      <div className="field-control">
        <input
          id={id}
          data-testid={testId}
          type="text"
          inputMode={units === "metric" ? "decimal" : "text"}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          value={draft ?? formatMassInput(value, units)}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            setError(null);
          }}
          onBlur={() => {
            const pending = draftRef.current;
            if (pending !== null && !apply(pending)) {
              setDraft(null);
              setError(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              const pending = draftRef.current;
              if (pending === null || apply(pending)) event.currentTarget.blur();
            } else if (event.key === "Escape") {
              setDraft(null);
              setError(null);
              event.currentTarget.blur();
            }
          }}
        />
        {onReset && !disabled && (
          <button
            type="button"
            className="field-reset"
            data-testid={`${testId}-reset`}
            aria-label={`Reset ${label} to the catalog value`}
            title="Back to the catalog value"
            onClick={onReset}
          >
            Reset
          </button>
        )}
      </div>
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
