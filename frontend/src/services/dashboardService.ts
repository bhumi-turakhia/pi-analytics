import { DashboardState, ChatMessage, DataSource, PlatformType } from '../types';

export const generateInitialDashboard = (source: Partial<DataSource>): DashboardState => {
  const isSalesforce = source.platform === 'salesforce' || source.name?.toLowerCase().includes('salesforce');
  const sourceName = source.name || (isSalesforce ? 'Salesforce Enterprise CRM' : 'Snowflake Retail Analytics');
  const platform = (source.platform || (isSalesforce ? 'salesforce' : 'snowflake')) as PlatformType;

  if (isSalesforce) {
    return {
      sourceId: source.id || 'src_salesforce_crm',
      sourceName,
      platform: 'salesforce',
      title: `${sourceName} • Pipeline & Revenue Intelligence`,
      subtitle: 'Salesforce connector is not yet implemented. Connect a real data source or configure credentials.',
      activeFilter: 'No Filter',
      regionFilter: 'All Regions',
      kpis: [],
      primaryChart: {
        id: 'chart_pipeline_velocity',
        title: 'Bookings & Quota Pacing',
        subtitle: 'No real data available yet',
        chartType: 'line',
        unit: '$',
        data: [],
      },
      secondaryChart: {
        id: 'chart_stage_breakdown',
        title: 'Opportunity Value by Sales Stage',
        subtitle: 'No real data available yet',
        chartType: 'bar',
        unit: '$',
        data: [],
      },
      dataTable: {
        title: 'Salesforce Opportunities',
        subtitle: 'No real records available yet',
        columns: [
          { key: 'account', header: 'Account / Client' },
          { key: 'stage', header: 'Stage' },
          { key: 'dealSize', header: 'Value ARR', align: 'right', isMonospace: true },
          { key: 'status', header: 'Status' },
        ],
        rows: [],
      },
      insights: [
        'Salesforce connector is not yet implemented.',
        'No real data available yet. Connect a data source and run a query to populate this dashboard.',
      ],
      lastPromptExecuted: '',
    };
  }

  // Default Warehouse / Snowflake Analytics Dashboard (Clean Empty State)
  return {
    sourceId: source.id || 'src_snowflake_sales',
    sourceName,
    platform: (platform === 'salesforce' ? 'salesforce' : 'snowflake'),
    title: `${sourceName} • Executive Intelligence Dashboard`,
    subtitle: 'No data available yet. Connect a data source and run a query to populate this dashboard.',
    activeFilter: 'No Filter',
    regionFilter: 'Global',
    kpis: [],
    primaryChart: {
      id: 'chart_revenue_velocity',
      title: 'Daily Volume & Trend',
      subtitle: 'No real data available yet',
      chartType: 'line',
      unit: '$',
      data: [],
    },
    secondaryChart: {
      id: 'chart_category_share',
      title: 'Distribution by Category',
      subtitle: 'No real data available yet',
      chartType: 'bar',
      unit: '$',
      data: [],
    },
    dataTable: {
      title: 'Warehouse Transactions',
      subtitle: 'No real records available yet',
      columns: [
        { key: 'orderNumber', header: 'Order ID', isMonospace: true },
        { key: 'customer', header: 'Customer Entity' },
        { key: 'amount', header: 'Total Net', align: 'right', isMonospace: true },
        { key: 'status', header: 'Status' },
      ],
      rows: [],
    },
    insights: [
      'No data available yet.',
      'Connect a data source and run a query to populate this dashboard.',
    ],
    lastPromptExecuted: '',
  };
};

/**
 * Disabled client-side fake business-data generator.
 * Real analytics queries must be processed via the backend AI Copilot / query engine.
 */
export const executeDashboardPrompt = (
  currentState: DashboardState,
  prompt: string
): { updatedDashboard: DashboardState; responseMessage: ChatMessage } => {
  const next: DashboardState = JSON.parse(JSON.stringify(currentState));
  next.lastPromptExecuted = prompt;
  next.subtitle = `Query submitted: "${prompt}". Connect Gemini API or a live warehouse source to execute.`;

  const responseMessage: ChatMessage = {
    id: `msg_ai_${Date.now()}`,
    sender: 'assistant',
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    content: 'Client-side simulation of fake business data has been disabled. Real metrics are queried strictly from connected warehouse sources or via a configured Gemini API key.',
    appliedChanges: [
      'Prevented generation of fabricated business metrics',
      'Requires real backend AI / catalog connection',
    ],
    suggestedFollowUps: [
      'Connect a data source and run a live query',
    ],
  };

  return { updatedDashboard: next, responseMessage };
};

