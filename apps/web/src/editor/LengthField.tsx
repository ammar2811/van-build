import { formatLength, parseLength, type UnitSystem } from "@vanbuild/core";
import { useId, useRef, useState } from "react";

interface LengthFieldProps {
  label: string;
  /** Current value in mm. */
  value: number;
  units: UnitSystem;
  min?: number;
  max?: number;
  testId: string;
  /** A locked part shows its values but does not take new ones. */
  disabled?: boolean;
  onCommit: (mm: number) => void;
}

/**
 * A length you can type exactly: `600`, `23 5/8"`, `2' 3"`, `1200/2`, or `+50` to nudge.
 * Enter or leaving the field applies it, Escape puts the old value back.
 */
export function LengthField({
  label,
  value,
  units,
  min,
  max,
  testId,
  disabled = false,
  onCommit,
}: LengthFieldProps) {
  const id = useId();
  const [draft, setDraftState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Enter applies the value and then blurs the field in the same event. The ref lets the blur
  // handler see that the draft is already gone, so the value is never applied twice.
  const draftRef = useRef<string | null>(null);
  const setDraft = (next: string | null) => {
    draftRef.current = next;
    setDraftState(next);
  };

  const apply = (text: string): boolean => {
    const parsed = parseLength(text, units);
    if (!parsed.ok) {
      setError(parsed.error);
      return false;
    }
    const next = parsed.kind === "relative" ? value + parsed.mm : parsed.mm;
    if (min !== undefined && next < min) {
      setError(`Smallest allowed is ${formatLength(min, units)}`);
      return false;
    }
    if (max !== undefined && next > max) {
      setError(`Largest allowed is ${formatLength(max, units)}`);
      return false;
    }
    setError(null);
    setDraft(null);
    if (next !== value) onCommit(next);
    return true;
  };

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        data-testid={testId}
        type="text"
        inputMode={units === "metric" ? "decimal" : "text"}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        value={draft ?? formatLength(value, units)}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
          setError(null);
        }}
        onBlur={() => {
          // Leaving with something unreadable puts the old value back.
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
      {error && (
        <p className="field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
