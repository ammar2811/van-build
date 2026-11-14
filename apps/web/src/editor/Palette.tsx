import { categoryLabels, partDefinitions } from "@vanbuild/catalog";
import { formatSize, type PartCategory, type PartDefinition, resolveParams } from "@vanbuild/core";
import { useId, useMemo, useState } from "react";
import { addPart } from "../state/actions";
import { useUiStore } from "../state/uiStore";
import { PlusIcon } from "../ui/icons";

/** Categories in the order someone furnishing a van reaches for them. */
const ORDER: PartCategory[] = [
  "bed",
  "galley",
  "seating",
  "storage",
  "appliance",
  "water",
  "electrical",
  "climate",
  "opening",
  "load",
];

interface Group {
  category: PartCategory;
  parts: PartDefinition[];
}

function groupParts(query: string): Group[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return ORDER.map((category) => ({
    category,
    parts: partDefinitions.filter((def) => {
      if (def.category !== category) return false;
      const text = `${def.name} ${categoryLabels[category]}`.toLowerCase();
      return words.every((word) => text.includes(word));
    }),
  })).filter((group) => group.parts.length > 0);
}

export function Palette() {
  const units = useUiStore((state) => state.units);
  const [query, setQuery] = useState("");
  const groups = useMemo(() => groupParts(query), [query]);
  const searchId = useId();

  return (
    <nav className="palette" aria-label="Add parts" data-testid="palette">
      <div className="palette-head">
        <h2>Add parts</h2>
        <label className="visually-hidden" htmlFor={searchId}>
          Search parts
        </label>
        <input
          id={searchId}
          className="palette-search"
          data-testid="palette-search"
          type="search"
          placeholder="Search parts"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query !== "") {
              event.stopPropagation();
              setQuery("");
            }
          }}
        />
      </div>
      {groups.length === 0 && (
        <p className="palette-empty" data-testid="palette-empty">
          No parts match "{query.trim()}".
        </p>
      )}
      {groups.map((group) => (
        <section key={group.category} className="palette-group">
          <h3>{categoryLabels[group.category]}</h3>
          <ul>
            {group.parts.map((def) => {
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
        </section>
      ))}
    </nav>
  );
}
