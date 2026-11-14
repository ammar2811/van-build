import { categoryLabels, getPartDefinition } from "@vanbuild/catalog";
import { type BomLine, buildBom, formatMoney, formatSize } from "@vanbuild/core";
import { useMemo, useState } from "react";
import { exportDesign } from "../export/exports";
import { useDocStore } from "../state/docStore";
import { useUiStore } from "../state/uiStore";
import { DownloadIcon } from "../ui/icons";

/**
 * The bill of materials: one line per distinct thing to buy or build. Picking a line selects
 * its part, so its price can be changed in the side panel.
 */
export function PartsList() {
  const doc = useDocStore((state) => state.doc);
  const units = useUiStore((state) => state.units);
  const selectedId = useUiStore((state) => state.selectedId);
  const bom = useMemo(() => buildBom(doc, getPartDefinition), [doc]);
  const [failed, setFailed] = useState(false);

  const pick = (line: BomLine) => {
    // Picking the same line again steps through the parts it stands for.
    const index = selectedId ? line.partIds.indexOf(selectedId) : -1;
    useUiStore.getState().select(line.partIds[(index + 1) % line.partIds.length] ?? null);
  };
  const onDownload = async () => {
    setFailed(false);
    try {
      await exportDesign("parts-csv", doc, units);
    } catch (error) {
      console.error(error);
      setFailed(true);
    }
  };

  return (
    <section className="parts-list" aria-label="Parts list" data-testid="parts-list">
      <div className="parts-list-inner">
        <header className="parts-list-head">
          <div>
            <h2>Parts list</h2>
            <p className="muted">
              {bom.count === 0
                ? "Nothing to buy yet."
                : `${bom.count} ${bom.count === 1 ? "part" : "parts"}, ${formatMoney(bom.total, bom.currency)}. Pick a line to change its price.`}
            </p>
          </div>
          <button
            type="button"
            className="button"
            data-testid="parts-csv"
            disabled={bom.count === 0}
            onClick={onDownload}
          >
            <DownloadIcon />
            <span>Download CSV</span>
          </button>
        </header>
        {failed && (
          <p className="notice" role="alert">
            Could not create the file. Please try again.
          </p>
        )}

        {bom.count === 0 ? (
          <p className="parts-list-empty">Add parts to the van and they are listed here.</p>
        ) : (
          <table className="parts-table">
            <thead>
              <tr>
                <th scope="col" className="is-number">
                  Qty
                </th>
                <th scope="col">Part</th>
                <th scope="col" className="parts-size">
                  Size
                </th>
                <th scope="col" className="is-number">
                  Each
                </th>
                <th scope="col" className="is-number">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {bom.lines.map((line) => {
                const catalogPrice = getPartDefinition(line.defId)?.price.fixed;
                const selected = selectedId !== null && line.partIds.includes(selectedId);
                return (
                  <tr
                    key={line.partIds[0]}
                    data-testid={`parts-line-${line.partIds[0]}`}
                    data-selected={selected}
                  >
                    <td className="is-number" data-testid="parts-quantity">
                      {line.quantity}
                    </td>
                    <th scope="row">
                      <button type="button" className="parts-pick" onClick={() => pick(line)}>
                        <span className={`swatch part--${line.category}`} aria-hidden="true" />
                        <span className="parts-name">
                          <span>{line.name}</span>
                          <span className="parts-category">{categoryLabels[line.category]}</span>
                        </span>
                      </button>
                    </th>
                    <td className="parts-size">
                      {formatSize([line.width, line.depth, line.height], units)}
                    </td>
                    <td className="is-number">
                      {formatMoney(line.unitPrice, line.currency)}
                      {catalogPrice !== line.unitPrice && (
                        <span className="parts-own" title="You typed this price">
                          your price
                        </span>
                      )}
                    </td>
                    <td className="is-number" data-testid="parts-line-total">
                      {formatMoney(line.total, line.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="is-number">{bom.count}</td>
                <th scope="row">Total</th>
                <td className="parts-size" />
                <td />
                <td className="is-number" data-testid="parts-total">
                  {formatMoney(bom.total, bom.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
        <p className="hint">
          Catalog prices are rough guides. Parts with the same name, size and price are counted
          together.
        </p>
      </div>
    </section>
  );
}
