import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Download,
  Database,
  TrendingUp,
  ArrowDownRight,
  Plus,
  Layers,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Input';
import { PlatformBadge } from '../../components/status/ConnectionStatusBadge';
import { MinimalLineChart, MinimalBarChart, MetricSparkline } from '../../components/charts/Charts';
import { EnhancedKPICard } from '../../components/dashboard/EnhancedKPICard';
import { DashboardAICopilot } from '../../components/dashboard/DashboardAICopilot';
import { useToast } from '../../components/ui/Toast';
import { generateInitialDashboard, executeDashboardPrompt } from '../../services/dashboardService';
import { dataSourceApi } from '../../services/api';
import { DashboardState, ChatMessage, DataSource, NavigationPage } from '../../types';

export interface MainDashboardPageProps {
  source?: Partial<DataSource>;
  onNavigate: (page: NavigationPage, context?: any) => void;
}

export const MainDashboardPage: React.FC<MainDashboardPageProps> = ({
  source,
  onNavigate,
}) => {
  const { showToast } = useToast();
  const [allSources, setAllSources] = useState<DataSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>(source?.id || 'src_snowflake_prod');
  
  const [dashboardState, setDashboardState] = useState<DashboardState>(() =>
    generateInitialDashboard(source || {})
  );

  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const isSf = source?.platform === 'salesforce' || source?.name?.toLowerCase().includes('salesforce');
    return [
      {
        id: 'msg_welcome',
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `👋 Hello! I am your **Pi AI Copilot** connected to **${
          source?.name || (isSf ? 'Salesforce Enterprise CRM' : 'Snowflake Retail Analytics')
        }**.\n\nYou can use this right panel to command modifications, filter thresholds, compute moving averages, or re-aggregate charts simultaneously in real time.`,
        suggestedFollowUps: [
          'Group revenue by region and show top 5 performers',
          'Highlight enterprise deals >$100K and calculate gross margin',
          'Switch trend to 14-day moving average and add profit margin',
        ],
      },
    ];
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [timeframeFilter, setTimeframeFilter] = useState('30d');

  // Load all available sources for quick switcher
  useEffect(() => {
    dataSourceApi.getAll().then((data) => {
      setAllSources(data);
    });
  }, []);

  // When source prop changes or switcher changes
  useEffect(() => {
    if (source && source.name && source.name !== dashboardState.sourceName) {
      const initial = generateInitialDashboard(source);
      setDashboardState(initial);
      if (source.id) setSelectedSourceId(source.id);
      setMessages([
        {
          id: `msg_welcome_${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: `⚡ Initialized live dashboard for **${initial.sourceName}** (${initial.platform.toUpperCase()}). All schema dimensions and transaction tables are indexed in Redis.`,
          suggestedFollowUps: [
            'Group revenue by region and show top 5 performers',
            'Highlight enterprise deals >$100K and calculate gross margin',
          ],
        },
      ]);
    }
  }, [source]);

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSourceId(sourceId);
    const targetSource = allSources.find((s) => s.id === sourceId);
    if (targetSource) {
      const initial = generateInitialDashboard(targetSource);
      setDashboardState(initial);
      setMessages([
        {
          id: `msg_switch_${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          content: `Switched active dashboard to **${targetSource.name}** (${targetSource.platform.toUpperCase()}).`,
          suggestedFollowUps: [
            'Group revenue by region and show top 5 performers',
            'Highlight enterprise deals >$100K and calculate gross margin',
          ],
        },
      ]);
      showToast('info', 'Data Source Switched', `Dashboard re-rendered for ${targetSource.name}`);
    }
  };

  const handleExecutePrompt = async (promptText: string) => {
    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: promptText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // Simulate warehouse partition scan
      await new Promise((resolve) => setTimeout(resolve, 550));

      const { updatedDashboard, responseMessage } = executeDashboardPrompt(dashboardState, promptText);
      setDashboardState(updatedDashboard);
      setMessages((prev) => [...prev, responseMessage]);

      showToast('success', 'Dashboard Reconfigured', `Applied updates for: "${promptText}"`);
    } catch (e: any) {
      showToast('error', 'Execution Error', 'Unable to process query prompt against warehouse.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResetChat = () => {
    const initial = generateInitialDashboard(source || {});
    setDashboardState(initial);
    setMessages([
      {
        id: `msg_reset_${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: 'Dashboard restored to initial connected baseline.',
        suggestedFollowUps: [
          'Group revenue by region and show top 5 performers',
          'Highlight enterprise deals >$100K and calculate gross margin',
        ],
      },
    ]);
    showToast('info', 'Reset View', 'Dashboard metrics restored to default.');
  };

  const handleExportReport = () => {
    showToast('success', 'Report Exported', 'Executive PDF summary generated with current filter state.');
  };

  return (
    <div className="space-y-6">
      {/* Top Header with Source Switcher & Global Controls */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-3 border-b border-neutral-200">
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <PlatformBadge platform={dashboardState.platform} />
            <Badge variant="black" dot={true}>
              Live Synchronized
            </Badge>
            <span className="text-[11px] text-neutral-600 font-mono-code">
              Sub-15ms Redis Cache
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-black tracking-tight font-sans">
            {dashboardState.title}
          </h1>
          <p className="text-xs text-neutral-600 font-medium mt-0.5">
            {dashboardState.subtitle}
          </p>
        </div>

        {/* Global Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Source Switcher Dropdown */}
          <div className="min-w-[200px]">
            <select
              value={selectedSourceId}
              onChange={(e) => handleSourceSelect(e.target.value)}
              className="w-full text-xs font-semibold text-black bg-white border border-neutral-300 rounded-md py-2 px-3 focus:border-black focus:ring-1 focus:ring-black cursor-pointer shadow-xs"
            >
              {allSources.length > 0 ? (
                allSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.platform.toUpperCase()})
                  </option>
                ))
              ) : (
                <option value="src_snowflake_prod">Snowflake Retail Analytics</option>
              )}
            </select>
          </div>

          <Select
            value={timeframeFilter}
            onChange={(e) => {
              setTimeframeFilter(e.target.value);
              handleExecutePrompt(`Filter dashboard for ${e.target.value === '7d' ? 'Last 7 Days' : e.target.value === '90d' ? 'Q3 2026 Quarter' : 'Last 30 Days'}`);
            }}
            className="w-36 text-xs font-semibold"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Q3 2026</option>
            <option value="ytd">Year to Date</option>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportReport}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export PDF
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => onNavigate('sources', { openWizard: true })}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + Connect Source
          </Button>
        </div>
      </div>

      {/* Main 2-Column Split Workbench: Left Dashboard Canvas + Right Pi AI Copilot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Live Visualizations & Analytics (8 Columns) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Executive KPI Cards - Individually Tailored */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {dashboardState.kpis.map((kpi, idx) => {
              // Tailor individual themes, types, and indicators per KPI index
              const kpiConfigs = [
                {
                  variant: 'emerald' as const,
                  type: 'currency' as const,
                  badge: 'Q3 Real-Time',
                  target: { current: 4.2, goal: 5.0, label: 'ARR Target ($5.0M)' },
                  breakdown: [{ label: 'Enterprise', value: '$3.1M' }, { label: 'Mid-Market', value: '$1.1M' }],
                  highLow: { high: '$4.4M', low: '$3.1M' },
                },
                {
                  variant: 'blue' as const,
                  type: 'count' as const,
                  badge: 'Won Pipeline',
                  breakdown: [{ label: 'Enterprise', value: '12' }, { label: 'Standard', value: '16' }],
                  highLow: { high: '34', low: '20' },
                },
                {
                  variant: 'indigo' as const,
                  type: 'percent' as const,
                  badge: 'Cohort +4.2%',
                  target: { current: 68, goal: 75, label: 'Target Win Rate' },
                  highLow: { high: '72%', low: '58%' },
                },
                {
                  variant: 'amber' as const,
                  type: 'currency' as const,
                  badge: 'ACV Milestone',
                  breakdown: [{ label: 'Top Tier', value: '$180K' }],
                  highLow: { high: '$165K', low: '$110K' },
                },
              ];
              const config = kpiConfigs[idx % kpiConfigs.length];

              return (
                <EnhancedKPICard
                  key={kpi.id}
                  label={kpi.label}
                  value={kpi.value}
                  change={kpi.change}
                  isPositive={kpi.isPositive}
                  subtext={kpi.subtext}
                  sparkline={kpi.sparkline}
                  variant={config.variant}
                  type={config.type}
                  badge={config.badge}
                  target={config.target}
                  breakdown={config.breakdown}
                  highLow={config.highLow}
                  onDrilldown={() => onNavigate('explorer')}
                />
              );
            })}
          </div>

          {/* AI Active Insights Alert Banner */}
          {dashboardState.insights && dashboardState.insights.length > 0 && (
            <div className="p-4 bg-white rounded-lg border border-neutral-300 shadow-xs space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-black">
                <Sparkles className="w-4 h-4 text-black" />
                <span>Executive Insights &amp; Real-time Anomaly Signals</span>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] text-black pt-1">
                {dashboardState.insights.map((ins, idx) => (
                  <li key={idx} className="p-2.5 bg-[#fafaf9] rounded border border-neutral-200 flex items-start gap-2 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-black mt-1.5 shrink-0" />
                    <span>{ins}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dual Visualizations (Line Trend & Bar Category Breakdown) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Line Chart */}
            <Card className="p-5 bg-white border border-neutral-300 shadow-xs">
              <MinimalLineChart
                data={dashboardState.primaryChart.data.map((d) => ({
                  label: d.label,
                  value: d.value,
                }))}
                title={dashboardState.primaryChart.title}
                subtitle={dashboardState.primaryChart.subtitle}
                unit={dashboardState.primaryChart.unit}
                height={220}
              />
            </Card>

            {/* Secondary Bar Chart */}
            <Card className="p-5 bg-white border border-neutral-300 shadow-xs">
              <MinimalBarChart
                data={dashboardState.secondaryChart.data.map((d) => ({
                  label: d.label,
                  value: d.value,
                }))}
                title={dashboardState.secondaryChart.title}
                subtitle={dashboardState.secondaryChart.subtitle}
                unit={dashboardState.secondaryChart.unit}
                height={220}
              />
            </Card>
          </div>

          {/* Underlying Transaction / Opportunity Data Table */}
          <Card padding="none" className="overflow-hidden border border-neutral-300 shadow-xs bg-white">
            <div className="px-5 py-3.5 border-b border-neutral-200 bg-[#fafaf9] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-black">
                  {dashboardState.dataTable.title}
                </h3>
                <p className="text-xs text-neutral-600 font-medium">
                  {dashboardState.dataTable.subtitle}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('explorer')}
                leftIcon={<Database className="w-3.5 h-3.5" />}
              >
                Inspect in SQL Worksheet
              </Button>
            </div>

            <div className="divide-y divide-neutral-200 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#f5f5f4] text-black font-bold select-none border-b border-neutral-200">
                    {dashboardState.dataTable.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-3 px-4 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 text-black">
                  {dashboardState.dataTable.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-neutral-100/70 transition-colors">
                      {dashboardState.dataTable.columns.map((col) => (
                        <td
                          key={col.key}
                          className={`py-3 px-4 ${
                            col.isMonospace ? 'font-mono-code text-[11px] font-semibold' : 'font-medium'
                          } ${col.align === 'right' ? 'text-right font-bold' : col.align === 'center' ? 'text-center' : ''}`}
                        >
                          {row[col.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right Side: Pi AI Copilot Right-Hand Panel (4 Columns) */}
        <div className="lg:col-span-4 sticky top-20 h-[calc(100vh-6rem)] rounded-xl border border-neutral-300 overflow-hidden shadow-xs bg-white">
          <DashboardAICopilot
            dashboardState={dashboardState}
            onExecutePrompt={handleExecutePrompt}
            isProcessing={isProcessing}
            messages={messages}
            onResetChat={handleResetChat}
          />
        </div>
      </div>
    </div>
  );
};
