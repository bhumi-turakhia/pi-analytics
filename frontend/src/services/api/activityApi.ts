import { ActivityLog } from '../../types';
import { MOCK_ACTIVITY_LOGS } from '../../constants/mockData';

let activityStore: ActivityLog[] = [...MOCK_ACTIVITY_LOGS];

export const activityApi = {
  async getAll(): Promise<ActivityLog[]> {
    // Simulates GET /api/v1/activity
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [...activityStore];
  },

  async logAction(action: Omit<ActivityLog, 'id' | 'timestamp' | 'ipAddress'>): Promise<ActivityLog> {
    const newLog: ActivityLog = {
      id: `act_${Date.now()}`,
      timestamp: 'Just now',
      ipAddress: '10.240.12.88',
      ...action,
    };
    activityStore = [newLog, ...activityStore];
    return newLog;
  },

  async exportAuditTrail(): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const header = 'Timestamp,User,Email,Role,Action,Resource,TargetType,Status,IP Address\n';
    const rows = activityStore
      .map(
        (a) =>
          `"${a.timestamp}","${a.user.name}","${a.user.email}","${a.user.role}","${a.action}","${a.resource}","${a.targetType}","${a.status}","${a.ipAddress}"`
      )
      .join('\n');
    return header + rows;
  },
};
