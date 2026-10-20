import { formatScore, scoreKey, withComputed, type Instrument, type Scores } from "@/lib/instruments";

// Tabelas de escores somente leitura (ficha e visualização do teste).
export function ScoreTables({ instrument, scores }: { instrument: Instrument; scores: Scores }) {
  const all = withComputed(instrument, scores);
  return (
    <div className="flex flex-col gap-6">
      {instrument.tables.map((table) => (
        <div key={table.title}>
          <h3 className="mb-2 text-sm font-bold">{table.title}</h3>
          <div className="overflow-x-auto rounded-xl border border-ink/10">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-cream/50 text-xs text-ink/60">
                <tr>
                  <th className="px-4 py-2.5 font-semibold" />
                  {table.columns.map((c) => (
                    <th key={c.key} className="px-4 py-2.5 text-right font-semibold">
                      {c.label}
                      {c.unit && <span className="font-normal text-ink/45"> ({c.unit})</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8">
                {table.rows.map((r) => (
                  <tr key={r.key}>
                    <th className="px-4 py-2.5 font-medium">
                      {r.label}
                      {r.hint && <span className="block text-xs font-normal text-ink/50">{r.hint}</span>}
                    </th>
                    {table.columns.map((c) => (
                      <td key={c.key} className="px-4 py-2.5 text-right tabular-nums">
                        {r.skip?.includes(c.key) ? "" : formatScore(all[scoreKey(r.key, c.key)])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
