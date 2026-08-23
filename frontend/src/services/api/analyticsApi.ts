import { OverviewKPIs } from '../../types';
import { INITIAL_KPIS } from '../../constants/mockData';

export interface StorageGrowthPoint {
  date: string;
  snowflakeGb: number;
  tablesCount: number;
  partitions: number;
}

export interface QueryActivityPoint {
  hour: string;
  queriesCount: number;
  avgLatencyMs: number;
  cacheHitPercent: number;
}

export interface SchemaDistributionPoint {
  schemaName: string;
  tableCount: number;
  sizeGb: number;
  percentage: number;
}

export const analyticsApi = {
  async getOverviewKPIs(): Promise<OverviewKPIs> {
    // Simulates GET /api/v1/analytics/kpis
    await new Promise((resolve) => setTimeout(resolve, 200));
    return { ...INITIAL_KPIS };
  },

  async getStorageGrowth(): Promise<StorageGrowthPoint[]> {
    // Simulates GET /api/v1/analytics/storage-trends
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [
      { date: 'Mon', snowflakeGb: 3420, tablesCount: 232, partitions: 14200 },
      { date: 'Tue', snowflakeGb: 3510, tablesCount: 235, partitions: 14600 },
      { date: 'Wed', snowflakeGb: 3620, tablesCount: 240, partitions: 15100 },
      { date: 'Thu', snowflakeGb: 3680, tablesCount: 242, partitions: 15300 },
      { date: 'Fri', snowflakeGb: 3740, tablesCount: 245, partitions: 15700 },
      { date: 'Sat', snowflakeGb: 3790, tablesCount: 246, partitions: 15900 },
      { date: 'Sun', snowflakeGb: 3840, tablesCount: 248, partitions: 16200 },
    ];
  },

  async getQueryActivity(): Promise<QueryActivityPoint[]> {
    // Simulates GET /api/v1/analytics/query-activity
    await new Promise((resolve) => setTimeout(resolve, 300));
    return [
      { hour: '00:00', queriesCount: 1420, avgLatencyMs: 120, cacheHitPercent: 96 },
      { hour: '04:00', queriesCount: 890, avgLatencyMs: 95, cacheHitPercent: 98 },
      { hour: '08:00', queriesCount: 4890, avgLatencyMs: 240, cacheHitPercent: 91 },
      { hour: '12:00', queriesCount: 8920, avgLatencyMs: 310, cacheHitPercent: 88 },
      { hour: '16:00', queriesCount: 7650, avgLatencyMs: 280, cacheHitPercent: 92 },
      { hour: '20:00', queriesCount: 3200, avgLatencyMs: 160, cacheHitPercent: 95 },
    ];
  },

  async getSchemaDistribution(): Promise<SchemaDistributionPoint[]> {
    // Simulates GET /api/v1/analytics/schema-distribution
    await new Promise((resolve) => setTimeout(resolve, 250));
    return [
      { schemaName: 'SALES (Retail)', tableCount: 48, sizeGb: 1420, percentage: 37 },
      { schemaName: 'CORE (Customer 360)', tableCount: 72, sizeGb: 980, percentage: 26 },
      { schemaName: 'GL & AR (Finance)', tableCount: 54, sizeGb: 760, percentage: 20 },
      { schemaName: 'CAMPAIGNS (Marketing)', tableCount: 31, sizeGb: 420, percentage: 11 },
      { schemaName: 'LANDING (Staging)', tableCount: 43, sizeGb: 260, percentage: 6 },
    ];
  },
};
