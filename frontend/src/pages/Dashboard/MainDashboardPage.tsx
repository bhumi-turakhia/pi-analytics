import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Plus,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { DashboardHero } from '../../components/dashboard/DashboardHero';
import { DashboardQuickActions } from '../../components/dashboard/DashboardQuickActions';
import { AICopilotCard } from '../../components/dashboard/AICopilotCard';
import { PlatformFeatureGrid } from '../../components/dashboard/PlatformFeatureGrid';
import { SystemOverview } from '../../components/dashboard/SystemOverview';
import { RecentActivity } from '../../components/dashboard/RecentActivity';
import { DashboardExport } from '../../components/dashboard/DashboardExport';
import { DashboardExportModal } from '../../components/dashboard/DashboardExportModal';
import {
  dataSourceApi,
  catalogApi,
  activityApi,
  analyticsApi,
} from '../../services/api';
import {
  ExportFormat,
  DashboardExportData,
  exportDashboardToPDF,
  exportDashboardToPNG,
} from '../../services/exportService';
import { DataSource, ActivityLog, OverviewKPIs, NavigationPage } from '../../types';

export interface MainDashboardPageProps {
  source?: Partial<DataSource>;
  onNavigate: (page: NavigationPage, context?: any) => void;
}

export const MainDashboardPage: React.FC<MainDashboardPageProps> = ({
  source,
  onNavigate,
}) => {
  const { showToast } = useToast();
  const dashboardContainerRef = useRef<HTMLDivElement>(null);

  const [sources, setSources] = useState<DataSource[]>([]);
  const [tableCount, setTableCount] = useState<number>(0);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [overviewKpis, setOverviewKpis] = useState<OverviewKPIs | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const [sourcesData, datasetsData, activityData, kpiData] = await Promise.all([
        dataSourceApi.getAll().catch(() => []),
        catalogApi.getAll().catch(() => []),
        activityApi.getAll().catch(() => []),
        analyticsApi.getOverviewKPIs().catch(() => null),
      ]);

      setSources(sourcesData);
      setTableCount(datasetsData.length);
      setActivities(activityData);
      setOverviewKpis(kpiData);
    } catch (err) {
      console.error('Failed to load dashboard landing data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getExportData = (): DashboardExportData => {
    const latestSync = sources.find((s) => s.lastSyncAt && s.lastSyncAt !== 'Never')?.lastSyncAt;
    return {
      title: 'Pi Analytics Enterprise Dashboard & Ecosystem Overview',
      exportedAt: new Date().toLocaleString(),
      systemMetrics: {
        connectedSources: sources.length,
        catalogedTables: tableCount,
        syncFreshness: latestSync ? `Active (${latestSync})` : 'Idle',
        systemHealth: 'Operational',
      },
      sources: sources.map((s) => ({
        name: s.name,
        platform: s.platform,
        status: s.status,
      })),
      recentActivities: activities.slice(0, 4).map((a) => ({
        timestamp: a.timestamp,
        action: a.action,
        resource: a.resource,
        status: a.status,
      })),
    };
  };

  const handleQuickExport = async (format: ExportFormat) => {
    const element = dashboardContainerRef.current;
    const exportData = getExportData();

    try {
      if (format === 'pdf') {
        await exportDashboardToPDF(element, exportData, {
          format: 'pdf',
          resolution: '2x',
          filename: `pi-analytics-summary-${Date.now()}.pdf`,
        });
        showToast('success', 'PDF Exported', 'Executive summary PDF downloaded successfully.');
      } else if (format === 'png') {
        if (!element) return;
        await exportDashboardToPNG(element, {
          format: 'png',
          resolution: '2x',
          filename: `pi-analytics-dashboard-2x-${Date.now()}.png`,
        });
        showToast('success', 'PNG Exported', 'High-resolution dashboard screenshot downloaded.');
      }
    } catch (err: any) {
      showToast('error', 'Export Failed', err?.message || 'Could not export dashboard.');
    }
  };

  return (
    <div ref={dashboardContainerRef} className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Badge variant="black" dot={true}>
              Pi Analytics
            </Badge>
            <span className="text-[11px] text-neutral-500 font-mono-code">
              Enterprise Intelligence Workspace
            </span>
          </div>
          <h1 className="text-2xl font-bold text-black tracking-tight font-sans">
            Home &amp; Platform Overview
          </h1>
          <p className="text-xs text-neutral-600 font-medium mt-0.5">
            Unified landing center for data connections, governed catalog, analytics, and AI Copilot.
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDashboardData}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsExportModalOpen(true)}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export / Save
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('sources', { openWizard: true })}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + Add Data Source
          </Button>
        </div>
      </div>

      {/* 1. HERO / PRODUCT INTRODUCTION */}
      <DashboardHero
        onNavigate={onNavigate}
        connectedSourceCount={sources.length}
      />

      {/* 2. PRIMARY ACTIONS */}
      <DashboardQuickActions
        onNavigate={onNavigate}
        onOpenExportModal={() => setIsExportModalOpen(true)}
      />

      {/* 3. AI COPILOT FEATURE */}
      <AICopilotCard
        onNavigate={onNavigate}
        sources={sources}
        activeSourceName={
          sources.find((s) => s.id === '68')?.name ||
          sources.find((s) => s.platform === 'snowflake')?.name ||
          'PI Analytics Snowflake'
        }
      />

      {/* 4. CORE PLATFORM FEATURES */}
      <PlatformFeatureGrid
        onNavigate={onNavigate}
        sourceCount={sources.length}
        tableCount={tableCount}
      />

      {/* 5. DATA / SYSTEM STATUS */}
      <SystemOverview
        sourceCount={sources.length}
        tableCount={tableCount}
        lastSyncTime={sources.find((s) => s.lastSyncAt && s.lastSyncAt !== 'Never')?.lastSyncAt || 'Never'}
        cacheHitRatio={overviewKpis?.cacheHitRatio ?? 0}
        onNavigate={onNavigate}
      />

      {/* 6. RECENT ACTIVITY (Top 3) */}
      <RecentActivity
        activities={activities}
        onNavigate={onNavigate}
        isLoading={loading}
      />

      {/* 7. DASHBOARD EXPORT / SAVE */}
      <DashboardExport
        onOpenExportModal={() => setIsExportModalOpen(true)}
        onQuickExport={handleQuickExport}
      />

      {/* Export Configuration Modal */}
      <DashboardExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        dashboardElementRef={dashboardContainerRef}
        exportData={getExportData()}
      />
    </div>
  );
};
