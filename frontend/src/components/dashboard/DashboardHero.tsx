import React from 'react';
import {
  Database,
  Layers,
  BarChart3,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { Badge } from '../ui/Badge';
import { PiByThreeIcon } from '../brand/Logo';
import { NavigationPage } from '../../types';

export interface DashboardHeroProps {
  onNavigate: (page: NavigationPage, context?: any) => void;
  connectedSourceCount: number;
}

export const DashboardHero: React.FC<DashboardHeroProps> = ({
  onNavigate,
  connectedSourceCount,
}) => {
  const handleStepClick = (target: string) => {
    if (target === 'ai-copilot') {
      const el = document.getElementById('ai-copilot-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    onNavigate(target as NavigationPage);
  };

  const workflowSteps = [
    {
      step: '01',
      title: 'Data Sources',
      desc: 'Connect & Sync',
      icon: <Database className="w-3.5 h-3.5" />,
      target: 'sources',
    },
    {
      step: '02',
      title: 'Data Catalog',
      desc: 'Govern & Map',
      icon: <Layers className="w-3.5 h-3.5" />,
      target: 'catalog',
    },
    {
      step: '03',
      title: 'Analytics & Studio',
      desc: 'Measure & Track',
      icon: <BarChart3 className="w-3.5 h-3.5" />,
      target: 'analytics',
    },
    {
      step: '04',
      title: 'AI Copilot',
      desc: 'Query & Generate',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      target: 'ai-copilot',
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-neutral-300 bg-white p-6 lg:p-7 shadow-xs">
      {/* Background Subtle Accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-neutral-100/50 rounded-full blur-3xl -z-10 pointer-events-none" />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Product Value Proposition */}
        <div className="max-w-2xl space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black text-white text-[11px] font-bold tracking-tight">
              <PiByThreeIcon size={14} />
              <span>Pi Analytics</span>
            </span>
            <Badge variant="black" dot={true}>
              Enterprise Ready
            </Badge>
            <span className="text-[11px] text-neutral-500 font-mono-code">
              Unified Data &amp; AI Intelligence
            </span>
          </div>

          <h1 className="text-2xl lg:text-3xl font-extrabold text-black tracking-tight font-sans leading-tight">
            Connect Enterprise Data. <br className="hidden sm:inline" />
            Discover Insights with AI Copilot.
          </h1>

          <p className="text-xs sm:text-sm text-neutral-600 font-normal leading-relaxed">
            Pi Analytics connects your fragmented enterprise data warehouses—Snowflake,
            Salesforce, Databricks, and PostgreSQL—into a centralized data catalog with governed
            metrics, live telemetry, and conversational AI analytics.
          </p>
        </div>

        {/* Right: Quick Stats & Security Badge */}
        <div className="flex sm:flex-col items-start sm:items-end justify-between sm:justify-center gap-2.5 pt-4 sm:pt-0 border-t sm:border-t-0 border-neutral-200">
          <div className="flex items-center gap-2 text-xs font-bold text-black bg-[#fafaf9] px-3.5 py-2 rounded-lg border border-neutral-200 shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Role-Governed Metadata Engine</span>
          </div>
          <div className="text-[11px] text-neutral-500 font-mono-code text-right">
            <span className="font-bold text-black">{connectedSourceCount} Connected</span> • Sub-15ms Redis SLA
          </div>
        </div>
      </div>

      {/* Enterprise End-to-End Workflow Ribbon */}
      <div className="mt-6 pt-5 border-t border-neutral-200">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <Zap className="w-3 h-3 text-neutral-600" />
            Core Analytics Workflow
          </span>
          <span className="text-[11px] text-neutral-500">
            Click any phase to navigate
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {workflowSteps.map((ws, idx) => (
            <button
              key={ws.step}
              onClick={() => handleStepClick(ws.target)}
              className="group text-left p-3 rounded-lg bg-[#fafaf9] hover:bg-neutral-100/90 border border-neutral-200 hover:border-neutral-400 transition-all cursor-pointer shadow-2xs flex flex-col justify-between"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold font-mono-code text-neutral-400 group-hover:text-black">
                  {ws.step}
                </span>
                <span className="text-neutral-700 group-hover:text-black group-hover:translate-x-0.5 transition-transform">
                  {ws.icon}
                </span>
              </div>
              <div>
                <div className="text-xs font-bold text-black flex items-center gap-1">
                  <span>{ws.title}</span>
                  <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <div className="text-[10px] text-neutral-500 font-medium">
                  {ws.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
