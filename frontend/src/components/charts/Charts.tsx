import React, { useState, useId } from 'react';

export interface DataPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  meta?: string;
}

export type SparklineVariant = 'emerald' | 'rose' | 'blue' | 'indigo' | 'amber' | 'neutral' | 'auto';
export type SparklineType = 'area' | 'bar' | 'step';

export interface MetricSparklineProps {
  data: number[] | { label?: string; value: number }[];
  variant?: SparklineVariant;
  type?: SparklineType;
  height?: number;
  width?: number | string;
  showTooltip?: boolean;
  showLivePulse?: boolean;
  showGradient?: boolean;
  strokeWidth?: number;
  className?: string;
}

/**
 * Calculates smooth SVG path data using cubic bezier curves
 */
function getSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 5;
    const cp1y = p1.y + (p2.y - p0.y) / 5;
    const cp2x = p2.x - (p3.x - p1.x) / 5;
    const cp2y = p2.y - (p3.y - p1.y) / 5;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

const VARIANT_CONFIGS = {
  emerald: {
    stroke: '#059669', // Emerald 600
    fillStart: 'rgba(16, 185, 129, 0.28)',
    fillEnd: 'rgba(16, 185, 129, 0.01)',
    glow: 'rgba(16, 185, 129, 0.4)',
    dot: '#10b981',
  },
  rose: {
    stroke: '#e11d48', // Rose 600
    fillStart: 'rgba(244, 63, 94, 0.28)',
    fillEnd: 'rgba(244, 63, 94, 0.01)',
    glow: 'rgba(244, 63, 94, 0.4)',
    dot: '#f43f5e',
  },
  blue: {
    stroke: '#0284c7', // Sky 600
    fillStart: 'rgba(14, 165, 233, 0.28)',
    fillEnd: 'rgba(14, 165, 233, 0.01)',
    glow: 'rgba(14, 165, 233, 0.4)',
    dot: '#0284c7',
  },
  indigo: {
    stroke: '#4f46e5', // Indigo 600
    fillStart: 'rgba(99, 102, 241, 0.28)',
    fillEnd: 'rgba(99, 102, 241, 0.01)',
    glow: 'rgba(99, 102, 241, 0.4)',
    dot: '#6366f1',
  },
  amber: {
    stroke: '#d97706', // Amber 600
    fillStart: 'rgba(245, 158, 11, 0.28)',
    fillEnd: 'rgba(245, 158, 11, 0.01)',
    glow: 'rgba(245, 158, 11, 0.4)',
    dot: '#f59e0b',
  },
  neutral: {
    stroke: '#1e293b', // Slate 800
    fillStart: 'rgba(30, 41, 59, 0.16)',
    fillEnd: 'rgba(30, 41, 59, 0.01)',
    glow: 'rgba(30, 41, 59, 0.3)',
    dot: '#1e293b',
  },
};

/**
 * Enhanced High-Performance Interactive Sparkline Graph for all KPI Cards
 */
