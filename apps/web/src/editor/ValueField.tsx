import { type HTMLAttributes, useId, useRef, useState } from "react";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export interface ValueFieldProps<T> {
  label: string;
  value: T;
  testId: string;
  format: (value: T) => string;
  parse: (text: string) => Parsed<T>;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
  /** Shown when the value is the user's own number rather than the catalog's. */
  onReset?: (() => void) | undefined;
  onCommit: (value: T) => void;
}

/**
 * A value you can type. Enter or leaving the field applies it, Escape puts the old value
 * back. A reset button appears next to a value the user changed from the catalog's.
 */
export function ValueField<T>({
  label,
  value,
  testId,
  format,
  parse,
  inputMode = "text",
  disabled = false,
  onReset,
  onCommit,
}: ValueFieldProps<T>) {
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
    const parsed = parse(text);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    setError(null);
    setDraft(null);
    if (parsed.value !== value) onCommit(parsed.value);
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
          inputMode={inputMode}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={disabled}
          value={draft ?? format(value)}
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
