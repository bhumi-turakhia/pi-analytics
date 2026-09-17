import React from 'react';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Clock,
  ExternalLink,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { ActivityLog, NavigationPage } from '../../types';

export interface RecentActivityProps {
  activities: ActivityLog[];
  onNavigate: (page: NavigationPage, context?: any) => void;
  isLoading?: boolean;
}

export const RecentActivity: React.FC<RecentActivityProps> = ({
  activities,
  onNavigate,
  isLoading = false,
}) => {
  const displayActivities = activities.slice(0, 3);

  const getStatusIcon = (status: ActivityLog['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />;
      case 'failure':
        return <XCircle className="w-3.5 h-3.5 text-red-700" />;
      default:
        return <Info className="w-3.5 h-3.5 text-blue-700" />;
    }
  };

  const getStatusBadgeClass = (status: ActivityLog['status']) => {
    switch (status) {
      case 'success':
        return 'bg-emerald-50 text-emerald-950 border-emerald-300';
      case 'warning':
        return 'bg-amber-50 text-amber-950 border-amber-300';
      case 'failure':
        return 'bg-red-50 text-red-950 border-red-300';
      default:
        return 'bg-blue-50 text-blue-950 border-blue-300';
    }
  };

  return (
    <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-xs space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-black" />
          <h2 className="text-sm font-bold text-black tracking-tight">
            Recent Activity &amp; Pipeline Events
          </h2>
          <span className="text-[11px] text-neutral-500 font-medium">
            (Latest {displayActivities.length})
          </span>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('activity')}
          rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
          className="text-xs font-semibold"
        >
          View Activity Audit
        </Button>
      </div>

      {isLoading ? (
        <div className="py-6 text-center text-xs text-neutral-500">
          Loading latest activity stream...
        </div>
      ) : displayActivities.length === 0 ? (
        <div className="py-6 text-center text-xs text-neutral-500">
          No recent activity logs recorded yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {displayActivities.map((act) => (
            <div
              key={act.id}
              className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs first:pt-0 last:pb-0"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0">{getStatusIcon(act.status)}</div>
                <div className="min-w-0">
                  <p className="font-semibold text-black truncate">
                    {act.action}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-medium flex items-center gap-1.5 mt-0.5">
                    <span>{act.resource}</span>
                    <span>•</span>
                    <span className="font-mono-code">{act.user.name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 sm:self-center ml-6 sm:ml-0">
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase font-mono-code ${getStatusBadgeClass(
                    act.status
                  )}`}
                >
                  {act.status}
                </span>
                <span className="text-[11px] text-neutral-500 font-mono-code flex items-center gap-1">
                  <Clock className="w-3 h-3 text-neutral-400" />
                  {act.timestamp}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
