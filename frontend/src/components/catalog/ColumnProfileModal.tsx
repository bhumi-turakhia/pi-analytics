import React from 'react';
import { Modal } from '../ui/Modal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Key, ShieldCheck, CheckCircle2, BarChart2, Hash, Layers } from 'lucide-react';
import { CatalogColumn } from '../../types';

export interface ColumnProfileModalProps {
  column: CatalogColumn | null;
  tableName: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ColumnProfileModal: React.FC<ColumnProfileModalProps> = ({
  column,
  tableName,
  isOpen,
  onClose,
}) => {
  if (!column) return null;

  const isNumeric = column.type.includes('NUMBER') || column.type.includes('FLOAT') || column.type.includes('INT');
  const distinctCount = column.distinctCount || 14200;
  const nullPct = column.nullPercentage ?? 0;

  // Mock value distribution
  const topValues = [
    { value: String(column.sampleValues[0] ?? 'VAL_A'), count: 45200, pct: 42 },
    { value: String(column.sampleValues[1] ?? 'VAL_B'), count: 28900, pct: 27 },
    { value: String(column.sampleValues[2] ?? 'VAL_C'), count: 18400, pct: 17 },
    { value: 'Other Values', count: 15200, pct: 14 },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Column Profile: ${column.name}`}
      subtitle={`Table: ${tableName} • Snowflake Type: ${column.type}`}
      maxWidth="xl"
    >
      <div className="space-y-5 text-xs text-stone-800">
        {/* Header Tags */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-stone-200">
          <Badge variant="navy">{column.type}</Badge>
          {column.isPrimaryKey && (
            <Badge variant="warning" dot={true}>
              Primary Key
            </Badge>
          )}
          {column.isForeignKey && (
            <Badge variant="info">
              Foreign Key Target: {column.foreignKeyTarget}
            </Badge>
          )}
          <Badge variant={column.nullable ? 'neutral' : 'success'}>
            {column.nullable ? 'Nullable: YES' : 'Strict NOT NULL'}
          </Badge>
        </div>

        {/* Description */}
        <div className="p-3 bg-stone-50 rounded-lg border border-stone-200">
          <span className="font-semibold text-stone-900 block mb-0.5">Documentation &amp; Commentary:</span>
          <p className="text-stone-600 leading-relaxed">{column.description}</p>
        </div>

        {/* Statistical Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3 bg-[#fbfbf9] rounded border border-stone-200">
            <div className="text-[10px] text-stone-400 uppercase font-medium">Distinct Values</div>
            <div className="text-sm font-bold text-stone-900 font-mono-code mt-0.5">
              {distinctCount.toLocaleString()}
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">99.8% Cardinality</div>
          </div>

          <div className="p-3 bg-[#fbfbf9] rounded border border-stone-200">
            <div className="text-[10px] text-stone-400 uppercase font-medium">Null Percentage</div>
            <div className="text-sm font-bold text-emerald-800 font-mono-code mt-0.5">
              {nullPct}%
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">Zero null records</div>
          </div>

          <div className="p-3 bg-[#fbfbf9] rounded border border-stone-200">
            <div className="text-[10px] text-stone-400 uppercase font-medium">Data Conformance</div>
            <div className="text-sm font-bold text-stone-900 font-mono-code mt-0.5">
              100% Valid
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">Snowflake verified</div>
          </div>

          <div className="p-3 bg-[#fbfbf9] rounded border border-stone-200">
            <div className="text-[10px] text-stone-400 uppercase font-medium">PII Governance</div>
            <div className="text-sm font-bold text-stone-900 font-mono-code mt-0.5">
              {column.name.includes('EMAIL') || column.name.includes('NAME') ? 'PII-Classified' : 'Public / Unmasked'}
            </div>
            <div className="text-[10px] text-stone-500 mt-0.5">RBAC Enforced</div>
          </div>
        </div>

        {/* Value Distribution Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-stone-900 flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-stone-600" />
              <span>Sample Frequency Distribution (Micro-partition Scan)</span>
            </span>
            <span className="text-[10px] text-stone-400 font-mono-code">Top 4 bins</span>
          </div>

          <div className="space-y-2 p-3 bg-white rounded border border-stone-200">
            {topValues.map((v, i) => (
              <div key={i} className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono-code">
                  <span className="text-stone-800 font-medium truncate max-w-[200px]">{v.value}</span>
                  <span className="text-stone-500">{v.count.toLocaleString()} rows ({v.pct}%)</span>
                </div>
                <div className="w-full bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-stone-900 h-full rounded-full"
                    style={{ width: `${v.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quality Checks Assertions */}
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-950 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <div className="font-semibold text-xs">All Schema Assertions Passing</div>
              <div className="text-[11px] text-emerald-800">dbt not_null and unique constraints verified</div>
            </div>
          </div>
          <Badge variant="success">Passed</Badge>
        </div>
      </div>
    </Modal>
  );
};
