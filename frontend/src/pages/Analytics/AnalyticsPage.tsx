import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Database,
  TrendingUp,
  HardDrive,
  Zap,
  Activity,
  ArrowUpRight,
  RefreshCw,
  Server,
  Layers,
  CheckCircle2,} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Input';
import { MinimalLineChart, MinimalBarChart, MetricSparkline } from '../../components/charts/Charts';
import { EnhancedKPICard } from '../../components/dashboard/EnhancedKPICard';
import { analyticsApi, StorageGrowthPoint, QueryActivityPoint, SchemaDistributionPoint, OverviewKPIs } from '../../services/api';
import { NavigationPage } from '../../types';

export const AnalyticsPage: React.FC<{ onNavigate?: (page: NavigationPage) => void }> = ({
  onNavigate = (_page: NavigationPage) => {},
}) => {
  const [dateRange, setDateRange] = useState('7d');
  const [selectedSource, setSelectedSource] = useState('all');
  const [storageData, setStorageData] = useState<StorageGrowthPoint[]>([]);
  const [queryData, setQueryData] = useState<QueryActivityPoint[]>([]);
  const [schemaDist, setSchemaDist] = useState<SchemaDistributionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewKPIs | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange, selectedSource]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [summary, stor, qry, sch] = await Promise.all([
        analyticsApi.getOverviewKPIs(),
        analyticsApi.getStorageGrowth(),
        analyticsApi.getQueryActivity(),
        analyticsApi.getSchemaDistribution(),
      ]);
      setOverview(summary);
      setStorageData(stor);
      setQueryData(qry);
      setSchemaDist(sch);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">Analytics &amp; Ecosystem Telemetry</h1>
          <p className="text-xs text-stone-500 mt-1">
            Analyze storage growth, query activity volumes, cache efficiency, and schema distribution across Snowflake.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="w-36"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last Quarter</option>
            <option value="ytd">Year to Date</option>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={loadAnalytics}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Real Platform Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <EnhancedKPICard
          label="Connected Data Sources"
          value={String(overview?.connectedSources ?? 0)}
          subtext="Configured platform connections"
          variant="indigo"
          type="count"
          icon={<Database className="w-4 h-4" />}
          onDrilldown={() => onNavigate('sources')}
        />

        <EnhancedKPICard
          label="Healthy Connections"
          value={String(overview?.healthyConnections ?? 0)}
          subtext="Sources reporting healthy status"
          variant="emerald"
          type="count"
          icon={<CheckCircle2 className="w-4 h-4" />}
          onDrilldown={() => onNavigate('sources')}
        />

        <EnhancedKPICard
          label="Cataloged Tables"
          value={String(overview?.catalogedTables ?? 0)}
          subtext="Tables discovered from connected sources"
          variant="blue"
          type="count"
          icon={<Layers className="w-4 h-4" />}
          onDrilldown={() => onNavigate('catalog')}
        />

        <EnhancedKPICard
          label="Available Schemas"
          value={String(overview?.availableSchemas ?? 0)}
          subtext="Schemas discovered from connected sources"
          variant="amber"
          type="count"
          icon={<Server className="w-4 h-4" />}
          onDrilldown={() => onNavigate('catalog')}
        />
      </div>      {/* Dual Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Storage Growth Over Time */}
        <Card className="p-5">
          <MinimalLineChart
            data={storageData.map((d) => ({
              label: d.date,
              value: d.snowflakeGb,
            }))}
            title="Snowflake Micro-Partition Storage Volume"
            subtitle={storageData.length > 0 ? "Recorded storage growth" : "No storage telemetry has been recorded yet"}
            unit="GB"
            height={220}
          />
        </Card>

        {/* Chart 2: Query Volume by Hour */}
        <Card className="p-5">
          <MinimalBarChart
            data={queryData.map((q) => ({
              label: q.hour,
              value: q.queriesCount,
            }))}
            title="Discovery Query Ingestion Throughput"
            subtitle={queryData.length > 0 ? "Recorded query activity" : "No query activity telemetry has been recorded yet"}
            unit="queries"
            height={220}
          />
        </Card>
      </div>

      {/* Bottom Section: Schema Distribution Breakdown Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-5 py-3.5 border-b border-stone-200 bg-[#fbfbf9]/60 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-stone-900">Schema Volume &amp; Table Density</h3>
            <p className="text-xs text-stone-500">Distribution of cataloged entities across business domains</p>
          </div>
          <Badge variant="navy">Snowflake Certified</Badge>
        </div>

        <div className="divide-y divide-stone-100 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/70 text-stone-500 font-semibold">
                <th className="py-2.5 px-4">Schema Domain</th>
                <th className="py-2.5 px-3 text-right">Tables</th>
                <th className="py-2.5 px-3 text-right">Storage Size</th>
                <th className="py-2.5 px-4">Share of Total Ecosystem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-mono-code text-[11px]">
              {schemaDist.map((item, idx) => (
                <tr key={idx} className="hover:bg-stone-50/70 transition-colors">
                  <td className="py-3 px-4 font-semibold text-stone-900 font-sans text-xs">
                    {item.schemaName}
                  </td>
                  <td className="py-3 px-3 text-right text-stone-700">
                    {item.tableCount}
                  </td>
                  <td className="py-3 px-3 text-right text-stone-700">
                    {item.sizeGb} GB
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden max-w-xs border border-stone-200/50">
                        <div
                          className="bg-stone-900 h-full rounded-full"
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="text-stone-700 font-medium text-xs">{item.percentage}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};


