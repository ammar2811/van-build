import { formatMoney, parseMoney } from "@vanbuild/core";
import { type Parsed, ValueField } from "./ValueField";

interface MoneyFieldProps {
  label: string;
  /** Current value in minor units (cents). */
  value: number;
  currency: string;
  testId: string;
  disabled?: boolean;
  onReset?: (() => void) | undefined;
  onCommit: (minor: number) => void;
}

/** A price you can type: `1200`, `$1,200`, `12.50`. Zero is fine for something you already own. */
export function MoneyField({ currency, ...rest }: MoneyFieldProps) {
  const parse = (text: string): Parsed<number> => {
    const parsed = parseMoney(text);
    return parsed.ok ? { ok: true, value: parsed.minor } : parsed;
  };
  return (
    <ValueField
      {...rest}
      inputMode="decimal"
      format={(minor) => formatMoney(minor, currency)}
      parse={parse}
    />
  );
}
