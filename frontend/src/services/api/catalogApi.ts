import { CatalogDatabase, CatalogTable } from '../../types';
import {
  MOCK_CATALOG_HIERARCHY,
  MOCK_SAMPLE_DATA_ORDER_FACT,
  MOCK_TABLE_ORDER_FACT,
  MOCK_TABLE_CUSTOMER_DIM,
  MOCK_TABLE_PRODUCT_DIM,
  MOCK_TABLE_CAMPAIGN_PERF,
} from '../../constants/mockData';

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

export const catalogApi = {
  async getHierarchy(): Promise<CatalogDatabase[]> {
    // Simulates GET /api/v1/catalog/hierarchy
    await new Promise((resolve) => setTimeout(resolve, 300));
    return MOCK_CATALOG_HIERARCHY;
  },

  async getTableById(tableId: string): Promise<CatalogTable | null> {
    // Simulates GET /api/v1/catalog/tables/{tableId}
    await new Promise((resolve) => setTimeout(resolve, 200));

    if (tableId.includes('customer_dim') || tableId.includes('account')) {
      return MOCK_TABLE_CUSTOMER_DIM;
    }
    if (tableId.includes('product')) {
      return MOCK_TABLE_PRODUCT_DIM;
    }
    if (tableId.includes('campaign')) {
      return MOCK_TABLE_CAMPAIGN_PERF;
    }
    return MOCK_TABLE_ORDER_FACT;
  },

  async getSampleData(tableId: string, limit = 50): Promise<Record<string, any>[]> {
    // Simulates GET /api/v1/catalog/tables/{tableId}/sample-data
    await new Promise((resolve) => setTimeout(resolve, 350));
    return MOCK_SAMPLE_DATA_ORDER_FACT.slice(0, limit);
  },

  async executeQuery(req: QueryExecutionRequest): Promise<QueryExecutionResponse> {
    // Simulates POST /api/v1/explorer/query
    await new Promise((resolve) => setTimeout(resolve, 450));

    let rows = [...MOCK_SAMPLE_DATA_ORDER_FACT];

    // Optional client-simulated sorting/filtering for explorer grid
    if (req.sortColumn) {
      rows.sort((a, b) => {
        const valA = a[req.sortColumn!];
        const valB = b[req.sortColumn!];
        if (valA < valB) return req.sortDirection === 'DESC' ? 1 : -1;
        if (valA > valB) return req.sortDirection === 'DESC' ? -1 : 1;
        return 0;
      });
    }

    const cols = Object.keys(rows[0] || {});

    return {
      columns: cols,
      rows: rows.slice(req.offset || 0, (req.offset || 0) + (req.limit || 50)),
      totalCount: rows.length,
      executionTimeMs: 142,
      bytesScanned: '2.4 MB (Compressed Snowflake Micro-partitions)',
      cachedFromRedis: true,
      snowflakeQueryId: `01b92a48-0002-3c81-${Math.floor(Math.random() * 900000 + 100000)}`,
    };
  },

  async searchCatalog(query: string): Promise<Array<{ type: 'table' | 'schema' | 'column'; name: string; path: string; description: string; source: string }>> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const q = query.toLowerCase();
    const results = [
      {
        type: 'table' as const,
        name: 'ORDER_FACT',
        path: 'RETAIL_ANALYTICS.SALES.ORDER_FACT',
        description: 'Core transactional order metrics and line totals',
        source: 'Sales & Revenue Warehouse (Snowflake)',
      },
      {
        type: 'table' as const,
        name: 'CUSTOMER_DIM',
        path: 'RETAIL_ANALYTICS.CUSTOMERS.CUSTOMER_DIM',
        description: 'Dimensional customer master profile with LTV',
        source: 'Sales & Revenue Warehouse (Snowflake)',
      },
      {
        type: 'table' as const,
        name: 'PRODUCT_DIM',
        path: 'RETAIL_ANALYTICS.PRODUCTS.PRODUCT_DIM',
        description: 'Merchandise item master, SKU, and unit costs',
        source: 'Sales & Revenue Warehouse (Snowflake)',
      },
      {
        type: 'column' as const,
        name: 'CUSTOMER_ID',
        path: 'RETAIL_ANALYTICS.SALES.ORDER_FACT.CUSTOMER_ID',
        description: 'Foreign key surrogate connecting orders to customer profiles',
        source: 'Sales & Revenue Warehouse (Snowflake)',
      },
      {
        type: 'schema' as const,
        name: 'SALES',
        path: 'RETAIL_ANALYTICS.SALES',
        description: 'Transactional revenue and checkout domain',
        source: 'Sales & Revenue Warehouse (Snowflake)',
      },
    ];

    if (!q) return results;
    return results.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.path.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q)
    );
  },
};
