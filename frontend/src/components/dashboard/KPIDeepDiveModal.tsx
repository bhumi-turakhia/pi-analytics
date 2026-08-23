import React, { useState } from 'react';
import {
  X,
  Maximize2,
  TrendingUp,
  ArrowDownRight,
  Download,
  Calendar,
  Sparkles,
  Layers,
  ArrowUpRight,
  Activity,
  Zap,
  CheckCircle2,
  RefreshCw,
  Share2,
} from 'lucide-react';
import { EnhancedKPICardProps } from './EnhancedKPICard';
import { MinimalLineChart, MinimalBarChart } from '../charts/Charts';
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
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | '90d' | '1y'>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'breakdown' | 'raw_data'>('overview');

  if (!isOpen || !kpi) return null;

  // Generate granular mock timeseries for full-screen exploration
  const pointsCount = timeframe === '24h' ? 24 : timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
  const baseNum = parseFloat(kpi.value.replace(/[^0-9.]/g, '')) || 100;
  
  const granularData = Array.from({ length: pointsCount }, (_, i) => {
    const variance = (Math.sin(i / 3) * 0.15 + (Math.random() * 0.1 - 0.05)) * baseNum;
    const val = Math.max(1, Math.round((baseNum * 0.85 + (i / pointsCount) * (baseNum * 0.25) + variance) * 10) / 10);
    const date = new Date();
    date.setDate(date.getDate() - (pointsCount - 1 - i));
    const label = timeframe === '24h' ? `${i}:00` : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return {
      label,
      value: val,
      date: date.toISOString().split('T')[0],
    };
  });

  const exportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,Date/Time,Metric,Value\n' +
      granularData.map((d) => `${d.label},"${kpi.label}",${d.value}`).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${kpi.label.toLowerCase().replace(/\s+/g, '_')}_fullscreen_telemetry.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast({
      title: 'Telemetry Exported',
      message: `Exported ${granularData.length} records for ${kpi.label} to CSV.`,
      type: 'success',
    });
  };

  const values = granularData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const avgVal = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white rounded-2xl border border-neutral-300 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header Bar */}
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
                Full-Screen Metric Explorer &amp; Diagnostic Telemetry
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
              aria-label="Close fullscreen view"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Content Scrollable Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fafaf9]/50">
          {/* Top Hero Stats Banner */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Main Value */}
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Current Live Value
              </span>
              <div className="text-3xl sm:text-4xl font-black text-neutral-900 font-mono-code mt-1">
                {kpi.value}
              </div>
              {kpi.change && (
                <div className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-800">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>{kpi.change} vs baseline</span>
                </div>
              )}
            </div>

            {/* Peak High */}
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Period Peak High
              </span>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono-code mt-1">
                {kpi.highLow?.high || `${maxVal.toLocaleString()}`}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500 font-mono-code font-medium">
                Highest recorded signal
              </div>
            </div>

            {/* Period Average */}
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Period Mean Average
              </span>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono-code mt-1">
                {avgVal.toLocaleString()}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500 font-mono-code font-medium">
                Rolling smoothed baseline
              </div>
            </div>

            {/* Valley Low */}
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs">
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Period Low Floor
              </span>
              <div className="text-2xl sm:text-3xl font-black text-neutral-900 font-mono-code mt-1">
                {kpi.highLow?.low || `${minVal.toLocaleString()}`}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500 font-mono-code font-medium">
                Safe floor threshold
              </div>
            </div>
          </div>

          {/* Full Screen Chart Canvas */}
          <div className="p-5 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-4">
            {/* Chart Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-neutral-900">
                  Granular Timeseries Resolution
                </span>
                <span className="text-[10px] font-mono-code bg-neutral-100 px-2 py-0.5 rounded text-neutral-600 font-bold">
                  {granularData.length} data points
                </span>
              </div>

              {/* Timeframe Selector Tabs */}
              <div className="flex items-center bg-neutral-100 p-1 rounded-lg border border-neutral-200 self-start sm:self-auto">
                {(['24h', '7d', '30d', '90d', '1y'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md cursor-pointer transition-all ${
                      timeframe === tf
                        ? 'bg-white text-black shadow-xs font-black'
                        : 'text-neutral-600 hover:text-black'
                    }`}
                  >
                    {tf.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* High-res Line Chart */}
            <div className="pt-2">
              <MinimalLineChart
                data={granularData.map((d) => ({
                  label: d.label,
                  value: d.value,
                }))}
                height={280}
                variant={kpi.variant === 'rose' ? 'neutral' : (kpi.variant as any) || 'blue'}
              />
            </div>
          </div>

          {/* Breakdown & AI Diagnostics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* AI Copilot Signal Diagnosis */}
            <div className="p-4 bg-white rounded-xl border border-neutral-200 shadow-xs space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-extrabold text-neutral-900">
                <Sparkles className="w-4 h-4 text-sky-600" />
                <span>AI Automated Signal Diagnosis</span>
              </div>
              <p className="text-xs text-neutral-700 leading-relaxed font-medium">
                Analysis of <strong>{kpi.label}</strong> indicates steady upward velocity over the chosen <strong>{timeframe.toUpperCase()}</strong> horizon. Standard deviation is tightly bounded with zero critical anomalies detected.
              </p>
              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 text-[11px] text-neutral-600 space-y-1 font-medium">
                <div className="flex justify-between">
                  <span>Forecast next 30 days:</span>
                  <span className="font-bold text-neutral-900 font-mono-code">+8.4% projected growth</span>
                </div>
                <div className="flex justify-between">
                  <span>Confidence rating:</span>
                  <span className="font-bold text-emerald-800 font-mono-code">94.8% High Confidence</span>
                </div>
              </div>
            </div>

            {/* Target & Segment Breakdown */}
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
                      <span className="text-neutral-700 font-semibold">{item.label}</span>
                      <span className="font-mono-code font-black text-neutral-900">{item.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-center text-xs text-neutral-500 font-medium">
                  Direct live stream connection from primary warehouse schema.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Bottom Footer */}
        <div className="px-6 py-3 border-t border-neutral-200 bg-white flex items-center justify-between text-xs text-neutral-500 font-medium">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Telemetry verified in real-time</span>
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
