import { partDefinitions } from "@vanbuild/catalog";
import { formatSize, resolveParams } from "@vanbuild/core";
import { addPart } from "../state/actions";
import { useUiStore } from "../state/uiStore";
import { PlusIcon } from "../ui/icons";

export function Palette() {
  const units = useUiStore((state) => state.units);
  return (
    <nav className="palette" aria-label="Add parts" data-testid="palette">
      <h2>Add parts</h2>
      <ul>
        {partDefinitions.map((def) => {
          const params = resolveParams(def, {});
          const size = formatSize([Number(params.width), Number(params.depth)], units);
          return (
            <li key={def.id}>
              <button
                type="button"
                className="palette-item"
                data-testid={`add-${def.id}`}
                onClick={() => addPart(def.id)}
              >
                <span className={`swatch part--${def.category}`} aria-hidden="true" />
                <span className="palette-text">
                  <span className="palette-name">{def.name}</span>
                  <span className="palette-size">{size}</span>
                </span>
                <PlusIcon />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
