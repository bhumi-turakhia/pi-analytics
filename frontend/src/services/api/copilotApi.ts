/**
 * Step 10: AI Analytics Copilot + Dashboard Persistence API client.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

export interface ColumnMeta {
  name: string;
  data_type: string;
}

export interface VisualizationSpec {
  type: 'bar' | 'line' | 'kpi' | 'table' | 'pie' | 'donut' | 'scatter';
  title: string;
  xField?: string | null;
  yField?: string | null;
  unit?: string | null;
  value?: any;
}

export interface CopilotQueryRequest {
  question: string;
  source_id: number;
  database?: string;
  schema?: string;
  limit?: number;
  account_identifier?: string;
  accountIdentifier?: string;
  username?: string;
  password?: string;
  warehouse?: string;
  role?: string;
}

export interface CopilotQueryResponse {
  success: boolean;
  answer: string;
  sql?: string;
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  row_count: number;
  execution_time_ms: number;
  visualization?: VisualizationSpec;
  error?: string;
}

export interface DashboardWidget {
  id: number;
  dashboard_id: number;
  title: string;
  widget_type: string;
  source_id?: number | null;
  database_name?: string | null;
  schema_name?: string | null;
  table_name?: string | null;
  sql_query: string;
  visualization_spec: VisualizationSpec;
  position: number;
  width: number;
  height: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface DashboardSummary {
  id: number;
  name: string;
  source_id?: number | null;
  source_name?: string | null;
  source_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  widget_count: number;
}

export interface DashboardDetail {
  id: number;
  name: string;
  source_id?: number | null;
  source_name?: string | null;
  source_type?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  widgets: DashboardWidget[];
}

export interface DashboardModifyRequest {
  dashboard_id: number;
  instruction: string;
  source_id: number;
  account_identifier?: string;
  accountIdentifier?: string;
  username?: string;
  password?: string;
  warehouse?: string;
  role?: string;
  database?: string;
  schema?: string;
}

export interface DashboardModifyResponse {
  success: boolean;
  action_taken: string;
  widget_id?: number | null;
  widget_title?: string | null;
  sql?: string | null;
  message: string;
  error?: string | null;
}

export interface WidgetCreatePayload {
  title: string;
  widget_type: string;
  source_id?: number | null;
  database_name?: string | null;
  schema_name?: string | null;
  table_name?: string | null;
  sql_query: string;
  visualization_spec: VisualizationSpec;
  position?: number;
  width?: number;
  height?: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorBody?.detail || `API Request failed with status ${res.status}`);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json() as Promise<T>;
}

export const copilotApi = {
  /**
   * Execute conversational analytics query through catalog-grounded Copilot.
   */
  async askQuery(payload: CopilotQueryRequest): Promise<CopilotQueryResponse> {
    return request<CopilotQueryResponse>('/api/copilot/query', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * List all saved dashboards.
   */
  async getDashboards(): Promise<DashboardSummary[]> {
    return request<DashboardSummary[]>('/api/dashboards');
  },

  /**
   * Get a dashboard with its persisted widgets.
   */
  async getDashboard(id: number): Promise<DashboardDetail> {
    return request<DashboardDetail>(`/api/dashboards/${id}`);
  },

  /**
   * Create a new dashboard.
   */
  async createDashboard(name: string, sourceId?: number): Promise<DashboardDetail> {
    return request<DashboardDetail>('/api/dashboards', {
      method: 'POST',
      body: JSON.stringify({ name, source_id: sourceId }),
    });
  },

  /**
   * Add a widget to a dashboard.
   */
  async addWidget(dashboardId: number, widget: WidgetCreatePayload): Promise<DashboardWidget> {
    return request<DashboardWidget>(`/api/dashboards/${dashboardId}/widgets`, {
      method: 'POST',
      body: JSON.stringify(widget),
    });
  },

  /**
   * Delete a widget from a dashboard.
   */
  async deleteWidget(dashboardId: number, widgetId: number): Promise<void> {
    return request<void>(`/api/dashboards/${dashboardId}/widgets/${widgetId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Re-run a saved widget query with ephemeral credentials.
   */
  async runWidget(
    dashboardId: number,
    widgetId: number,
    creds?: Record<string, any>
  ): Promise<{
    success: boolean;
    columns: string[];
    rows: Record<string, any>[];
    row_count: number;
    execution_time_ms: number;
  }> {
    return request(`/api/dashboards/${dashboardId}/widgets/${widgetId}/run`, {
      method: 'POST',
      body: JSON.stringify(creds || {}),
    });
  },

  /**
   * P0-3: Natural-language dynamic dashboard modification via Gemini.
   */
  async modifyDashboard(payload: DashboardModifyRequest): Promise<DashboardModifyResponse> {
    return request<DashboardModifyResponse>('/api/copilot/dashboard-modify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
