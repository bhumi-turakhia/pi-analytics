import { ActivityLog, PipelineRun } from '../../types';
import { pipelineRunApi } from './pipelineRunApi';
import { dataSourceApi } from './dataSourceApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

let localUserActions: ActivityLog[] = [];

function formatTimestamp(isoString: string): string {
  if (!isoString) return 'Just now';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function mapStatus(status: string): ActivityLog['status'] {
  const s = status.toUpperCase();
  if (s === 'SUCCESS' || s === 'COMPLETED' || s === 'HEALTHY') return 'success';
  if (s === 'WARNING' || s === 'RUNNING' || s === 'SYNCING') return 'warning';
  if (s === 'FAILED' || s === 'FAILURE' || s === 'ERROR') return 'failure';
  return 'info';
}

function mapPipelineRunToActivity(run: PipelineRun, sourceNameMap: Map<string, string>): ActivityLog {
  const sourceName = sourceNameMap.get(String(run.sourceId)) || `Data Source #${run.sourceId}`;
  const timestamp = formatTimestamp(run.completedAt || run.startedAt);

  return {
    id: `run_${run.id}`,
    timestamp,
    user: {
      name: 'Pipeline Sync Engine',
      email: 'worker@pi-analytics.internal',
      role: 'System Orchestrator',
    },
    action: `Pipeline sync run #${run.id} (${run.rowsProcessed.toLocaleString()} rows processed)`,
    resource: sourceName,
    targetType: 'connection',
    status: mapStatus(run.status),
    details: `Pipeline Run ID: ${run.id}\nSource: ${sourceName} (ID: ${run.sourceId})\nStatus: ${run.status}\nStarted At: ${run.startedAt}\nCompleted At: ${run.completedAt}\nRows Processed: ${run.rowsProcessed.toLocaleString()}`,
    ipAddress: '127.0.0.1',
  };
}

export const activityApi = {
  /**
   * Fetch all activity and audit logs combining real pipeline runs from backend
   * with locally logged system events.
   */
  async getAll(): Promise<ActivityLog[]> {
    try {
      const [pipelineRuns, sources, auditEvents] = await Promise.all([
        pipelineRunApi.getAll(),
        dataSourceApi.getAll().catch(() => []),
        fetch(`${API_BASE_URL}/api/audit/events?limit=100`)
          .then((res) => (res.ok ? res.json() : []))
          .catch(() => []),
      ]);

      const sourceNameMap = new Map<string, string>();
      for (const src of sources) {
        sourceNameMap.set(src.id, src.name);
      }

      const runLogs = pipelineRuns.map((run) => mapPipelineRunToActivity(run, sourceNameMap));

      const backendAuditLogs: ActivityLog[] = Array.isArray(auditEvents)
        ? auditEvents.map((evt: any) => ({
            id: `audit_${evt.id}`,
            timestamp: formatTimestamp(evt.timestamp),
            user: {
              name: evt.actor === 'analyst' ? 'Analytics User' : evt.actor || 'System',
              email: 'analyst@pi-analytics.internal',
              role: 'Data Analyst',
            },
            action: `${evt.action_type.replace(/_/g, ' ').toUpperCase()}${evt.question ? `: "${evt.question}"` : ''}`,
            resource: evt.dashboard_id ? `Dashboard #${evt.dashboard_id}` : (evt.source_id ? (sourceNameMap.get(String(evt.source_id)) || `Source #${evt.source_id}`) : 'Analytics Engine'),
            targetType: evt.dashboard_id ? 'query' : 'connection',
            status: mapStatus(evt.status || 'success'),
            details: `Action: ${evt.action_type}\nStatus: ${evt.status}\nRows: ${evt.rows_returned || 0}\nExec Time: ${evt.execution_time_ms || 0}ms${evt.generated_sql ? `\nSQL: ${evt.generated_sql}` : ''}`,
            ipAddress: '127.0.0.1',
          }))
        : [];

      return [...localUserActions, ...backendAuditLogs, ...runLogs];
    } catch (error) {
      console.error('Failed to load activity logs from pipeline runs & audit events:', error);
      return [...localUserActions];
    }
  },

  async logAction(action: Omit<ActivityLog, 'id' | 'timestamp' | 'ipAddress'>): Promise<ActivityLog> {
    const newLog: ActivityLog = {
      id: `act_${Date.now()}`,
      timestamp: 'Just now',
      ipAddress: '127.0.0.1',
      ...action,
    };
    localUserActions = [newLog, ...localUserActions];
    return newLog;
  },

  async getReportHistory(limit: number = 100): Promise<any[]> {
    const response = await fetch(
      `${API_BASE_URL}/api/audit/events?limit=${limit}&action_type=export`
    );

    if (!response.ok) {
      throw new Error(`Failed to load report history (${response.status})`);
    }

    const events = await response.json();

    return Array.isArray(events)
      ? events.filter((event: any) => Boolean(event.export_type))
      : [];
  },
  async exportAuditTrail(): Promise<string> {
    const logs = await this.getAll();
    const header = 'Timestamp,User,Email,Role,Action,Resource,TargetType,Status,IP Address\n';
    const rows = logs
      .map(
        (a) =>
          `"${a.timestamp}","${a.user.name}","${a.user.email}","${a.user.role}","${a.action}","${a.resource}","${a.targetType}","${a.status}","${a.ipAddress}"`
      )
      .join('\n');
    return header + rows;
  },
};


