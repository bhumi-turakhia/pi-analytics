import { DataSource, PlatformType } from '../../types';

const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Payload used when creating a new data source.
 */
export interface CreateDataSourcePayload {
  name: string;
  platform: PlatformType;
  environment?: 'production' | 'staging' | 'development';
  accountIdentifier?: string;
  warehouse?: string;
  database?: string;
  defaultSchema?: string;
  username?: string;
  password?: string;
  role?: string;
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
}

/**
 * Result returned by the connection test.
 */
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

/**
 * Actual response returned by:
 * GET /api/sources/, POST /api/sources/, and POST /api/sources/{id}/sync
 */
export interface BackendDataSource {
  id: number;
  name: string;
  source_type: string;
  created_at: string;
  last_sync_at?: string | null;
}

function formatSyncTime(timestampStr?: string | null): string {
  if (!timestampStr) return 'Never';
  try {
    const date = new Date(timestampStr);
    if (isNaN(date.getTime())) return timestampStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    return date.toLocaleDateString();
  } catch {
    return timestampStr;
  }
}

/**
 * Converts the backend representation into the richer
 * DataSource structure expected by the existing React UI.
 */
export function mapBackendSource(source: BackendDataSource): DataSource {
  return {
    id: String(source.id),
    name: source.name,
    platform: (source.source_type || 'snowflake') as DataSource['platform'],
    environment: 'production',
    status: 'healthy',
    accountIdentifier: source.source_type?.toUpperCase() === 'SALESFORCE' ? 'SALESFORCE_CLOUD' : 'SNOWFLAKE',
    warehouse: source.source_type?.toUpperCase() === 'SALESFORCE' ? 'SALES_CLOUD_PROD' : 'COMPUTE_WH',
    database: source.source_type?.toUpperCase() === 'SALESFORCE' ? 'SALESFORCE_REVENUE_DB' : 'SNOWFLAKE',
    defaultSchema: 'PUBLIC',
    username: '',
    role: 'PUBLIC',
    lastSyncAt: formatSyncTime(source.last_sync_at || source.created_at),
    tableCount: 0,
    schemaCount: 0,
    recordCountEstimate: '0',
    storageSizeGb: 0,
    region: 'AWS',
    createdAt: source.created_at || new Date().toISOString(),
    autoSyncEnabled: true,
    syncIntervalMinutes: 30,
  };
}

/**
 * Data Source API
 */
export const dataSourceApi = {
  /**
   * Get all data sources from the FastAPI backend.
   * GET http://127.0.0.1:8000/api/sources/
   */
  async getAll(): Promise<DataSource[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sources/`);

      if (!response.ok) {
        throw new Error(
          `Failed to fetch data sources: HTTP ${response.status}`
        );
      }

      const data: BackendDataSource[] = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Invalid response received from data sources API.');
      }

      return data.map(mapBackendSource);
    } catch (error) {
      console.error('Failed to load data sources:', error);
      throw error;
    }
  },

  /**
   * Get a single data source by ID.
   */
  async getById(id: string): Promise<DataSource | null> {
    const sources = await this.getAll();
    return sources.find((source) => source.id === id) ?? null;
  },

  /**
   * Test a connection (frontend simulation).
   */
  async testConnection(
    payload: Partial<CreateDataSourcePayload>
  ): Promise<TestConnectionResult> {
    if (payload.platform === 'databricks') {
      return {
        success: false,
        latencyMs: 400,
        message:
          'Databricks connector is scheduled for Phase 2 release. Please use Snowflake Native connector.',
      };
    }

    if (!payload.accountIdentifier || !payload.username) {
      return {
        success: false,
        latencyMs: 120,
        message:
          'Missing required credentials. Account Identifier and Username are mandatory.',
      };
    }

    return {
      success: true,
      latencyMs: 248,
      message: 'Connection established successfully.',
      details: {
        snowflakeVersion: '8.14.2 Enterprise Edition',
        warehouseStatus: `${payload.warehouse || 'COMPUTE_WH'} (STARTED - X-Small)`,
        accountEdition: 'Enterprise AWS us-east-1',
        accessibleDatabases: [
          payload.database || 'SNOWFLAKE',
          'SHARED_COMMON_DB',
          'SNOWFLAKE',
        ],
      },
    };
  },

  /**
   * Create a new data source in PostgreSQL via FastAPI.
   * POST http://127.0.0.1:8000/api/sources/
   */
  async create(payload: CreateDataSourcePayload): Promise<DataSource> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sources/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: payload.name,
          source_type: payload.platform || 'snowflake',
          platform: payload.platform || 'snowflake',
          environment: payload.environment,
          account_identifier: payload.accountIdentifier,
          warehouse: payload.warehouse,
          database: payload.database,
          default_schema: payload.defaultSchema,
          username: payload.username,
          role: payload.role,
          auto_sync_enabled: payload.autoSyncEnabled,
          sync_interval_minutes: payload.syncIntervalMinutes,
        }),
      });

      if (!response.ok) {
        let errorMsg = `Failed to create data source: HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.detail) {
            errorMsg = Array.isArray(errData.detail)
              ? errData.detail.map((d: any) => d.msg || d.message).join(', ')
              : errData.detail;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const created: BackendDataSource = await response.json();
      return mapBackendSource(created);
    } catch (error) {
      console.error('Failed to create data source:', error);
      throw error;
    }
  },

  /**
   * Trigger an immediate synchronization via FastAPI backend.
   * POST http://127.0.0.1:8000/api/sources/{id}/sync
   */
  async syncNow(id: string): Promise<DataSource> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sources/${id}/sync`, {
        method: 'POST',
      });

      if (!response.ok) {
        let errorMsg = `Failed to sync data source: HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.detail) {
            errorMsg = errData.detail;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      const data: BackendDataSource = await response.json();
      return mapBackendSource(data);
    } catch (error) {
      console.error(`Failed to sync data source ${id}:`, error);
      throw error;
    }
  },

  /**
   * Disconnect a data source.
   */
  async disconnect(_id: string): Promise<DataSource> {
    throw new Error('Disconnect is not connected to the backend yet.');
  },

  /**
   * Delete a data source.
   */
  async delete(_id: string): Promise<boolean> {
    throw new Error('Delete is not connected to the backend yet.');
  },
};