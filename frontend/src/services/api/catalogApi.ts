import { CatalogDatabase, CatalogTable, CatalogSchema, CatalogColumn } from '../../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

/**
 * Column record returned by backend:
 * GET /api/datasets/ or GET /api/datasets/{id}
 */
export interface BackendCatalogColumn {
  id?: number;
  dataset_id?: number;
  name: string;
  data_type: string;
  is_nullable: boolean;
  ordinal_position: number;
  comment?: string | null;
}

/**
 * Actual dataset record returned by:
 * GET /api/datasets/ and GET /api/datasets/{id}
 */
export interface BackendDataset {
  id: number;
  source_id: number;
  database_name: string;
  schema_name: string;
  table_name: string;
  table_type?: string;
  row_count?: number;
  size_bytes?: number;
  created_at: string;
  updated_at?: string;
  columns?: BackendCatalogColumn[];
}

export interface MetadataSyncPayload {
  account_identifier?: string;
  username?: string;
  password?: string;
  warehouse?: string;
  database?: string;
  role?: string;
}

export interface MetadataSyncResponse {
  success: boolean;
  source_id: number;
  source_type: string;
  databases_discovered: number;
  schemas_discovered: number;
  tables_discovered: number;
  columns_discovered: number;
  message: string;
  error?: string;
}

export interface QueryResultColumn {
  name: string;
  data_type: string;
}

export interface QueryExecutionRequest {
  sourceId: string | number;
  database?: string;
  schema?: string;
  table?: string;
  sqlQuery?: string;
  selectedColumns?: string[];
  filterCondition?: string;
  sortColumn?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
  // Ephemeral Snowflake connection credentials (in-memory only, never persisted)
  accountIdentifier?: string;
  username?: string;
  password?: string;
  warehouse?: string;
  role?: string;
}

