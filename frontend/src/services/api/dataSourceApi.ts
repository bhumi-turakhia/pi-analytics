import { DataSource, PlatformType } from '../../types';
import { catalogApi, BackendDataset } from './catalogApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

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
  salesforceLoginUrl?: string;
  salesforceClientId?: string;
  salesforceClientSecret?: string;
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
  error?: string;
  sourceId?: number | null;
  sourceType?: string;
  details?: {
    snowflakeVersion?: string;
    warehouseStatus?: string;
    accountEdition?: string;
    accessibleDatabases?: string[];
    [key: string]: any;
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
  status?: string | null;
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
  const platform = (source.source_type || 'snowflake') as DataSource['platform'];
  const status = (source.status as DataSource['status']) || 'healthy';

  return {
    id: String(source.id),
    name: source.name,
    platform,
    environment: 'production',
    status,
    accountIdentifier:
      platform === 'salesforce'
        ? 'Backend-configured Salesforce OAuth'
        : 'N/A',
    warehouse: platform === 'snowflake' ? 'N/A' : 'N/A',
    database: 'N/A',
    defaultSchema: 'N/A',
    username: '',
    role: '',
    errorMessage: undefined,
    lastSyncAt: formatSyncTime(source.last_sync_at || source.created_at),
    tableCount: 0,
    schemaCount: 0,
    recordCountEstimate: '0',
    storageSizeGb: 0,
    region: 'N/A',
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

      const enrichedSources = await Promise.all(
        data.map(async (source) => {
          const mapped = mapBackendSource(source);

          try {
            const datasets: BackendDataset[] = await catalogApi.getAll(source.id);

            const databases = Array.from(
              new Set(datasets.map((d) => d.database_name).filter(Boolean))
            );

            const schemas = Array.from(
              new Set(
                datasets
                  .map((d) => `${d.database_name}.${d.schema_name}`)
                  .filter(Boolean)
              )
            );

            const totalRows = datasets.reduce(
              (sum, d) => sum + Number(d.row_count || 0),
              0
            );

            const totalBytes = datasets.reduce(
              (sum, d) => sum + Number(d.size_bytes || 0),
              0
            );

            return {
              ...mapped,
              database: databases[0] || mapped.database,
              defaultSchema: datasets[0]?.schema_name || mapped.defaultSchema,
              tableCount: datasets.length,
              schemaCount: schemas.length,
              recordCountEstimate: String(totalRows),
              storageSizeGb:
                totalBytes > 0
                  ? Number((totalBytes / (1024 ** 3)).toFixed(2))
                  : 0,
            };
          } catch (catalogError) {
            console.warn(
              `Could not enrich source ${source.id} with catalog metadata:`,
              catalogError
            );

            return mapped;
          }
        })
      );

      return enrichedSources;
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
   * Test a data source connection via FastAPI backend.
   * If an existing source id is provided: POST /api/sources/{id}/test-connection
   * If unsaved configuration (wizard): POST /api/sources/test-connection
   */
  async testConnection(
    payload: Partial<CreateDataSourcePayload> & { id?: string }
  ): Promise<TestConnectionResult> {
    try {
      const endpoint = payload.id
        ? `${API_BASE_URL}/api/sources/${payload.id}/test-connection`
        : `${API_BASE_URL}/api/sources/test-connection`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_type: payload.platform || 'snowflake',
          platform: payload.platform || 'snowflake',
          account_identifier: payload.accountIdentifier,
          username: payload.username,
          password: payload.password,
          warehouse: payload.warehouse,
          database: payload.database,
          default_schema: payload.defaultSchema,
          role: payload.role,
          salesforce_login_url: payload.salesforceLoginUrl,
          salesforce_client_id: payload.salesforceClientId,
          salesforce_client_secret: payload.salesforceClientSecret,
        }),
      });

      if (!response.ok) {
        let errorMsg = `Failed to test connection: HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.detail) {
            errorMsg = Array.isArray(errData.detail)
              ? errData.detail.map((d: any) => d.msg || d.message).join(', ')
              : errData.detail;
          }
        } catch {}
        return {
          success: false,
          latencyMs: 0,
          message: 'Connection test failed.',
          error: errorMsg,
        };
      }

      const data = await response.json();

      return {
        success: Boolean(data.success),
        latencyMs: data.latency_ms ?? 0,
        message:
          data.message ||
          (data.success ? 'Connection established successfully.' : 'Connection test failed.'),
        error: data.error,
        sourceId: data.source_id,
        sourceType: data.source_type,
        details: data.details
          ? {
              snowflakeVersion: data.details.snowflake_version,
              warehouseStatus: data.details.warehouse,
              accountEdition: data.details.account,
              accessibleDatabases: data.details.database ? [data.details.database] : undefined,
              ...data.details,
            }
          : undefined,
      };
    } catch (error: any) {
      console.error('Failed to test connection:', error);
      return {
        success: false,
        latencyMs: 0,
        message: 'Could not connect to backend connection testing service.',
        error: error?.message || 'Network error communicating with the backend API.',
      };
    }
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
   * Disconnect a data source via FastAPI backend.
   * POST http://127.0.0.1:8000/api/sources/{id}/disconnect
   */
  async disconnect(id: string): Promise<DataSource> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sources/${id}/disconnect`, {
        method: 'POST',
      });

      if (!response.ok) {
        let errorMsg = `Failed to disconnect data source: HTTP ${response.status}`;
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
      console.error(`Failed to disconnect data source ${id}:`, error);
      throw error;
    }
  },

  /**
   * Delete a data source via FastAPI backend.
   * DELETE http://127.0.0.1:8000/api/sources/{id}
   */
  async delete(id: string): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sources/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorMsg = `Failed to delete data source: HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData?.detail) {
            errorMsg = errData.detail;
          }
        } catch {}
        throw new Error(errorMsg);
      }

      return true;
    } catch (error) {
      console.error(`Failed to delete data source ${id}:`, error);
      throw error;
    }
  },
};
