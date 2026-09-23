import React, { useMemo } from 'react';
import {
  X,
  Download,
  TrendingUp,
  Sparkles,
  Layers,
  Activity,
} from 'lucide-react';
import { EnhancedKPICardProps } from './EnhancedKPICard';
import { MinimalBarChart } from '../charts/Charts';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useToast } from '../ui/Toast';

export interface KPIDeepDiveModalProps {
  kpi: EnhancedKPICardProps | null;
  isOpen: boolean;
  onClose: () => void;
}

export const KPIDeepDiveModal: React.FC<KPIDeepDiveModalProps> = ({
  kpi,
  isOpen,
  onClose,
}) => {
  const { showToast } = useToast();

  if (!isOpen || !kpi) return null;

  const breakdownData = useMemo(() => {
    if (!kpi.breakdown || kpi.breakdown.length === 0) {
      return [];
    }

    return kpi.breakdown.map((item) => ({
      label: item.label,
      value:
        typeof item.value === 'number'
          ? item.value
          : parseFloat(String(item.value).replace(/[^0-9.-]/g, '')) || 0,
    }));
  }, [kpi.breakdown]);

  const values = breakdownData.map((item) => item.value);
  const minVal = values.length > 0 ? Math.min(...values) : null;
  const maxVal = values.length > 0 ? Math.max(...values) : null;
  const avgVal =
    values.length > 0
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;

  const exportCSV = () => {
    if (breakdownData.length === 0) {
      showToast(
        'error',
        'No Data Available',
        'There are no source-backed KPI breakdown values to export.'
      );
      return;
    }

    const csvContent =
      'data:text/csv;charset=utf-8,Category,Metric,Value\n' +
      breakdownData
        .map(
          (item) =>
            `"${item.label.replace(/"/g, '""')}","${kpi.label.replace(/"/g, '""')}",${item.value}`
        )
        .join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `${kpi.label.toLowerCase().replace(/\s+/g, '_')}_kpi_breakdown.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(
      'success',
      'KPI Data Exported',
      `Exported ${breakdownData.length} source-backed records for ${kpi.label}.`
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-2xl border border-neutral-300 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-neutral-200 bg-gradient-to-r from-neutral-50 via-white to-neutral-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-black text-white flex items-center justify-center font-bold shadow-sm">
              {kpi.icon || <Activity className="w-5 h-5" />}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-neutral-900 tracking-tight">
                  {kpi.label}
                </h2>

                {kpi.badge && (
                  <Badge variant="black" size="xs">
                    {kpi.badge}
                  </Badge>
                )}
              </div>

              <p className="text-xs text-neutral-500 font-medium">
                KPI Detail &amp; Source Data
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={exportCSV}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export CSV
            </Button>

            <button
              onClick={onClose}
              className="p-2 text-neutral-500 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
              aria-label="Close KPI detail"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fafaf9]/50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Current Value
              </span>

              <div className="text-3xl sm:text-4xl font-black text-neutral-900 font-mono-code mt-1">
                {kpi.value}
              </div>

              {kpi.change && (
                <div className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-800">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{kpi.change}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Highest Supplied Value
              </span>

              <div className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono-code mt-1">
                {kpi.highLow?.high ?? (maxVal !== null ? maxVal.toLocaleString() : 'N/A')}
              </div>

              <div className="mt-2 text-[11px] text-neutral-500 font-mono-code font-medium">
                From KPI result
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Supplied Value Average
              </span>

              <div className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono-code mt-1">
                {avgVal !== null ? avgVal.toLocaleString() : 'N/A'}
              </div>

              <div className="mt-2 text-[11px] text-neutral-500 font-mono-code font-medium">
                Calculated from supplied values
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Lowest Supplied Value
              </span>

              <div className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono-code mt-1">
                {kpi.highLow?.low ?? (minVal !== null ? minVal.toLocaleString() : 'N/A')}
              </div>

              <div className="mt-2 text-[11px] text-neutral-500 font-mono-code font-medium">
                From KPI result
              </div>
            </div>
          </div>

          <div className="p-5 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-neutral-900">
                  Supplied KPI Breakdown
                </span>

                <span className="text-[10px] font-mono-code bg-neutral-100 px-2 py-0.5 rounded text-neutral-600 font-bold">
                  {breakdownData.length} values
                </span>
              </div>
            </div>

            {breakdownData.length > 0 ? (
              <MinimalBarChart
                data={breakdownData}
                height={280}
                xKey="label"
                yKey="value"
              />
            ) : (
              <div className="p-8 text-center bg-neutral-50 rounded-lg border border-neutral-200 text-xs text-neutral-500">
                No KPI breakdown data was supplied by the connected source.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-neutral-900">
                <Sparkles className="w-4 h-4 text-sky-600" />
                <span>KPI Context</span>
              </div>

              <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                This view displays values supplied by the KPI result. No
                client-side business metrics, forecasts, confidence scores, or
                historical telemetry are generated here.
              </p>

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-[11px] text-neutral-600">
                <div className="flex justify-between">
                  <span>Source-backed values:</span>
                  <span className="font-bold text-neutral-900 font-mono-code">
                    {breakdownData.length}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between text-xs font-extrabold text-neutral-900">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span>Segment Distribution &amp; Target</span>
                </span>

                {kpi.target && (
                  <span className="text-[10px] font-mono-code text-neutral-500 font-bold">
                    Goal: {kpi.target.label}
                  </span>
                )}
              </div>

              {kpi.breakdown && kpi.breakdown.length > 0 ? (
                <div className="space-y-2">
                  {kpi.breakdown.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center justify-between text-xs font-medium"
                    >
                      <span className="text-neutral-700 font-semibold">
                        {item.label}
                      </span>

                      <span className="font-mono-code font-black text-neutral-900">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-center text-xs text-neutral-500 font-medium">
                  No breakdown values were returned by the KPI source.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-neutral-200 bg-white flex items-center justify-between text-xs text-neutral-500 font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Values sourced from KPI result</span>
          </div>

          <Button variant="primary" size="sm" onClick={onClose}>
            Done Exploring
          </Button>
        </div>
      </div>
    </div>
  );
};

export default KPIDeepDiveModal;
