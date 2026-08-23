import { DataSource, ConnectionStatus } from '../../types';
import { MOCK_DATA_SOURCES } from '../../constants/mockData';

// Simulated in-memory store representing PostgreSQL application metadata
let sourcesStore: DataSource[] = [...MOCK_DATA_SOURCES];

export interface CreateDataSourcePayload {
  name: string;
  platform: 'snowflake' | 'databricks';
  environment: 'production' | 'staging' | 'development';
  accountIdentifier: string;
  warehouse: string;
  database: string;
  defaultSchema: string;
  username: string;
  password?: string;
  role: string;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  message: string;
  details?: {
    snowflakeVersion?: string;
    warehouseStatus?: string;
    accountEdition?: string;
    accessibleDatabases?: string[];
  };
}

export const dataSourceApi = {
  async getAll(): Promise<DataSource[]> {
    // Simulates GET /api/v1/data-sources
    await new Promise((resolve) => setTimeout(resolve, 250));
    return [...sourcesStore];
  },

  async getById(id: string): Promise<DataSource | null> {
    // Simulates GET /api/v1/data-sources/{id}
    await new Promise((resolve) => setTimeout(resolve, 150));
    const found = sourcesStore.find((s) => s.id === id);
    return found ? { ...found } : null;
  },

  async testConnection(payload: Partial<CreateDataSourcePayload>): Promise<TestConnectionResult> {
    // Simulates POST /api/v1/data-sources/test-connection
    await new Promise((resolve) => setTimeout(resolve, 1200));

    if (payload.platform === 'databricks') {
      return {
        success: false,
        latencyMs: 400,
        message: 'Databricks connector is scheduled for Phase 2 release. Please use Snowflake Native connector.',
      };
    }

    if (!payload.accountIdentifier || !payload.username) {
      return {
        success: false,
        latencyMs: 120,
        message: 'Missing required credentials. Account Identifier and Username are mandatory.',
      };
    }

    return {
      success: true,
      latencyMs: 248,
      message: 'Connection to Snowflake established successfully.',
      details: {
        snowflakeVersion: '8.14.2 Enterprise Edition',
        warehouseStatus: `${payload.warehouse || 'COMPUTE_WH'} (STARTED - X-Small)`,
        accountEdition: 'Enterprise AWS us-east-1',
        accessibleDatabases: [payload.database || 'RETAIL_ANALYTICS', 'SHARED_COMMON_DB', 'SNOWFLAKE'],
      },
    };
  },

  async create(payload: CreateDataSourcePayload): Promise<DataSource> {
    // Simulates POST /api/v1/data-sources
    await new Promise((resolve) => setTimeout(resolve, 600));

    const newSource: DataSource = {
      id: `src_sf_${Date.now()}`,
      name: payload.name,
      platform: payload.platform,
      environment: payload.environment,
      status: 'healthy',
      accountIdentifier: payload.accountIdentifier,
      warehouse: payload.warehouse,
      database: payload.database,
      defaultSchema: payload.defaultSchema || 'PUBLIC',
      username: payload.username,
      role: payload.role || 'PUBLIC',
      lastSyncAt: 'Just now',
      tableCount: 18,
      schemaCount: 2,
      recordCountEstimate: '45.2M',
      storageSizeGb: 48,
      region: 'AWS us-east-1',
      createdAt: new Date().toISOString().split('T')[0],
      autoSyncEnabled: payload.autoSyncEnabled ?? true,
      syncIntervalMinutes: payload.syncIntervalMinutes || 30,
    };

    sourcesStore = [newSource, ...sourcesStore];
    return newSource;
  },

  async syncNow(id: string): Promise<DataSource> {
    // Simulates POST /api/v1/data-sources/{id}/sync
    await new Promise((resolve) => setTimeout(resolve, 900));
    sourcesStore = sourcesStore.map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'healthy' as ConnectionStatus,
            lastSyncAt: 'Just now',
            errorMessage: undefined,
          }
        : s
    );
    const updated = sourcesStore.find((s) => s.id === id)!;
    return { ...updated };
  },

  async disconnect(id: string): Promise<DataSource> {
    // Simulates POST /api/v1/data-sources/{id}/disconnect
    await new Promise((resolve) => setTimeout(resolve, 400));
    sourcesStore = sourcesStore.map((s) =>
      s.id === id
        ? {
            ...s,
            status: 'disconnected' as ConnectionStatus,
          }
        : s
    );
    const updated = sourcesStore.find((s) => s.id === id)!;
    return { ...updated };
  },

  async delete(id: string): Promise<boolean> {
    // Simulates DELETE /api/v1/data-sources/{id}
    await new Promise((resolve) => setTimeout(resolve, 400));
    sourcesStore = sourcesStore.filter((s) => s.id !== id);
    return true;
  },
};