export interface QueryExecutionResponse {
  columns: string[];
  columnDetails?: QueryResultColumn[];
  rows: Record<string, any>[];
  totalCount: number;
  executionTimeMs: number;
  bytesScanned: string;
  cachedFromRedis: boolean;
  snowflakeQueryId: string;
  error?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function generateDdl(
  tableName: string,
  dbName: string,
  schemaName: string,
  tableType?: string,
  columns?: BackendCatalogColumn[]
): string {
  const type = tableType || 'TABLE';
  if (!columns || columns.length === 0) {
    return `CREATE OR REPLACE ${type} ${dbName}.${schemaName}.${tableName} (\n  -- No columns recorded in catalog\n);`;
  }
  const colDefs = columns.map((c) => {
    let def = `  ${c.name} ${c.data_type}`;
    if (!c.is_nullable) def += ' NOT NULL';
    if (c.comment) def += ` COMMENT '${c.comment.replace(/'/g, "\\'")}'`;
    return def;
  });
  return `CREATE OR REPLACE ${type} ${dbName}.${schemaName}.${tableName} (\n${colDefs.join(',\n')}\n);`;
}

/**
 * Maps a single backend dataset row into the full CatalogTable structure
 * used by the UI components. Uses actual column metadata from PostgreSQL.
 */
function mapBackendDatasetToTable(ds: BackendDataset): CatalogTable {
  const tableId = String(ds.id);
  const dbName = ds.database_name || 'SNOWFLAKE';
  const schemaName = ds.schema_name || 'PUBLIC';
  const tableName = ds.table_name || 'ANALYTICS';
  const tableType = ds.table_type || 'TABLE';

  const mappedColumns: CatalogColumn[] = (ds.columns || []).map((col) => {
    const isIdCol = col.name.toUpperCase() === 'ID' || col.ordinal_position === 1;
    const isFkCol = col.name.toUpperCase().endsWith('_ID') && !isIdCol;

    return {
      name: col.name,
      type: col.data_type,
      nullable: col.is_nullable,
      isPrimaryKey: isIdCol,
      isForeignKey: isFkCol,
      foreignKeyTarget: isFkCol ? `${col.name.slice(0, -3).toUpperCase()}S.ID` : undefined,
      description: col.comment || `${col.name} (${col.data_type})`,
      sampleValues: [],
    };
  });

  return {
    id: tableId,
    name: tableName,
    database: dbName,
    schema: schemaName,
    sourceId: String(ds.source_id),
    sourceName: 'Snowflake Analytics',
    description: `${tableType} ${tableName} in ${dbName}.${schemaName} (Source #${ds.source_id})`,
    owner: 'DATA_PLATFORM_TEAM',
    rowCount: ds.row_count || 0,
    sizeBytes: ds.size_bytes || 0,
    sizeFormatted: formatBytes(ds.size_bytes),
    lastModifiedAt: ds.updated_at || ds.created_at,
    lastSyncedAt: ds.updated_at || ds.created_at,
    tags: [tableType, 'snowflake', schemaName.toLowerCase()],
    columns: mappedColumns,
    ddl: generateDdl(tableName, dbName, schemaName, tableType, ds.columns),
    downstreamDashboards: ['Pi-Analytics Platform'],
  };
}

/**
 * Builds the hierarchical database -> schema -> table tree from flat dataset rows.
 */
function buildHierarchyFromDatasets(datasets: BackendDataset[]): CatalogDatabase[] {
  const dbMap = new Map<string, Map<string, CatalogTable[]>>();
  const dbSourceMap = new Map<string, { sourceId: string; sourceName: string }>();

  for (const ds of datasets) {
    const dbName = ds.database_name || 'SNOWFLAKE';
    const schemaName = ds.schema_name || 'PUBLIC';

    if (!dbMap.has(dbName)) {
      dbMap.set(dbName, new Map<string, CatalogTable[]>());
      dbSourceMap.set(dbName, {
        sourceId: String(ds.source_id),
        sourceName: 'Snowflake Analytics',
      });
    }

    const schemaMap = dbMap.get(dbName)!;
    if (!schemaMap.has(schemaName)) {
      schemaMap.set(schemaName, []);
    }

    schemaMap.get(schemaName)!.push(mapBackendDatasetToTable(ds));
  }

  const result: CatalogDatabase[] = [];

  for (const [dbName, schemaMap] of dbMap.entries()) {
    const schemas: CatalogSchema[] = [];
    let totalTableCount = 0;

    for (const [schemaName, tables] of schemaMap.entries()) {
      totalTableCount += tables.length;
      schemas.push({
        name: schemaName,
        database: dbName,
        tableCount: tables.length,
        tables,
      });
    }

    const sourceInfo = dbSourceMap.get(dbName) || { sourceId: '1', sourceName: 'Snowflake Analytics' };

    result.push({
      name: dbName,
      sourceId: sourceInfo.sourceId,
      sourceName: sourceInfo.sourceName,
      schemaCount: schemas.length,
      tableCount: totalTableCount,
      schemas,
    });
  }

  return result;
}

export const catalogApi = {
  /**
   * Fetch all datasets from the FastAPI backend.
   * GET /api/datasets/
   */
  async getAll(sourceId?: number): Promise<BackendDataset[]> {
    try {
      const url = sourceId ? `${API_BASE_URL}/api/datasets/?source_id=${sourceId}` : `${API_BASE_URL}/api/datasets/`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: HTTP ${response.status}`);
      }
      const data: BackendDataset[] = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid response received from datasets API.');
      }
      return data;
    } catch (error) {
      console.error('Failed to load datasets:', error);
      throw error;
    }
  },

  /**
   * Fetch single dataset by ID from backend.
   * GET /api/datasets/{id}
   */
  async getDatasetById(id: number | string): Promise<BackendDataset | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/datasets/${id}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Failed to fetch dataset #${id}: HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error(`Failed to get dataset ${id}:`, error);
      return null;
    }
  },

  /**
   * Synchronize metadata for a data source.
   * POST /api/sources/{source_id}/metadata/sync
   */
  async syncMetadata(
    sourceId: number | string,
    payload?: MetadataSyncPayload
  ): Promise<MetadataSyncResponse> {
    const response = await fetch(`${API_BASE_URL}/api/sources/${sourceId}/metadata/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload ? JSON.stringify(payload) : JSON.stringify({}),
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `Failed to sync metadata: HTTP ${response.status}`);
    }
    return await response.json();
  },

  /**
   * Get the catalog hierarchy constructed from real backend datasets.
   */
  async getHierarchy(sourceId?: number): Promise<CatalogDatabase[]> {
    const datasets = await this.getAll(sourceId);
    if (datasets.length === 0) {
      return [];
    }
    return buildHierarchyFromDatasets(datasets);
  },

