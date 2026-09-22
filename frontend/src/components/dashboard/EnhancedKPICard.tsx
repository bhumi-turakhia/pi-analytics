import React, { useState } from 'react';
import {
  TrendingUp,
  ArrowDownRight,
  Activity,
  DollarSign,
  Layers,
  Zap,
  CheckCircle2,
  Database,
  ChevronRight,
  Sparkles,
  Maximize2,
} from 'lucide-react';
import { MetricSparkline, SparklineVariant } from '../charts/Charts';
import { KPIDeepDiveModal } from './KPIDeepDiveModal';

export interface EnhancedKPICardProps {
  id?: string;
  label: string;
  value: string;
  change?: string;
  isPositive?: boolean;
  subtext?: string;
  sparkline?: number[];
  variant?: 'emerald' | 'blue' | 'indigo' | 'amber' | 'neutral' | 'rose';
  type?: 'currency' | 'percent' | 'count' | 'speed' | 'storage' | 'sla';
  target?: {
    current: number;
    goal: number;
    label: string;
  };
  breakdown?: { label: string; value: string }[];
  highLow?: { high: string; low: string };
  badge?: string;
  icon?: React.ReactNode;
  onDrilldown?: () => void;
  className?: string;
}

export const EnhancedKPICard: React.FC<EnhancedKPICardProps> = (props) => {
  const {
    label,
    value,
    change,
    isPositive = true,
    subtext,
    sparkline,
    variant = 'blue',
    type = 'count',
    target,
    breakdown,
    highLow,
    badge,
    icon,
    onDrilldown,
    className = '',
  } = props;

  const [selectedRange, setSelectedRange] = useState<'7d' | '30d'>('7d');
  const [showDeepDive, setShowDeepDive] = useState(false);

  // Curated theme styles
  const variantStyles = {
    emerald: {
      border: 'border-neutral-200 hover:border-emerald-500/70',
      shadow: 'hover:shadow-[0_8px_24px_-4px_rgba(5,150,105,0.12)]',
      topLine: 'bg-emerald-500',
      iconContainer: 'bg-emerald-50 text-emerald-600 border-emerald-200/80',
      accentColor: '#059669',
      pulseDot: 'bg-emerald-500',
      sparkVariant: 'emerald' as SparklineVariant,
    },
    blue: {
      border: 'border-neutral-200 hover:border-sky-500/70',
      shadow: 'hover:shadow-[0_8px_24px_-4px_rgba(2,132,199,0.12)]',
      topLine: 'bg-sky-500',
      iconContainer: 'bg-sky-50 text-sky-600 border-sky-200/80',
      accentColor: '#0284c7',
      pulseDot: 'bg-sky-500',
      sparkVariant: 'blue' as SparklineVariant,
    },
    indigo: {
      border: 'border-neutral-200 hover:border-indigo-500/70',
      shadow: 'hover:shadow-[0_8px_24px_-4px_rgba(79,70,229,0.12)]',
      topLine: 'bg-indigo-500',
      iconContainer: 'bg-indigo-50 text-indigo-600 border-indigo-200/80',
      accentColor: '#4f46e5',
      pulseDot: 'bg-indigo-500',
      sparkVariant: 'indigo' as SparklineVariant,
    },
    amber: {
      border: 'border-neutral-200 hover:border-amber-500/70',
      shadow: 'hover:shadow-[0_8px_24px_-4px_rgba(217,119,6,0.12)]',
      topLine: 'bg-amber-500',
      iconContainer: 'bg-amber-50 text-amber-600 border-amber-200/80',
      accentColor: '#d97706',
      pulseDot: 'bg-amber-500',
      sparkVariant: 'amber' as SparklineVariant,
    },
    rose: {
      border: 'border-neutral-200 hover:border-rose-500/70',
      shadow: 'hover:shadow-[0_8px_24px_-4px_rgba(225,29,72,0.12)]',
      topLine: 'bg-rose-500',
      iconContainer: 'bg-rose-50 text-rose-600 border-rose-200/80',
      accentColor: '#e11d48',
      pulseDot: 'bg-rose-500',
      sparkVariant: 'rose' as SparklineVariant,
    },
    neutral: {
      border: 'border-neutral-200 hover:border-neutral-400',
      shadow: 'hover:shadow-[0_8px_24px_-4px_rgba(15,23,42,0.08)]',
      topLine: 'bg-neutral-800',
      iconContainer: 'bg-neutral-100 text-neutral-700 border-neutral-200',
      accentColor: '#1e293b',
      pulseDot: 'bg-neutral-700',
      sparkVariant: 'neutral' as SparklineVariant,
    },
  }[variant];

  // Default icons based on KPI type
  const getDefaultIcon = () => {
    switch (type) {
      case 'currency':
        return <DollarSign className="w-3.5 h-3.5 stroke-[2.5]" />;
      case 'percent':
        return <Activity className="w-3.5 h-3.5 stroke-[2.5]" />;
      case 'sla':
        return <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />;
      case 'speed':
        return <Zap className="w-3.5 h-3.5 stroke-[2.5]" />;
      case 'storage':
        return <Layers className="w-3.5 h-3.5 stroke-[2.5]" />;
      default:
        return <Database className="w-3.5 h-3.5 stroke-[2.5]" />;
    }
  };

  const percentProgress = target
    ? Math.min(100, Math.round((target.current / target.goal) * 100))
    : null;

  // Simulated 30d trend when 30d toggle is selected
  const activeSparkline = sparkline
    ? selectedRange === '30d'
      ? [...sparkline.map((v) => Math.round(v * 0.94)), ...sparkline]
      : sparkline
    : undefined;

  return (
    <>
      <div
        className={`group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-white p-4 shadow-xs transition-all duration-200 hover:-translate-y-0.5 ${
          variantStyles.border
        } ${variantStyles.shadow} ${className}`}
      >
        {/* Top Accent Color Bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-[2.5px] ${variantStyles.topLine} opacity-80 group-hover:opacity-100 transition-opacity`}
        />

        {/* ── ZONE 1: Header (Clean Icon & Metric Title with Zero Collisions) ── */}
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div
                className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 shadow-2xs ${variantStyles.iconContainer}`}
              >
                {icon || getDefaultIcon()}
              </div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 group-hover:text-black transition-colors truncate leading-tight">
                {label}
              </span>
            </div>

            {/* Deep Dive Fullscreen Trigger */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeepDive(true);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-neutral-400 hover:text-black hover:bg-neutral-100 rounded cursor-pointer shrink-0"
              title="Expand to Fullscreen Explorer"
              aria-label="Expand to Fullscreen"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── ZONE 2: Hero Metric Value & Trend Badge ── */}
          <div className="mt-3 mb-2">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-2xl sm:text-[26px] font-extrabold text-neutral-950 tracking-tight font-mono-code leading-none">
                {value}
              </span>

              {/* Trend Pill - Positioned beside metric, never overlapping header */}
              {change && (
                <div
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border shrink-0 ${
                    isPositive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                      : 'bg-rose-50 text-rose-700 border-rose-200/80'
                  }`}
                >
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3 stroke-[2.5]" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 stroke-[2.5]" />
                  )}
                  <span>{change}</span>
                </div>
              )}
            </div>

            {/* Structured High/Low Benchmark Context & Status Badge */}
            <div className="flex items-center justify-between gap-2 flex-wrap mt-1.5">
              {highLow && (
                <div className="flex items-center gap-1.5 text-[10.5px] font-mono-code text-neutral-500">
                  <span>
                    High: <strong className="text-neutral-800 font-semibold">{highLow.high}</strong>
                  </span>
                  <span className="text-neutral-300">·</span>
                  <span>
                    Low: <strong className="text-neutral-700 font-medium">{highLow.low}</strong>
                  </span>
                </div>
              )}

              {badge && (
                <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-neutral-100 border border-neutral-200/70 text-[9.5px] font-mono-code font-semibold text-neutral-600">
                  <span className={`w-1.5 h-1.5 rounded-full ${variantStyles.pulseDot} shrink-0`} />
                  <span className="truncate">{badge}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── ZONE 3: Target Goal Progress OR Breakdown Segments ── */}
          {target && percentProgress !== null && (
            <div className="my-2.5 p-2 rounded-lg bg-neutral-50 border border-neutral-200/70">
              <div className="flex items-center justify-between text-[10.5px] font-mono-code mb-1">
                <span className="text-neutral-600 font-medium truncate">{target.label}</span>
                <span className="font-bold text-neutral-900 ml-2 shrink-0">{percentProgress}% of goal</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-200/80 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${percentProgress}%`,
                    backgroundColor: variantStyles.accentColor,
                  }}
                />
              </div>
            </div>
          )}

          {breakdown && breakdown.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5 my-2.5">
              {breakdown.map((item, idx) => (
                <div
                  key={idx}
                  className="p-1.5 px-2 rounded-md bg-neutral-50 border border-neutral-200/70 text-[10.5px] font-mono-code flex items-center justify-between gap-1"
                >
                  <span className="text-neutral-500 font-medium truncate">{item.label}</span>
                  <span className="font-bold text-neutral-900 shrink-0">{item.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── ZONE 4: Sparkline Graph & Interactive Controls ── */}
        <div className="mt-2 pt-2.5 border-t border-neutral-100">
          {activeSparkline && activeSparkline.length > 0 && (
            <div>
              {/* Sparkline Header */}
              <div className="flex items-center justify-between text-[10px] font-mono-code text-neutral-500 mb-1.5">
                <span className="font-semibold flex items-center gap-1 text-neutral-500">
                  <Sparkles className="w-3 h-3 text-neutral-400" />
                  <span>Live Signal</span>
                </span>
                <div className="inline-flex items-center bg-neutral-100 p-0.5 rounded border border-neutral-200/70">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRange('7d');
                    }}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-colors ${
                      selectedRange === '7d'
                        ? 'bg-white text-black shadow-2xs'
                        : 'text-neutral-500 hover:text-black'
                    }`}
                  >
                    7D
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRange('30d');
                    }}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer transition-colors ${
                      selectedRange === '30d'
                        ? 'bg-white text-black shadow-2xs'
                        : 'text-neutral-500 hover:text-black'
                    }`}
                  >
                    30D
                  </button>
                </div>
              </div>

              {/* Sparkline Graphic */}
              <div className="h-10 w-full overflow-hidden">
                <MetricSparkline
                  data={activeSparkline}
                  variant={variantStyles.sparkVariant}
                  height={40}
                  width="100%"
                  showTooltip={true}
                  showLivePulse={true}
                  showGradient={true}
                  strokeWidth={2}
                />
              </div>
            </div>
          )}

          {/* ── ZONE 5: Clean Footer with Subtext and Drilldown ── */}
          <div className="mt-2 pt-2 border-t border-neutral-100 flex items-center justify-between text-[11px] font-medium text-neutral-500">
            <span className="truncate text-neutral-500 max-w-[150px] sm:max-w-none text-[10.5px]">
              {subtext || 'Active telemetry'}
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowDeepDive(true)}
                className="text-[10px] font-bold text-neutral-500 hover:text-black cursor-pointer hidden sm:inline-block"
              >
                Fullscreen
              </button>
              {onDrilldown && (
                <button
                  onClick={onDrilldown}
                  className="text-[10.5px] font-bold text-neutral-700 hover:text-black flex items-center gap-0.5 group-hover:translate-x-0.5 transition-all cursor-pointer"
                >
                  Explore <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Inspector Modal */}
      <KPIDeepDiveModal
        kpi={props}
        isOpen={showDeepDive}
        onClose={() => setShowDeepDive(false)}
      />
    </>
  );
};

export default EnhancedKPICard;