export const MetricSparkline: React.FC<MetricSparklineProps> = ({
  data,
  variant = 'auto',
  type = 'area',
  height = 36,
  width = '100%',
  showTooltip = true,
  showLivePulse = true,
  showGradient = true,
  strokeWidth = 2,
  className = '',
}) => {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) return null;

  // Normalize data points
  const rawValues: number[] = data.map((item) =>
    typeof item === 'number' ? item : item.value
  );
  const labels: string[] = data.map((item, idx) =>
    typeof item === 'number' ? `Point ${idx + 1}` : item.label || `Point ${idx + 1}`
  );

  const min = Math.min(...rawValues);
  const max = Math.max(...rawValues);
  const range = max - min || 1;

  // Determine variant automatically if set to 'auto'
  let resolvedVariant: keyof typeof VARIANT_CONFIGS = 'neutral';
  if (variant === 'auto') {
    const isGrowing = rawValues[rawValues.length - 1] >= rawValues[0];
    resolvedVariant = isGrowing ? 'emerald' : 'rose';
  } else if (variant in VARIANT_CONFIGS) {
    resolvedVariant = variant as keyof typeof VARIANT_CONFIGS;
  }

  const theme = VARIANT_CONFIGS[resolvedVariant] || VARIANT_CONFIGS.blue;

  // SVG dimensions
  const svgWidth = 200;
  const svgHeight = typeof height === 'number' ? height : 40;
  const paddingX = 6;
  const paddingTop = 4;
  const paddingBottom = 6;
  const plotWidth = svgWidth - paddingX * 2;
  const plotHeight = svgHeight - paddingTop - paddingBottom;

  const points = rawValues.map((val, idx) => {
    const x = paddingX + (idx / (rawValues.length - 1 || 1)) * plotWidth;
    const y = paddingTop + plotHeight - ((val - min) / range) * plotHeight;
    return { x, y, value: val, label: labels[idx] };
  });

  const pathD = getSmoothPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];
  const areaPathD = `${pathD} L ${lastPoint.x} ${svgHeight - 1} L ${firstPoint.x} ${svgHeight - 1} Z`;

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div
      className={`relative inline-block select-none ${className}`}
      style={{ width: typeof width === 'number' ? `${width}px` : width, height: svgHeight }}
    >
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme.fillStart} />
            <stop offset="100%" stopColor={theme.fillEnd} />
          </linearGradient>

          <filter id={`glow-${gradientId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor={theme.glow} />
          </filter>
        </defs>

        {/* Micro-bar histogram type */}
        {type === 'bar' && (
          <g>
            {points.map((p, idx) => {
              const barWidth = Math.max(3, (plotWidth / points.length) * 0.65);
              const barHeight = Math.max(3, svgHeight - paddingBottom - p.y);
              const isHovered = hoverIndex === idx;
              return (
                <rect
                  key={idx}
                  x={p.x - barWidth / 2}
                  y={p.y}
                  width={barWidth}
                  height={barHeight}
                  rx={2}
                  fill={isHovered ? theme.stroke : theme.dot}
                  opacity={isHovered ? 1 : 0.65}
                  className="transition-all duration-150 cursor-pointer"
                  onMouseEnter={() => setHoverIndex(idx)}
                  onMouseLeave={() => setHoverIndex(null)}
                />
              );
            })}
          </g>
        )}

        {/* Area / Smooth Line type */}
        {type !== 'bar' && (
          <>
            {/* Gradient Fill Area */}
            {showGradient && (
              <path
                d={areaPathD}
                fill={`url(#grad-${gradientId})`}
                className="transition-opacity duration-200"
              />
            )}

            {/* Smooth Baseline Path */}
            <path
              d={pathD}
              fill="none"
              stroke={theme.stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter={`url(#glow-${gradientId})`}
              className="transition-all duration-200"
            />

            {/* Live streaming pulsing dot on latest point */}
            {showLivePulse && hoverIndex === null && (
              <g>
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="5"
                  fill={theme.stroke}
                  opacity="0.3"
                  className="animate-ping origin-center"
                />
                <circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r="3"
                  fill="#ffffff"
                  stroke={theme.stroke}
                  strokeWidth="2"
                />
              </g>
            )}

            {/* Interactive hover targets and indicator */}
            {points.map((p, idx) => (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                {/* Hit area */}
                <rect
                  x={p.x - plotWidth / (points.length * 2)}
                  y={0}
                  width={plotWidth / points.length}
                  height={svgHeight}
                  fill="transparent"
                />
              </g>
            ))}

            {/* Active Hover Crosshair and Dot */}
            {hoveredPoint && (
              <g pointerEvents="none">
                <line
                  x1={hoveredPoint.x}
                  y1={0}
                  x2={hoveredPoint.x}
                  y2={svgHeight}
                  stroke={theme.stroke}
                  strokeWidth="1"
                  strokeDasharray="2 2"
                  opacity="0.6"
                />
                <circle
                  cx={hoveredPoint.x}
                  cy={hoveredPoint.y}
                  r="4"
                  fill="#ffffff"
                  stroke={theme.stroke}
                  strokeWidth="2.5"
                />
              </g>
            )}
          </>
        )}
      </svg>

      {/* Floating Hover Tooltip */}
      {showTooltip && hoveredPoint && (
        <div
          className="absolute -top-7 transform -translate-x-1/2 z-30 pointer-events-none bg-neutral-900 text-white text-[10px] font-mono-code font-bold px-1.5 py-0.5 rounded shadow-md border border-neutral-700 whitespace-nowrap flex items-center gap-1"
          style={{
            left: `${(hoveredPoint.x / svgWidth) * 100}%`,
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: theme.dot }} />
          <span>{hoveredPoint.value.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};

export const MinimalLineChart: React.FC<{
  data: DataPoint[];
  title?: string;
  subtitle?: string;
  unit?: string;
  height?: number;
  variant?: 'emerald' | 'blue' | 'indigo' | 'neutral';
}> = ({ data, title, subtitle, unit = '', height = 220, variant = 'blue' }) => {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || !data.length) return null;
  const values = data.map((d) => d.value);
  const min = Math.min(...values) * 0.95;
  const max = Math.max(...values) * 1.05;
  const range = max - min || 1;

  const paddingLeft = 44;
  const paddingRight = 20;
  const paddingTop = 16;
  const paddingBottom = 28;
  const chartWidth = 560;
  const chartHeight = height;

  const usableWidth = chartWidth - paddingLeft - paddingRight;
  const usableHeight = chartHeight - paddingTop - paddingBottom;

  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1 || 1)) * usableWidth;
    const y = paddingTop + usableHeight - ((d.value - min) / range) * usableHeight;
    return { x, y, ...d };
  });

  const pathD = getSmoothPath(points);
  const areaPathD = `${pathD} L ${points[points.length - 1].x} ${paddingTop + usableHeight} L ${points[0].x} ${paddingTop + usableHeight} Z`;

  const colors = {
    blue: { stroke: '#0284c7', fill: '#0284c7', bg: 'rgba(2, 132, 199, 0.12)' },
    emerald: { stroke: '#059669', fill: '#059669', bg: 'rgba(5, 150, 105, 0.12)' },
    indigo: { stroke: '#4f46e5', fill: '#4f46e5', bg: 'rgba(79, 70, 229, 0.12)' },
    neutral: { stroke: '#0f172a', fill: '#0f172a', bg: 'rgba(15, 23, 42, 0.08)' },
  }[variant];

  return (
    <div className="w-full">
      {(title || subtitle) && (
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            {title && <h4 className="text-xs font-bold text-black tracking-tight">{title}</h4>}
            {subtitle && <p className="text-[11px] text-neutral-600 font-medium">{subtitle}</p>}
          </div>
          {hoverIndex !== null && (
            <div className="text-xs font-mono-code font-bold text-black bg-[#fafaf9] px-2.5 py-1 rounded-md border border-neutral-300 shadow-2xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.stroke }} />
              <span>{data[hoverIndex].label}:</span>
              <span className="text-black">{data[hoverIndex].value.toLocaleString()} {unit}</span>
            </div>
          )}
        </div>
      )}

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            <linearGradient id={`main-grad-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.fill} stopOpacity="0.22" />
              <stop offset="100%" stopColor={colors.fill} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Subtle Gridlines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const y = paddingTop + usableHeight * (1 - pct);
            const val = min + range * pct;
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#e5e5e5"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[9.5px] fill-neutral-500 font-mono-code font-medium select-none"
                >
                  {Math.round(val).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Gradient Area Fill */}
          <path d={areaPathD} fill={`url(#main-grad-${gradientId})`} />

          {/* Smooth Line */}
          <path
            d={pathD}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* X Axis Labels */}
          {points.map((p, idx) => {
            const showLabel = points.length <= 8 || idx % Math.ceil(points.length / 7) === 0 || idx === points.length - 1;
            if (!showLabel) return null;
            return (
              <text
                key={idx}
                x={p.x}
                y={chartHeight - 8}
                textAnchor="middle"
                className="text-[9.5px] fill-neutral-600 font-mono-code font-medium select-none"
              >
                {p.label}
              </text>
            );
          })}

          {/* Interactive Hover Guides */}
          {hoverIndex !== null && (
            <line
              x1={points[hoverIndex].x}
              y1={paddingTop}
              x2={points[hoverIndex].x}
              y2={paddingTop + usableHeight}
              stroke={colors.stroke}
              strokeWidth="1.25"
              strokeDasharray="2 2"
            />
          )}

          {/* Interactive Points */}
          {points.map((p, idx) => (
            <g
              key={idx}
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={hoverIndex === idx ? 5 : 3}
                fill={hoverIndex === idx ? '#ffffff' : colors.stroke}
                stroke={colors.stroke}
                strokeWidth={hoverIndex === idx ? 2.5 : 1}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

export const MinimalBarChart: React.FC<{
  data: DataPoint[];
  title?: string;
  subtitle?: string;
  unit?: string;
  height?: number;
  color?: string;
}> = ({ data, title, subtitle, unit = '', height = 220, color = '#249cdb' }) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data.length) return null;
  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1) * 1.1;

  const paddingLeft = 44;
  const paddingRight = 20;
  const paddingTop = 16;
  const paddingBottom = 28;
  const chartWidth = 560;
  const chartHeight = height;

  const usableWidth = chartWidth - paddingLeft - paddingRight;
  const usableHeight = chartHeight - paddingTop - paddingBottom;
  const barSlotWidth = usableWidth / data.length;
  const barWidth = Math.max(6, barSlotWidth * 0.6);

  return (
    <div className="w-full">
      {(title || subtitle) && (
        <div className="mb-3 flex items-baseline justify-between">
          <div>
            {title && <h4 className="text-xs font-bold text-black tracking-tight">{title}</h4>}
            {subtitle && <p className="text-[11px] text-neutral-600 font-medium">{subtitle}</p>}
          </div>
          {hoverIndex !== null && (
            <div className="text-xs font-mono-code font-bold text-black bg-[#fafaf9] px-2.5 py-1 rounded-md border border-neutral-300 shadow-2xs flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span>{data[hoverIndex].label}:</span>
              <span className="text-black">{data[hoverIndex].value.toLocaleString()} {unit}</span>
            </div>
          )}
        </div>
      )}

      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-auto overflow-visible select-none"
        >
          {/* Subtle Gridlines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const y = paddingTop + usableHeight * (1 - pct);
            const val = max * pct;
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#e5e5e5"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3.5}
                  textAnchor="end"
                  className="text-[9.5px] fill-neutral-500 font-mono-code font-medium select-none"
                >
                  {Math.round(val).toLocaleString()}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {data.map((d, idx) => {
            const barH = (d.value / max) * usableHeight;
            const x = paddingLeft + idx * barSlotWidth + (barSlotWidth - barWidth) / 2;
            const y = paddingTop + usableHeight - barH;
            const isHovered = hoverIndex === idx;

            return (
              <g
                key={idx}
                className="cursor-pointer"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              >
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barH}
                  rx={3}
                  fill={color}
                  opacity={isHovered ? 1 : 0.82}
                  className="transition-all duration-150"
                />
                <text
                  x={x + barWidth / 2}
                  y={chartHeight - 8}
                  textAnchor="middle"
                  className="text-[9.5px] fill-neutral-600 font-mono-code font-medium select-none"
                >
                  {d.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
