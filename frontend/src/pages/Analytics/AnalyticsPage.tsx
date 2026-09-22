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
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Input';
import { MinimalLineChart, MinimalBarChart, MetricSparkline } from '../../components/charts/Charts';
import { EnhancedKPICard } from '../../components/dashboard/EnhancedKPICard';
import { analyticsApi, StorageGrowthPoint, QueryActivityPoint, SchemaDistributionPoint } from '../../services/api';
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

  useEffect(() => {
    loadAnalytics();
  }, [dateRange, selectedSource]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [stor, qry, sch] = await Promise.all([
        analyticsApi.getStorageGrowth(),
        analyticsApi.getQueryActivity(),
        analyticsApi.getSchemaDistribution(),
      ]);
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

      {/* High-Level Telemetry Cards - Individually Tailored */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Managed Storage */}
        <EnhancedKPICard
          label="Total Managed Storage"
          value="3,840 GB"
          change="+12.4%"
          isPositive={true}
          subtext="Snowflake columnar compressed"
          sparkline={[3410, 3490, 3550, 3620, 3700, 3780, 3840]}
          variant="indigo"
          type="storage"
          badge="30D Growth"
          breakdown={[
            { label: 'Analytics WH', value: '2.8 TB' },
            { label: 'Raw Staging', value: '1.0 TB' },
          ]}
          highLow={{ high: '3.84 TB', low: '3.20 TB' }}
          icon={<HardDrive className="w-4 h-4" />}
          onDrilldown={() => onNavigate('catalog')}
        />

        {/* KPI 2: Daily Discovery Queries */}
        <EnhancedKPICard
          label="Daily Discovery Queries"
          value="26,970"
          change="+8.1%"
          isPositive={true}
          subtext="Executed across 5 warehouses"
          sparkline={[21200, 22400, 23900, 24800, 25600, 26100, 26970]}
          variant="emerald"
          type="count"
          badge="5 Active WH"
          target={{ current: 26970, goal: 30000, label: 'Capacity Quota' }}
          highLow={{ high: '28.4K', low: '19.2K' }}
          icon={<Zap className="w-4 h-4" />}
          onDrilldown={() => onNavigate('explorer')}
        />

        {/* KPI 3: Cache Hit Rate */}
        <EnhancedKPICard
          label="Redis Cache Hit Rate"
          value="94.2%"
          change="+1.8%"
          isPositive={true}
          subtext="Sub-15ms metadata responses"
          sparkline={[91.2, 91.8, 92.4, 93.0, 93.5, 93.9, 94.2]}
          variant="blue"
          type="percent"
          badge="<15ms SLA"
          target={{ current: 94.2, goal: 95.0, label: 'Target 95.0%' }}
          highLow={{ high: '96.1%', low: '89.4%' }}
          icon={<Activity className="w-4 h-4" />}
          onDrilldown={() => onNavigate('sources')}
        />

        {/* KPI 4: Average Query Latency */}
        <EnhancedKPICard
          label="Average Query Latency"
          value="198 ms"
          change="-34 ms"
          isPositive={true}
          subtext="Snowflake warehouse response"
          sparkline={[245, 238, 225, 219, 210, 204, 198]}
          variant="amber"
          type="speed"
          badge="High Efficiency"
          breakdown={[
            { label: 'P50 Median', value: '142ms' },
            { label: 'P99 Tail', value: '410ms' },
          ]}
          highLow={{ high: '260ms', low: '198ms' }}
          icon={<Server className="w-4 h-4" />}
          onDrilldown={() => onNavigate('explorer')}
        />
      </div>

      {/* Dual Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Storage Growth Over Time */}
        <Card className="p-5">
          <MinimalLineChart
            data={storageData.map((d) => ({
              label: d.date,
              value: d.snowflakeGb,
            }))}
            title="Snowflake Micro-Partition Storage Volume"
            subtitle="Compressed table gigabytes stored across production schemas"
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
            subtitle="Queries processed per 4-hour window across endpoints"
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
