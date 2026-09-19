import React, { useState, useEffect } from 'react';
import {
  Database,
  Layers,
  Table,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
  Server,
  Zap,
  HardDrive,
  Clock,
  ChevronRight,
  ShieldCheck,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { ConnectionStatusBadge, PlatformBadge } from '../../components/status/ConnectionStatusBadge';
import { MetricSparkline } from '../../components/charts/Charts';
import { EnhancedKPICard } from '../../components/dashboard/EnhancedKPICard';
import { dataSourceApi, activityApi, analyticsApi } from '../../services/api';
import { DataSource, ActivityLog, OverviewKPIs, NavigationPage } from '../../types';

export const OverviewPage: React.FC<{ onNavigate: (page: NavigationPage, context?: any) => void }> = ({
  onNavigate,
}) => {
  const [kpis, setKpis] = useState<OverviewKPIs | null>(null);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [kpiData, sourcesData, actData] = await Promise.all([
        analyticsApi.getOverviewKPIs(),
        dataSourceApi.getAll(),
        activityApi.getAll(),
      ]);
      setKpis(kpiData);
      setSources(sourcesData);
      setActivities(actData);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncSource = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncingId(id);
    try {
      await dataSourceApi.syncNow(id);
      await loadData();
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">Overview</h1>
          <p className="text-xs text-stone-500 mt-1">
            Monitor your data ecosystem, metadata freshness, and discover connected enterprise Snowflake &amp; Salesforce sources.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('dynamic-dashboard')}
            leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Open AI Dashboard
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('sources', { openWizard: true })}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Add Data Source
          </Button>
        </div>
      </div>

      {/* Hero Banner for Instant Source + Dynamic AI Dashboard */}
      <div className="p-4 rounded-xl bg-stone-900 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white shrink-0 mt-0.5">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                Interactive AI Intelligence Dashboard
              </h3>
              <span className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.5 rounded">
                Live Co-Pilot
              </span>
            </div>
            <p className="text-xs text-stone-300 mt-1 max-w-2xl leading-relaxed">
              Connect a source from Snowflake or Salesforce and instantly interact with a live analytical dashboard.
              Type prompts into the right-side AI chatbot to dynamically slice, re-aggregate, or recalculate charts in real time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="bg-white/10 text-white border-white/20 hover:bg-white/20 hover:text-white"
            onClick={() => onNavigate('sources', { openWizard: true })}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            Connect Source
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onNavigate('dynamic-dashboard')}
            rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
          >
            Launch Live Dashboard
          </Button>
        </div>
      </div>

      {/* Primary KPI Metrics - Individually Tailored */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Connected Sources */}
        <EnhancedKPICard
          label="Connected Sources"
          value={String(kpis?.connectedSources ?? 0)}
          subtext="Snowflake &amp; Salesforce endpoints"
          variant="emerald"
          type="count"
          badge="Live Sources"
          icon={<Database className="w-4 h-4" />}
          onDrilldown={() => onNavigate('sources')}
        />

        {/* KPI 2: Healthy Connections */}
        <EnhancedKPICard
          label="Healthy Connections"
          value={`${kpis?.healthyConnections ?? 0} / ${kpis?.connectedSources ?? 0}`}
          subtext="Verified database endpoints"
          variant="blue"
          type="sla"
          badge="Uptime Status"
          icon={<CheckCircle2 className="w-4 h-4" />}
          onDrilldown={() => onNavigate('sources')}
        />

        {/* KPI 3: Cataloged Tables */}
        <EnhancedKPICard
          label="Cataloged Tables"
          value={String(kpis?.catalogedTables ?? 0)}
          subtext="Columnar compressed metadata"
          variant="indigo"
          type="storage"
          badge={`${kpis?.storageUsageGb ?? 0} GB`}
          icon={<Table className="w-4 h-4" />}
          onDrilldown={() => onNavigate('catalog')}
        />

        {/* KPI 4: Available Schemas */}
        <EnhancedKPICard
          label="Available Schemas"
          value={String(kpis?.availableSchemas ?? 0)}
          subtext="Auto-introspected schemas"
          variant="amber"
          type="count"
          badge="Discovered Schemas"
          icon={<Layers className="w-4 h-4" />}
          onDrilldown={() => onNavigate('catalog')}
        />
      </div>

      {/* Main Grid: Data Source Health (Left) & Recent Activity (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Data Source Health List */}
        <div className="lg:col-span-2 space-y-4">
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-[#fbfbf9]/60 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-900 tracking-tight">Data Source Health</h2>
                <p className="text-xs text-stone-500">Active enterprise connection endpoints and sync statuses</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('sources')}
                rightIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                View All Sources
              </Button>
            </div>

            <div className="divide-y divide-stone-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50/60 text-stone-500 font-medium">
                    <th className="py-2.5 px-4">Source Name</th>
                    <th className="py-2.5 px-3">Platform</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Last Synced</th>
                    <th className="py-2.5 px-3 text-right">Tables</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {sources.slice(0, 4).map((source) => (
                    <tr
                      key={source.id}
                      onClick={() => onNavigate('dynamic-dashboard', { source })}
                      className="hover:bg-stone-50/80 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-stone-900">{source.name}</div>
                        <div className="text-[11px] text-stone-500 font-mono-code">
                          {source.database} • {source.warehouse}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <PlatformBadge platform={source.platform} />
                      </td>
                      <td className="py-3 px-3">
                        <ConnectionStatusBadge status={source.status} />
                      </td>
                      <td className="py-3 px-3 text-stone-600 font-mono-code text-[11px]">
                        {source.lastSyncAt}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-code font-medium text-stone-900">
                        {source.tableCount}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="outline"
                            isLoading={syncingId === source.id}
                            onClick={(e) => handleSyncSource(source.id, e)}
                          >
                            Sync
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onNavigate('dynamic-dashboard', { source })}
                            leftIcon={<Sparkles className="w-3 h-3" />}
                          >
                            Dashboard
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Recently Discovered Data Tables Section */}
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-[#fbfbf9]/60 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-900 tracking-tight">Recently Discovered Metadata</h2>
                <p className="text-xs text-stone-500">Newly introspected tables and schemas from Snowflake</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('catalog')}
              >
                Open Catalog
              </Button>
            </div>

            <div className="divide-y divide-stone-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50/60 text-stone-500 font-medium">
                    <th className="py-2.5 px-4">Database</th>
                    <th className="py-2.5 px-3">Schema</th>
                    <th className="py-2.5 px-3">Table</th>
                    <th className="py-2.5 px-3 text-right">Columns</th>
                    <th className="py-2.5 px-3 text-right">Size</th>
                    <th className="py-2.5 px-4">Freshness</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-mono-code text-[11px]">
                  <tr
                    onClick={() => onNavigate('catalog')}
                    className="hover:bg-stone-50/80 cursor-pointer text-stone-800 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-semibold text-stone-900">RETAIL_ANALYTICS</td>
                    <td className="py-2.5 px-3 text-stone-600">SALES</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-900">ORDER_FACT</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">14</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">138.0 GB</td>
                    <td className="py-2.5 px-4 text-stone-500 font-sans text-xs">3 mins ago</td>
                  </tr>
                  <tr
                    onClick={() => onNavigate('catalog')}
                    className="hover:bg-stone-50/80 cursor-pointer text-stone-800 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-semibold text-stone-900">RETAIL_ANALYTICS</td>
                    <td className="py-2.5 px-3 text-stone-600">CUSTOMERS</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-900">CUSTOMER_DIM</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">9</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">3.91 GB</td>
                    <td className="py-2.5 px-4 text-stone-500 font-sans text-xs">3 mins ago</td>
                  </tr>
                  <tr
                    onClick={() => onNavigate('catalog')}
                    className="hover:bg-stone-50/80 cursor-pointer text-stone-800 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-semibold text-stone-900">RETAIL_ANALYTICS</td>
                    <td className="py-2.5 px-3 text-stone-600">PRODUCTS</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-900">PRODUCT_DIM</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">6</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">267.0 MB</td>
                    <td className="py-2.5 px-4 text-stone-500 font-sans text-xs">3 mins ago</td>
                  </tr>
                  <tr
                    onClick={() => onNavigate('catalog')}
                    className="hover:bg-stone-50/80 cursor-pointer text-stone-800 transition-colors"
                  >
                    <td className="py-2.5 px-4 font-semibold text-stone-900">MARKETING_ATTRIBUTION</td>
                    <td className="py-2.5 px-3 text-stone-600">CAMPAIGNS</td>
                    <td className="py-2.5 px-3 font-semibold text-stone-900">CAMPAIGN_PERFORMANCE</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">8</td>
                    <td className="py-2.5 px-3 text-right text-stone-700">896.0 MB</td>
                    <td className="py-2.5 px-4 text-stone-500 font-sans text-xs">1 hour ago</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right 1 Col: Recent Audit Activity & Architectural Ecosystem Card */}
        <div className="space-y-4">
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-[#fbfbf9]/60 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-stone-900 tracking-tight">Recent Activity</h2>
                <p className="text-xs text-stone-500">Live platform operations</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onNavigate('activity')}
              >
                Full Audit
              </Button>
            </div>

            <div className="divide-y divide-stone-100 max-h-[380px] overflow-y-auto">
              {activities.length === 0 ? (
                <div className="p-6 text-center text-xs text-stone-400">
                  {loading ? 'Loading live activity...' : 'No recent activity recorded.'}
                </div>
              ) : (
                activities.map((act) => (
                  <div key={act.id} className="p-3.5 hover:bg-stone-50/60 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-stone-900 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {act.user.name.charAt(0)}
                        </div>
                        <span className="text-xs font-semibold text-stone-900 truncate">
                          {act.user.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-400 font-mono-code shrink-0">
                        {act.timestamp}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-stone-800 font-medium">
                      {act.action}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono-code truncate mt-0.5">
                      {act.resource}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Architecture Stack Card (Enterprise Credibility) */}
          <Card className="bg-[#fcfcfa] border-stone-300">
            <div className="flex items-center gap-2 text-stone-900 font-semibold text-xs mb-3 pb-2 border-b border-stone-200">
              <Server className="w-4 h-4 text-stone-700" />
              <span>Pi-Analytics Architecture Reference</span>
            </div>
            <div className="space-y-2.5 text-xs text-stone-600">
              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-stone-100 text-stone-800 shrink-0 mt-0.5">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-stone-900">Snowflake Native &amp; Salesforce:</span>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Direct warehouse &amp; CRM introspection for schemas, partitioned tables, and real-time AI dashboards.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-stone-100 text-stone-800 shrink-0 mt-0.5">
                  <HardDrive className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-stone-900">PostgreSQL (Metadata Repository):</span>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Persists system configuration, RBAC permissions, schema snapshot history, and audit trails.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="p-1 rounded bg-stone-100 text-stone-800 shrink-0 mt-0.5">
                  <Zap className="w-3.5 h-3.5" />
                </div>
                <div>
                  <span className="font-semibold text-stone-900">Redis (Distributed Caching Layer):</span>
                  <p className="text-[11px] text-stone-500 mt-0.5">
                    Sub-millisecond cache for column definitions, schema graphs, and session state.
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
