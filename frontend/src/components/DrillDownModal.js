import { Link } from "react-router-dom";
import Modal from "@/components/Modal";
import { Loader2 } from "lucide-react";

/**
 * DrillDownModal
 * Props:
 *   open      - boolean
 *   onClose   - () => void
 *   title     - string
 *   items     - array of objects | null (null = loading)
 *   columns?  - array of { key, label, render? }
 *               If omitted, defaults to [name/company, stage, monthly_spend/ltv].
 */
const DEFAULT_COLUMNS = [
  { key: "name",          label: "Name" },
  { key: "company",       label: "Company" },
  { key: "stage",         label: "Stage" },
];

export default function DrillDownModal({ open, onClose, title, items, columns }) {
  const cols = columns || DEFAULT_COLUMNS;

  return (
    <Modal open={open} onClose={onClose} title={title} testid="drilldown-modal" wide>
      {items === null ? (
        <div className="flex items-center justify-center py-12 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-zinc-400">No records found.</div>
      ) : (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm" data-testid="drilldown-table">
            <thead>
              <tr className="border-b border-zinc-100">
                {cols.map((c) => (
                  <th
                    key={c.key}
                    className="text-left text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 pb-2 pr-4 last:pr-0"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const id = item.lead_id ?? item.id;
                const row = (
                  <tr
                    key={id ?? idx}
                    data-testid={`drilldown-row-${id ?? idx}`}
                    className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors"
                  >
                    {cols.map((c) => (
                      <td key={c.key} className="py-2.5 pr-4 last:pr-0 text-zinc-700">
                        {c.render
                          ? c.render(item[c.key], item)
                          : (item[c.key] ?? "-")}
                      </td>
                    ))}
                  </tr>
                );

                // Wrap the first cell in a Link if we have an id
                if (id) {
                  return (
                    <tr
                      key={id ?? idx}
                      data-testid={`drilldown-row-${id ?? idx}`}
                      className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors"
                    >
                      {cols.map((c, ci) => (
                        <td key={c.key} className="py-2.5 pr-4 last:pr-0">
                          {ci === 0 ? (
                            <Link
                              to={`/leads/${id}`}
                              className="font-semibold text-zinc-900 hover:underline underline-offset-2"
                              onClick={onClose}
                            >
                              {c.render ? c.render(item[c.key], item) : (item[c.key] ?? "-")}
                            </Link>
                          ) : (
                            <span className="text-zinc-600">
                              {c.render ? c.render(item[c.key], item) : (item[c.key] ?? "-")}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                }

                return row;
              })}
            </tbody>
          </table>
          <div className="mt-3 text-right text-[11px] text-zinc-400 font-mono">
            {items.length} record{items.length !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </Modal>
  );
}
