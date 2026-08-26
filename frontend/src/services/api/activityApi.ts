import { ActivityLog, PipelineRun } from '../../types';
import { pipelineRunApi } from './pipelineRunApi';
import { dataSourceApi } from './dataSourceApi';

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
      const [pipelineRuns, sources] = await Promise.all([
        pipelineRunApi.getAll(),
        dataSourceApi.getAll().catch(() => []),
      ]);

      const sourceNameMap = new Map<string, string>();
      for (const src of sources) {
        sourceNameMap.set(src.id, src.name);
      }

      const runLogs = pipelineRuns.map((run) => mapPipelineRunToActivity(run, sourceNameMap));

      return [...localUserActions, ...runLogs];
    } catch (error) {
      console.error('Failed to load activity logs from pipeline runs:', error);
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
