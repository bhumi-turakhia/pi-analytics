import React from 'react';
import {
  Database,
  Layers,
  Activity,
  CheckCircle2,
  Server,
  Zap,
  ArrowUpRight,
} from 'lucide-react';
import { Card } from '../ui/Card';
import { NavigationPage } from '../../types';

export interface SystemOverviewProps {
  sourceCount: number;
  tableCount: number;
  lastSyncTime?: string;
  cacheHitRatio?: number;
  onNavigate: (page: NavigationPage, context?: any) => void;
}

export const SystemOverview: React.FC<SystemOverviewProps> = ({
  sourceCount,
  tableCount,
  lastSyncTime = 'Never',
  cacheHitRatio = 0,
  onNavigate,
}) => {
  const stats = [
    {
      label: 'Connected Data Sources',
      value: `${sourceCount}`,
      subtext: 'Snowflake Enterprise',
      status: sourceCount > 0 ? 'Healthy' : 'Pending',
      icon: <Database className="w-4 h-4 text-black" />,
      target: 'sources' as NavigationPage,
    },
    {
      label: 'Cataloged Tables & Entities',
      value: `${tableCount}`,
      subtext: 'Indexed in PostgreSQL',
      status: tableCount > 0 ? 'Governed' : 'Empty',
      icon: <Layers className="w-4 h-4 text-black" />,
      target: 'catalog' as NavigationPage,
    },
    {
      label: 'Sync Freshness Status',
      value: lastSyncTime || 'Never',
      subtext: 'Automated catalog sync',
      status: lastSyncTime && lastSyncTime !== 'Never' ? 'Synchronized' : 'Idle',
      icon: <Zap className="w-4 h-4 text-black" />,
      target: 'activity' as NavigationPage,
    },
    {
      label: 'System & Cache Health',
      value: `${cacheHitRatio}%`,
      subtext: 'Redis query & metadata cache',
      status: 'Operational',
      icon: <Server className="w-4 h-4 text-black" />,
      target: 'analytics' as NavigationPage,
    },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-black tracking-tight">
            Data &amp; System Status
          </h2>
          <p className="text-xs text-neutral-600 font-medium">
            Live health indicators across connected warehouses and catalog metadata.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => (
          <div
            key={idx}
            onClick={() => onNavigate(stat.target)}
            className="group p-4 rounded-xl bg-white border border-neutral-300 hover:border-black transition-all cursor-pointer shadow-xs flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-lg bg-[#fafaf9] border border-neutral-200 flex items-center justify-center text-black">
                {stat.icon}
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300">
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" />
                {stat.status}
              </span>
            </div>

            <div>
              <div className="text-xl font-extrabold text-black tracking-tight font-sans">
                {stat.value}
              </div>
              <div className="text-xs font-bold text-black mt-0.5 group-hover:text-black">
                {stat.label}
              </div>
              <div className="text-[11px] text-neutral-500 font-medium mt-0.5">
                {stat.subtext}
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] font-bold text-neutral-500 group-hover:text-black">
              <span>View details</span>
              <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
