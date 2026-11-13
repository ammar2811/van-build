import { useUiStore, type ViewMode } from "../state/uiStore";

const OPTIONS: { value: ViewMode; label: string; name: string; wideOnly?: boolean }[] = [
  { value: "plan", label: "Plan", name: "Top-down plan" },
  { value: "side", label: "Side", name: "Side elevation" },
  { value: "3d", label: "3D", name: "3D view" },
  { value: "split", label: "Split", name: "Plan and 3D side by side", wideOnly: true },
];

/** Which view of the design is showing. All of them show the same document. */
export function ViewSwitch({ compact }: { compact: boolean }) {
  const mode = useUiStore((state) => state.viewMode);
  const setMode = useUiStore((state) => state.setViewMode);
  const current = compact && mode === "split" ? "plan" : mode;
  return (
    <fieldset className="segmented view-switch" aria-label="View">
      {OPTIONS.filter((option) => !(compact && option.wideOnly)).map((option) => (
        <label key={option.value} title={option.name}>
          <input
            type="radio"
            name="view"
            value={option.value}
            checked={current === option.value}
            data-testid={`view-${option.value}`}
            onChange={() => setMode(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
