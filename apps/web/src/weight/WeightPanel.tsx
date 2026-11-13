import { getPartDefinition, shells } from "@vanbuild/catalog";
import {
  ESTIMATED,
  effectiveChassis,
  GRAMS_PER_POUND,
  type LimitCheck,
  type LimitStatus,
  partName,
  requireChassis,
  type UnitSystem,
} from "@vanbuild/core";
import { MassField } from "../editor/MassField";
import {
  setFillLevel,
  setOccupantMass,
  setOccupants,
  setShell,
  setVehicleValue,
  type VehicleField,
} from "../state/actions";
import { useDocStore } from "../state/docStore";
import { useShell, useWeight } from "../state/selectors";
import { useUiStore } from "../state/uiStore";
import { MinusIcon, PlusIcon } from "../ui/icons";

/** Whole kilograms or pounds: axle loads are not known to the decimal. */
export function wholeMass(grams: number, units: UnitSystem): string {
  const value = units === "metric" ? grams / 1000 : grams / GRAMS_PER_POUND;
  return Math.round(value).toLocaleString("en-US");
}

const STATUS_TEXT: Record<LimitStatus, string> = {
  ok: "Within limits",
  warn: "Near a limit",
  over: "Over a limit",
};

export function worstStatus(checks: LimitCheck[]): LimitStatus {
  if (checks.some((check) => check.status === "over")) return "over";
  return checks.some((check) => check.status === "warn") ? "warn" : "ok";
}

function Bar({
  id,
  label,
  check,
  units,
}: {
  id: string;
  label: string;
  check: LimitCheck;
  units: UnitSystem;
}) {
  const unit = units === "metric" ? "kg" : "lb";
  const percent = Math.round(check.used * 100);
  return (
    <div className="weight-row" data-status={check.status} data-testid={`weight-${id}`}>
      <div className="weight-row-head">
        <span>{label}</span>
        <span className="weight-figures">
          <strong data-testid={`weight-${id}-load`}>{wholeMass(check.load, units)}</strong> /{" "}
          {wholeMass(check.limit, units)} {unit}
        </span>
      </div>
      {/* The numbers beside the bar say the same thing in text, so the bar itself is decoration. */}
      <div className="weight-bar" aria-hidden="true">
        <span className="weight-bar-fill" style={{ width: `${Math.min(check.used, 1) * 100}%` }} />
        <span className="weight-bar-mark" aria-hidden="true" />
      </div>
      <span className="weight-percent" data-testid={`weight-${id}-percent`}>
        {percent}%
      </span>
    </div>
  );
}

const VEHICLE_FIELDS: { field: VehicleField; label: string }[] = [
  { field: "gvwr", label: "Gross rating (GVWR)" },
  { field: "gawrFront", label: "Front axle rating" },
  { field: "gawrRear", label: "Rear axle rating" },
  { field: "curbFront", label: "Empty, front axle" },
  { field: "curbRear", label: "Empty, rear axle" },
];

export function WeightPanel() {
  const weight = useWeight();
  const shell = useShell();
  const units = useUiStore((state) => state.units);
  const doc = useDocStore((state) => state.doc);
  const chassis = effectiveChassis(shell, doc);
  const catalogChassis = requireChassis(shell, doc.chassisId);
  const status = worstStatus([weight.front, weight.rear, weight.gross]);
  const unit = units === "metric" ? "kg" : "lb";

  const tanks = Object.values(doc.parts).flatMap((part) => {
    const def = getPartDefinition(part.defId);
    return def?.mass.contents ? [{ part, def }] : [];
  });
  const seats = shell.cabSeats.length;
  const { occupants, occupantMass, fillLevels } = doc.loadCase;

  return (
    <section className="weight" aria-label="Weight" data-testid="weight-panel">
      <header className="weight-head">
        <h2>Weight</h2>
        <span className="weight-status" data-status={status} data-testid="weight-status">
          {STATUS_TEXT[status]}
        </span>
      </header>

      <div className="weight-rows">
        <Bar id="front" label="Front axle" check={weight.front} units={units} />
        <Bar id="rear" label="Rear axle" check={weight.rear} units={units} />
        <Bar id="gross" label="Total" check={weight.gross} units={units} />
      </div>

      <p className="weight-payload" data-status={weight.payloadRemaining < 0 ? "over" : "ok"}>
        <span>{weight.payloadRemaining < 0 ? "Over the gross rating by" : "Payload left"}</span>
        <strong data-testid="weight-payload">
          {wholeMass(Math.abs(weight.payloadRemaining), units)} {unit}
        </strong>
      </p>

      <h3>On board</h3>
      <div className="field-grid">
        <div className="field">
          <span>Occupants</span>
          <div className="stepper">
            <button
              type="button"
              className="icon-button"
              aria-label="One person fewer"
              data-testid="occupants-less"
              disabled={occupants <= 0}
              onClick={() => setOccupants(occupants - 1)}
            >
              <MinusIcon />
            </button>
            <output data-testid="occupants" aria-label="People in the cab">
              {occupants}
            </output>
            <button
              type="button"
              className="icon-button"
              aria-label="One person more"
              data-testid="occupants-more"
              disabled={occupants >= seats}
              onClick={() => setOccupants(occupants + 1)}
            >
              <PlusIcon />
            </button>
          </div>
        </div>
        <MassField
          label="Weight each"
          testId="occupant-mass"
          value={occupantMass}
          units={units}
          onCommit={setOccupantMass}
        />
        {tanks.map(({ part, def }) => {
          const fill = fillLevels[part.id] ?? 1;
          const inputId = `fill-${part.id}`;
          return (
            <div className="field field--slider" key={part.id}>
              <label htmlFor={inputId}>{partName(def, part)}</label>
              <div className="slider">
                <input
                  id={inputId}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(fill * 100)}
                  data-testid={`fill-${part.id}`}
                  onChange={(event) =>
                    setFillLevel(part.id, Number(event.currentTarget.value) / 100)
                  }
                />
                <output htmlFor={inputId}>{Math.round(fill * 100)}%</output>
              </div>
            </div>
          );
        })}
      </div>

      <details className="weight-vehicle" data-testid="weight-vehicle">
        <summary>Vehicle</summary>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="van-select">Van</label>
            <select
              id="van-select"
              data-testid="van-select"
              value={shell.id}
              onChange={(event) => setShell(event.currentTarget.value)}
            >
              {shells.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>
          {VEHICLE_FIELDS.map(({ field, label }) => (
            <MassField
              key={field}
              label={
                doc.vehicle[field] === undefined &&
                shell.provenance[`chassis.${catalogChassis.id}.${field}`]?.source === ESTIMATED
                  ? `${label} (estimate)`
                  : label
              }
              testId={`vehicle-${field}`}
              value={chassis[field]}
              units={units}
              onReset={
                doc.vehicle[field] !== undefined && doc.vehicle[field] !== catalogChassis[field]
                  ? () => setVehicleValue(field, null)
                  : undefined
              }
              onCommit={(grams) =>
                setVehicleValue(field, grams === catalogChassis[field] ? null : grams)
              }
            />
          ))}
        </div>
        <p className="hint">
          These are catalog values for a {catalogChassis.name}, and some are estimates. For real
          numbers, enter the ratings from your door-jamb sticker and the empty axle weights from a
          weigh-scale ticket.
        </p>
      </details>

      <p className="hint">
        An estimate from the positions and weights in this layout. Weigh the finished van on a scale
        before relying on it.
      </p>
    </section>
  );
}
