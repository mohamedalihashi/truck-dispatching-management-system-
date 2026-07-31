import { StatusBadge } from "./StatusBadge";
import { useLanguage } from "../../contexts/LanguageContext";

export function DataTable({ columns, rows, empty = "No records found." }) {
  const { t } = useLanguage();
  if (!rows?.length) {
    return (
      <p className="px-6 py-10 text-center text-sm text-on-surface-variant">
        {t(empty)}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left">
        <thead>
          <tr className="bg-surface-container-low">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
              >
                {t(col.label)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant">
          {rows.map((row) => (
            <tr
              key={row.id || row.key}
              className="transition hover:bg-on-tertiary-container/5"
            >
              {columns.map((col) => (
                <td key={col.key} className="px-6 py-4 text-sm text-on-surface">
                  {col.render
                    ? col.render(row)
                    : col.type === "status"
                      ? <StatusBadge status={row[col.key]} />
                      : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