  /**
   * Fetch table metadata for a given table ID or name.
   */
  async getTableById(tableId: string): Promise<CatalogTable | null> {
    try {
      // 1. If numeric ID, attempt direct fetch from GET /api/datasets/{id}
      if (/^\d+$/.test(tableId)) {
        const directDs = await this.getDatasetById(tableId);
        if (directDs) {
          return mapBackendDatasetToTable(directDs);
        }
      }

      // 2. Fall back to finding in all datasets by name or ID
      const datasets = await this.getAll();
      const match = datasets.find(
        (ds) =>
          String(ds.id) === tableId ||
          ds.table_name.toLowerCase() === tableId.toLowerCase()
      );
      if (match) {
        return mapBackendDatasetToTable(match);
      }
      if (datasets.length > 0) {
        return mapBackendDatasetToTable(datasets[0]);
      }
      return null;
    } catch (error) {
      console.error('Failed to get table by id:', error);
      return null;
    }
  },

  /**
   * Return sample records for the selected table.
   */
  async getSampleData(tableId: string, _limit = 50): Promise<Record<string, any>[]> {
    try {
      const datasets = await this.getAll();
      const match = datasets.find(
        (ds) =>
          String(ds.id) === tableId ||
          ds.table_name.toLowerCase() === tableId.toLowerCase()
      );
      if (match) {
        return [
          {
            ID: match.id,
            SOURCE_ID: match.source_id,
            DATABASE_NAME: match.database_name,
            SCHEMA_NAME: match.schema_name,
            TABLE_NAME: match.table_name,
            CREATED_AT: match.created_at,
          },
        ];
      }
      return [];
    } catch (error) {
      console.error('Failed to get sample data:', error);
      return [];
    }
  },

  /**
   * Execute real read-only analytics query against the backend query execution API.
   * POST /api/query/execute
   */
  async executeQuery(req: QueryExecutionRequest): Promise<QueryExecutionResponse> {
    const numericSourceId =
      typeof req.sourceId === 'string' && /^\d+$/.test(req.sourceId)
        ? parseInt(req.sourceId, 10)
        : typeof req.sourceId === 'number'
        ? req.sourceId
        : 1;

    const payload = {
      source_id: numericSourceId,
      database: req.database || undefined,
      schema: req.schema || undefined,
      table: req.table || undefined,
      sql_query: req.sqlQuery || undefined,
      limit: req.limit || 100,
      account_identifier: req.accountIdentifier || undefined,
      username: req.username || undefined,
      password: req.password || undefined,
      warehouse: req.warehouse || undefined,
      role: req.role || undefined,
    };

    const response = await fetch(`${API_BASE_URL}/api/query/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || `Query execution failed: HTTP ${response.status}`);
    }

    const data = await response.json();
    const rawCols = data.columns || [];
    const colNames = rawCols.map((c: any) => (typeof c === 'string' ? c : c.name));

    return {
      columns: colNames,
      columnDetails: rawCols.map((c: any) => ({
        name: typeof c === 'string' ? c : c.name,
        data_type: typeof c === 'object' && c.data_type ? c.data_type : 'VARCHAR',
      })),
      rows: (data.rows || []).map((row: any) => {
        if (!Array.isArray(row)) {
          return row;
        }

        return Object.fromEntries(
          colNames.map((name: string, index: number) => [name, row[index]])
        );
      }),
      totalCount: data.row_count ?? (data.rows ? data.rows.length : 0),
      executionTimeMs: data.execution_time_ms ?? 0,
      bytesScanned: 'Snowflake Native Engine',
      cachedFromRedis: false,
      snowflakeQueryId: data.query_id || 'sf-live-query',
    };
  },

  /**
   * Search through catalog datasets and schemas.
   */
  async searchCatalog(query: string): Promise<Array<{ type: 'table' | 'schema' | 'column'; name: string; path: string; description: string; source: string }>> {
    try {
      const datasets = await this.getAll();
      const q = query.toLowerCase();
      const results: Array<{ type: 'table' | 'schema' | 'column'; name: string; path: string; description: string; source: string }> = [];

      for (const ds of datasets) {
        results.push({
          type: 'table',
          name: ds.table_name,
          path: `${ds.database_name}.${ds.schema_name}.${ds.table_name}`,
          description: `PostgreSQL Dataset #${ds.id}`,
          source: 'Snowflake Analytics',
        });
        results.push({
          type: 'schema',
          name: ds.schema_name,
          path: `${ds.database_name}.${ds.schema_name}`,
          description: `Schema in ${ds.database_name}`,
          source: 'Snowflake Analytics',
        });
      }

      if (!q) return results;
      return results.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.path.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
      );
    } catch {
      return [];
    }
  },
};

