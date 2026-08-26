import { CatalogDatabase, CatalogTable, CatalogSchema } from '../../types';

const API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Actual dataset record returned by:
 * GET /api/datasets/
 */
export interface BackendDataset {
  id: number;
  source_id: number;
  database_name: string;
  schema_name: string;
  table_name: string;
  created_at: string;
}

export interface QueryExecutionRequest {
  sourceId: string;
  database: string;
  schema: string;
  table: string;
  sqlQuery?: string;
  selectedColumns?: string[];
  filterCondition?: string;
  sortColumn?: string;
  sortDirection?: 'ASC' | 'DESC';
  limit?: number;
  offset?: number;
}

export interface QueryExecutionResponse {
  columns: string[];
  rows: Record<string, any>[];
  totalCount: number;
  executionTimeMs: number;
  bytesScanned: string;
  cachedFromRedis: boolean;
  snowflakeQueryId: string;
}

/**
 * Maps a single backend dataset row into the full CatalogTable structure
 * used by the UI components.
 */
function mapBackendDatasetToTable(ds: BackendDataset): CatalogTable {
  const tableId = String(ds.id);
  const dbName = ds.database_name || 'SNOWFLAKE';
  const schemaName = ds.schema_name || 'PUBLIC';
  const tableName = ds.table_name || 'ANALYTICS';

  return {
    id: tableId,
    name: tableName,
    database: dbName,
    schema: schemaName,
    sourceId: String(ds.source_id),
    sourceName: 'Snowflake Analytics',
    description: `Dataset ${tableName} in ${dbName}.${schemaName} (Source #${ds.source_id})`,
    owner: 'DATA_PLATFORM_TEAM',
    rowCount: 0,
    sizeBytes: 0,
    sizeFormatted: 'Live Table',
    lastModifiedAt: ds.created_at,
    lastSyncedAt: ds.created_at,
    tags: ['postgresql-metadata', 'production'],
    columns: [
      {
        name: 'ID',
        type: 'INTEGER',
        nullable: false,
        isPrimaryKey: true,
        description: 'Primary identifier in PostgreSQL datasets table',
        sampleValues: [ds.id],
        distinctCount: 1,
        nullPercentage: 0,
      },
      {
        name: 'SOURCE_ID',
        type: 'INTEGER',
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        foreignKeyTarget: 'DATA_SOURCES.ID',
        description: 'Foreign key referencing data_sources table',
        sampleValues: [ds.source_id],
        distinctCount: 1,
        nullPercentage: 0,
      },
      {
        name: 'DATABASE_NAME',
        type: 'VARCHAR(255)',
        nullable: true,
        isPrimaryKey: false,
        description: 'Target database name in Snowflake / Warehouse',
        sampleValues: [dbName],
        distinctCount: 1,
        nullPercentage: 0,
      },
      {
        name: 'SCHEMA_NAME',
        type: 'VARCHAR(255)',
        nullable: true,
        isPrimaryKey: false,
        description: 'Target schema name in Snowflake / Warehouse',
        sampleValues: [schemaName],
        distinctCount: 1,
        nullPercentage: 0,
      },
      {
        name: 'TABLE_NAME',
        type: 'VARCHAR(255)',
        nullable: true,
        isPrimaryKey: false,
        description: 'Target table name in Snowflake / Warehouse',
        sampleValues: [tableName],
        distinctCount: 1,
        nullPercentage: 0,
      },
      {
        name: 'CREATED_AT',
        type: 'TIMESTAMP',
        nullable: true,
        isPrimaryKey: false,
        description: 'Record creation timestamp',
        sampleValues: [ds.created_at],
        distinctCount: 1,
        nullPercentage: 0,
      },
    ],
    ddl: `CREATE TABLE ${dbName}.${schemaName}.${tableName} (\n  id INTEGER PRIMARY KEY,\n  source_id INTEGER REFERENCES data_sources(id),\n  database_name VARCHAR(255),\n  schema_name VARCHAR(255),\n  table_name VARCHAR(255),\n  created_at TIMESTAMP\n);`,
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
   * GET http://127.0.0.1:8000/api/datasets/
   */
  async getAll(): Promise<BackendDataset[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/datasets/`);
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
   * Get the catalog hierarchy constructed from real backend datasets.
   */
  async getHierarchy(): Promise<CatalogDatabase[]> {
    const datasets = await this.getAll();
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
   * Simulates execution of an explorer query.
   */
  async executeQuery(req: QueryExecutionRequest): Promise<QueryExecutionResponse> {
    try {
      const datasets = await this.getAll();
      const match = datasets.find(
        (ds) => ds.table_name.toLowerCase() === req.table.toLowerCase()
      ) || datasets[0];

      const rows = match
        ? [
            {
              ID: match.id,
              SOURCE_ID: match.source_id,
              DATABASE_NAME: match.database_name,
              SCHEMA_NAME: match.schema_name,
              TABLE_NAME: match.table_name,
              CREATED_AT: match.created_at,
            },
          ]
        : [];

      const cols = rows.length > 0 ? Object.keys(rows[0]) : ['ID', 'SOURCE_ID', 'DATABASE_NAME', 'SCHEMA_NAME', 'TABLE_NAME', 'CREATED_AT'];

      return {
        columns: cols,
        rows,
        totalCount: rows.length,
        executionTimeMs: 45,
        bytesScanned: 'PostgreSQL Datasets Table',
        cachedFromRedis: false,
        snowflakeQueryId: `pg-ds-${match ? match.id : 0}`,
      };
    } catch {
      return {
        columns: ['ID', 'SOURCE_ID', 'DATABASE_NAME', 'SCHEMA_NAME', 'TABLE_NAME', 'CREATED_AT'],
        rows: [],
        totalCount: 0,
        executionTimeMs: 0,
        bytesScanned: '0 B',
        cachedFromRedis: false,
        snowflakeQueryId: 'pg-ds-err',
      };
    }
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
