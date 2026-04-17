export function SectionTable({ title, subtitle, columns, rows, emptyLabel }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-card">
      <header className="border-b border-slate-200 p-5">
        <h2 className="text-lg font-semibold text-med-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  {columns.map((column) => (
                    <td key={`${row.id}-${column.key}`} className="px-4 py-3 text-slate-700">
                      {row[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-slate-500" colSpan={columns.length}>
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
