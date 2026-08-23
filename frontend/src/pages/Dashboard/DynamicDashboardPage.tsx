import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  RefreshCw,
  Download,
  Filter,
  CheckCircle2,
  TrendingUp,
  ArrowDownRight,
  Database,
  ChevronRight,
  Zap,
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
import { DashboardState, ChatMessage, DataSource, NavigationPage } from '../../types';

export interface DynamicDashboardPageProps {
  source?: Partial<DataSource>;
  onNavigate: (page: NavigationPage, context?: any) => void;
}

export const DynamicDashboardPage: React.FC<DynamicDashboardPageProps> = ({
  source,
  onNavigate,
}) => {
  const { showToast } = useToast();
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
        content: `👋 I have generated a live intelligence dashboard from your connected source **${
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

  // If new source passed via props/redirect, reinitialize dashboard
  useEffect(() => {
    if (source && source.name !== dashboardState.sourceName) {
      const initial = generateInitialDashboard(source);
      setDashboardState(initial);
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

  const handleExecutePrompt = async (promptText: string) => {
    // 1. Add user message
    const userMsg: ChatMessage = {
      id: `msg_user_${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: promptText,
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    try {
      // Simulate micro-partition scan latency
      await new Promise((resolve) => setTimeout(resolve, 550));

      const { updatedDashboard, responseMessage } = executeDashboardPrompt(dashboardState, promptText);
      setDashboardState(updatedDashboard);
      setMessages((prev) => [...prev, responseMessage]);

      showToast('success', 'Dashboard Updated', `Applied updates for: "${promptText}"`);
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
    showToast('info', 'Reset', 'Dashboard restored to default view.');
  };

  const handleExportReport = () => {
    showToast('success', 'Report Exported', 'Executive PDF summary generated with current filter state.');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PlatformBadge platform={dashboardState.platform} />
            <Badge variant="success" dot={true}>
              Live Synchronized
            </Badge>
            <span className="text-[11px] text-stone-400 font-mono-code">
              Sub-15ms Redis Cache
            </span>
          </div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">
            {dashboardState.title}
          </h1>
          <p className="text-xs text-stone-500 mt-0.5">
            {dashboardState.subtitle}
          </p>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Select
            value={timeframeFilter}
            onChange={(e) => {
              setTimeframeFilter(e.target.value);
              handleExecutePrompt(`Filter dashboard for ${e.target.value === '7d' ? 'Last 7 Days' : e.target.value === '90d' ? 'Q3 2026 Quarter' : 'Last 30 Days'}`);
            }}
            className="w-36 text-xs"
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
            leftIcon={<Database className="w-3.5 h-3.5" />}
          >
            + Add Another Source
          </Button>
        </div>
      </div>

      {/* Main Integrated Layout: Left Dashboard Canvas & Right AI Chat Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Live Dynamic Dashboard Canvas (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Executive KPI Cards - Individually Tailored */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {dashboardState.kpis.map((kpi, idx) => {
              const kpiConfigs = [
                {
                  variant: 'emerald' as const,
                  type: 'currency' as const,
                  badge: 'Live ARR',
                  target: { current: 4.2, goal: 5.0, label: 'ARR Goal' },
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
            <div className="p-3.5 bg-white rounded-lg border border-stone-200/90 shadow-2xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-900">
                <Sparkles className="w-3.5 h-3.5 text-stone-800" />
                <span>AI Introspection Signals &amp; Dynamic Adjustments</span>
              </div>
              <ul className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px] text-stone-600 pt-1">
                {dashboardState.insights.map((ins, idx) => (
                  <li key={idx} className="p-2 bg-[#fbfbf9] rounded border border-stone-100 flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-stone-900 mt-1 shrink-0" />
                    <span>{ins}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Dual Charts Area */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Chart Widget */}
            <Card className="p-5">
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

            {/* Secondary Chart Widget */}
            <Card className="p-5">
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
          <Card padding="none" className="overflow-hidden">
            <div className="px-5 py-3.5 border-b border-stone-200 bg-[#fbfbf9]/60 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  {dashboardState.dataTable.title}
                </h3>
                <p className="text-xs text-stone-500">
                  {dashboardState.dataTable.subtitle}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onNavigate('explorer')}
              >
                Open in SQL Worksheet
              </Button>
            </div>

            <div className="divide-y divide-stone-100 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-stone-50/70 text-stone-600 font-semibold select-none">
                    {dashboardState.dataTable.columns.map((col) => (
                      <th
                        key={col.key}
                        className={`py-2.5 px-3.5 ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}`}
                      >
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-stone-800">
                  {dashboardState.dataTable.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-stone-50/70 transition-colors">
                      {dashboardState.dataTable.columns.map((col) => (
                        <td
                          key={col.key}
                          className={`py-3 px-3.5 ${
                            col.isMonospace ? 'font-mono-code text-[11px]' : ''
                          } ${col.align === 'right' ? 'text-right font-semibold' : col.align === 'center' ? 'text-center' : ''}`}
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

        {/* Right Side: Embedded AI Chatbot Panel (4 Cols) */}
        <div className="lg:col-span-4 sticky top-20 h-[calc(100vh-6rem)] rounded-xl border border-stone-200/90 overflow-hidden shadow-xs bg-white">
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
