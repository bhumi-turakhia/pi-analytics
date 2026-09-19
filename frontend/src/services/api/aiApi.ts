/**
 * Step 10 – AI Analytics Copilot API service.
 *
 * Calls POST /api/ai/copilot on the FastAPI backend.
 * The backend uses Gemini to generate structured analytics responses
 * grounded in real catalog metadata.
 *
 * When the backend returns 503 (no API key configured), the caller receives
 * an explicit message stating that a Gemini API key is required.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

// ── Request & Response types ──────────────────────────────────────────────────

export interface AIDashboardKPIContext {
  id: string;
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
}

export interface AIDashboardChartContext {
  id: string;
  title: string;
  chartType: string;
  unit: string;
}

export interface AIDashboardContext {
  sourceId?: string;
  sourceName?: string;
  platform?: string;
  title?: string;
  activeFilter?: string;
  kpis?: AIDashboardKPIContext[];
  primaryChart?: AIDashboardChartContext;
  secondaryChart?: AIDashboardChartContext;
  lastPromptExecuted?: string;
}

export interface AICopilotRequest {
  /** Numeric ID of the data source in PostgreSQL (if available) */
  source_id?: number;
  source_name?: string;
  platform?: string;
  /** The natural-language prompt from the user */
  prompt: string;
  /** Serialized snapshot of current dashboard state */
  dashboard_context?: AIDashboardContext;
  /** Optional list of fully-qualified table names already known client-side */
  catalog_context?: string[];
}

export interface AIDashboardMutation {
  subtitle?: string;
  insights?: string[];
  primary_chart_title?: string;
  secondary_chart_title?: string;
}

export interface AICopilotResponse {
  success: boolean;
  explanation: string;
  sql_query?: string;
  applied_changes: string[];
  suggested_follow_ups: string[];
  dashboard_mutation?: AIDashboardMutation;
  model_used?: string;
  latency_ms?: number;
  error?: string;
}

// ── API client ────────────────────────────────────────────────────────────────

/**
 * Send a prompt to the Gemini-powered copilot endpoint.
 *
 * Throws an error with `code: 503` when the backend has no API key configured,
 * so the caller knows to fall back to client-side simulation.
 */
async function sendPrompt(req: AICopilotRequest): Promise<AICopilotResponse> {
  const response = await fetch(`${API_BASE_URL}/api/ai/copilot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    const error = new Error(err?.detail || `HTTP ${response.status}`) as any;
    error.code = response.status;
    throw error;
  }

  return response.json() as Promise<AICopilotResponse>;
}

export const aiApi = { sendPrompt };
