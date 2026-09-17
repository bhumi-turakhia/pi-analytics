import React from 'react';
import {
  Database,
  Layers,
  Terminal,
  BarChart3,
  Activity,
  Sparkles,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { NavigationPage } from '../../types';

export interface PlatformFeatureGridProps {
  onNavigate: (page: NavigationPage, context?: any) => void;
  sourceCount: number;
  tableCount: number;
}

export const PlatformFeatureGrid: React.FC<PlatformFeatureGridProps> = ({
  onNavigate,
  sourceCount,
  tableCount,
}) => {
  const features = [
    {
      id: 'sources' as NavigationPage,
      title: 'Data Sources',
      badge: `${sourceCount} Active`,
      icon: <Database className="w-5 h-5" />,
      description:
        'Connect enterprise databases and SaaS tools including Snowflake, Salesforce, and PostgreSQL with automated background synchronization.',
      actionText: 'Manage Connections',
    },
    {
      id: 'catalog' as NavigationPage,
      title: 'Data Catalog',
      badge: `${tableCount} Datasets`,
      icon: <Layers className="w-5 h-5" />,
      description:
        'Explore hierarchical database and schema mapping, column nullness profiles, primary/foreign keys, and generated DDL definitions.',
      actionText: 'Browse Catalog',
    },
    {
      id: 'explorer' as NavigationPage,
      title: 'SQL Explorer',
      badge: 'Redis Accelerated',
      icon: <Terminal className="w-5 h-5" />,
      description:
        'Run ad-hoc SQL queries with sub-millisecond metadata cache responses, formatted table views, and column-level inspection.',
      actionText: 'Open SQL Worksheet',
    },
    {
      id: 'analytics' as NavigationPage,
      title: 'Metric Studio',
      badge: 'Ecosystem Telemetry',
      icon: <BarChart3 className="w-5 h-5" />,
      description:
        'Analyze storage growth trends, query activity throughput, warehouse latency percentiles, and schema volume distribution.',
      actionText: 'View Telemetry',
    },
    {
      id: 'activity' as NavigationPage,
      title: 'Activity Audit Log',
      badge: 'Audit Trail',
      icon: <Activity className="w-5 h-5" />,
      description:
        'Track all pipeline synchronizations, schema updates, query executions, and user operations with detailed IP and status logging.',
      actionText: 'Inspect Audit Logs',
    },
    {
      id: 'ai-copilot',
      title: 'AI Copilot & Insights',
      badge: 'Live Intelligence',
      icon: <Sparkles className="w-5 h-5" />,
      description:
        'Conversational AI paired with your data catalog for natural-language queries, moving averages, and automated executive takeaways.',
      actionText: 'Ask Copilot',
    },
  ];

  const handleCardClick = (id: string) => {
    if (id === 'ai-copilot') {
      const el = document.getElementById('ai-copilot-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    onNavigate(id as NavigationPage);
  };

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-black tracking-tight">
            Platform Capabilities
          </h2>
          <p className="text-xs text-neutral-600 font-medium">
            Explore the core architectural modules powering enterprise data intelligence.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feat) => (
          <div
            key={feat.id}
            onClick={() => handleCardClick(feat.id)}
            className="group p-5 rounded-xl bg-white border border-neutral-300 hover:border-black transition-all cursor-pointer shadow-xs hover:shadow-sm flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-9 h-9 rounded-lg bg-neutral-100 group-hover:bg-black text-black group-hover:text-white flex items-center justify-center transition-colors shadow-2xs">
                  {feat.icon}
                </div>
                <span className="text-[11px] font-bold text-black font-mono-code bg-neutral-100 px-2 py-0.5 rounded border border-neutral-200">
                  {feat.badge}
                </span>
              </div>

              <div>
                <h3 className="text-sm font-bold text-black group-hover:text-black transition-colors">
                  {feat.title}
                </h3>
                <p className="text-xs text-neutral-600 font-normal mt-1 leading-relaxed line-clamp-3">
                  {feat.description}
                </p>
              </div>
            </div>

            <div className="pt-4 mt-2 border-t border-neutral-100 flex items-center justify-between text-xs font-bold text-black group-hover:underline">
              <span>{feat.actionText}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
