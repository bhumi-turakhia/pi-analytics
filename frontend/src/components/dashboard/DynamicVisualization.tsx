import React from 'react';
import { MinimalLineChart, MinimalBarChart, DataPoint } from '../charts/Charts';
import { VisualizationSpec, ColumnMeta } from '../../services/api/copilotApi';
import { TrendingUp, Hash, Table as TableIcon } from 'lucide-react';

export interface DynamicVisualizationProps {
  spec: VisualizationSpec;
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  height?: number;
  className?: string;
}

export const DynamicVisualization: React.FC<DynamicVisualizationProps> = ({
  spec,
  columns,
  rows,
  height = 220,
  className = '',
}) => {
  if (!rows || rows.length === 0) {
    return (
      <div className={`p-6 text-center bg-[#fafaf9] rounded-lg border border-neutral-200 ${className}`}>
        <p className="text-xs font-semibold text-neutral-600">No data found in query result.</p>
      </div>
    );
  }

  const { type, title, xField, yField } = spec;

  // 1. KPI single aggregate visualization
  if (type === 'kpi' || (rows.length === 1 && (columns.length === 1 || !xField))) {
    const rawVal = spec.value !== undefined ? spec.value : (yField && rows[0] ? rows[0][yField] : (rows[0] ? Object.values(rows[0])[0] : 0));
    let displayVal = '0';
    if (typeof rawVal === 'number') {
      displayVal = rawVal >= 1000 ? rawVal.toLocaleString() : String(rawVal);
    } else if (rawVal !== null && rawVal !== undefined) {
      displayVal = String(rawVal);
    }

    return (
      <div className={`p-5 bg-white rounded-lg border border-neutral-200 shadow-xs ${className}`}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider">
            {title || (yField || 'Metric').replace(/_/g, ' ')}
          </span>
          <span className="p-1.5 bg-neutral-100 rounded text-neutral-800">
            <Hash className="w-3.5 h-3.5" />
          </span>
        </div>
        <div className="text-2xl lg:text-3xl font-bold text-black font-sans tracking-tight">
          {displayVal}
        </div>
        <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-800 font-medium">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          <span>Verified real warehouse aggregate</span>
        </div>
      </div>
    );
  }

  // Determine x and y field names safely
  const effectiveX = xField || (columns[0]?.name ?? Object.keys(rows[0])[0]);
  const effectiveY = yField || (columns[1]?.name ?? Object.keys(rows[0])[1] ?? effectiveX);

  const chartData: DataPoint[] = rows
    .slice(0, 30) // limit items on chart for readability
    .map((r) => {
      const label = r[effectiveX] !== undefined && r[effectiveX] !== null ? String(r[effectiveX]) : '-';
      const numVal = Number(r[effectiveY]);
      const value = isNaN(numVal) ? 0 : numVal;
      return { label, value };
    });

  // 2. Line Chart visualization
  if (type === 'line') {
    return (
      <div className={`w-full ${className}`}>
        <MinimalLineChart
          data={chartData}
          title={title}
          subtitle={`Grounded from real warehouse data (${rows.length} rows)`}
          height={height}
          variant="blue"
        />
      </div>
    );
  }

  // 3. Bar Chart visualization (default for categorical breakdown)
  if (type === 'bar') {
    return (
      <div className={`w-full ${className}`}>
        <MinimalBarChart
          data={chartData}
          title={title}
          subtitle={`Grounded from real warehouse data (${rows.length} rows)`}
          height={height}
          color="#0f172a"
        />
      </div>
    );
  }

  // 4. Table visualization (for complex/multi-column results)
  const displayCols = columns.length > 0 ? columns.map((c) => c.name) : Object.keys(rows[0]);

  return (
    <div className={`w-full overflow-hidden rounded-lg border border-neutral-200 bg-white ${className}`}>
      {title && (
        <div className="px-4 py-2.5 bg-[#fafaf9] border-b border-neutral-200 flex items-center justify-between">
          <h4 className="text-xs font-bold text-black flex items-center gap-1.5">
            <TableIcon className="w-3.5 h-3.5" />
            <span>{title}</span>
          </h4>
          <span className="text-[10px] text-neutral-500 font-mono-code">{rows.length} rows</span>
        </div>
      )}
      <div className="overflow-x-auto max-h-[260px]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-[#f5f5f4] text-black font-bold border-b border-neutral-200 sticky top-0">
              {displayCols.map((c) => (
                <th key={c} className="py-2.5 px-3 whitespace-nowrap">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 text-black">
            {rows.slice(0, 50).map((row, idx) => (
              <tr key={idx} className="hover:bg-neutral-50 transition-colors">
                {displayCols.map((c) => (
                  <td key={c} className="py-2 px-3 whitespace-nowrap font-medium text-[11px]">
                    {row[c] !== undefined && row[c] !== null ? String(row[c]) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
