import { formatMassInput, parseMass, type UnitSystem } from "@vanbuild/core";
import { type Parsed, ValueField } from "./ValueField";

interface MassFieldProps {
  label: string;
  /** Current value in grams. */
  value: number;
  units: UnitSystem;
  testId: string;
  disabled?: boolean;
  onReset?: (() => void) | undefined;
  onCommit: (grams: number) => void;
}

/** A weight you can type: `1500`, `1500 kg`, `3300 lb`. */
export function MassField({ units, ...rest }: MassFieldProps) {
  const parse = (text: string): Parsed<number> => {
    const parsed = parseMass(text, units);
    if (!parsed.ok) return parsed;
    if (parsed.grams <= 0) return { ok: false, error: "Weight must be more than zero" };
    return { ok: true, value: parsed.grams };
  };
  return (
    <ValueField
      {...rest}
      inputMode={units === "metric" ? "decimal" : "text"}
      format={(grams) => formatMassInput(grams, units)}
      parse={parse}
    />
  );
}
