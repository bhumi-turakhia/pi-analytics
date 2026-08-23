import React, { useState, useEffect } from 'react';
import {
  Terminal,
  Play,
  Download,
  Copy,
  Check,
  RefreshCw,
  Clock,
  Sparkles,
  Sliders,
  Database,
  Layers,
  Table as TableIcon,
  Code2,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Input';
import { EnterpriseDataTable } from '../../components/data-table/EnterpriseDataTable';
import { catalogApi, QueryExecutionResponse } from '../../services/api';
import { NavigationPage } from '../../types';

export const ExplorerPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = () => {
  const [source, setSource] = useState('Sales & Revenue Warehouse (Snowflake)');
  const [database, setDatabase] = useState('RETAIL_ANALYTICS');
  const [schema, setSchema] = useState('SALES');
  const [table, setTable] = useState('ORDER_FACT');

  const defaultSql = `SELECT 
    ORDER_ID,
    ORDER_NUMBER,
    CUSTOMER_ID,
    ORDER_TIMESTAMP,
    ORDER_STATUS,
    NET_AMOUNT,
    TAX_AMOUNT,
    TOTAL_AMOUNT,
    PAYMENT_METHOD
FROM RETAIL_ANALYTICS.SALES.ORDER_FACT
WHERE ORDER_STATUS = 'COMPLETED'
ORDER BY ORDER_TIMESTAMP DESC
LIMIT 50;`;

  const [sqlQuery, setSqlQuery] = useState(defaultSql);
  const [isExecuting, setIsExecuting] = useState(false);
  const [queryResult, setQueryResult] = useState<QueryExecutionResponse | null>(null);
  const [copiedQuery, setCopiedQuery] = useState(false);

  useEffect(() => {
    handleRunQuery();
  }, []);

  const handleRunQuery = async () => {
    setIsExecuting(true);
    try {
      const res = await catalogApi.executeQuery({
        sourceId: 'src_sf_prod_sales',
        database,
        schema,
        table,
        sqlQuery,
      });
      setQueryResult(res);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlQuery);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 1500);
  };

  const handlePresetSelect = (presetSql: string) => {
    setSqlQuery(presetSql);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">Explorer</h1>
          <p className="text-xs text-stone-500 mt-1">
            Execute analytical exploration queries directly on Snowflake Native with sub-millisecond Redis caching.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopySql}
            leftIcon={copiedQuery ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
          >
            {copiedQuery ? 'Copied' : 'Copy Query'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={isExecuting}
            onClick={handleRunQuery}
            leftIcon={<Play className="w-3.5 h-3.5 fill-current" />}
          >
            Execute (Ctrl + Enter)
          </Button>
        </div>
      </div>

      {/* Target Selector Ribbon */}
      <Card padding="sm" className="bg-white border-stone-200">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select
            label="Data Source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          >
            <option value="Sales & Revenue Warehouse (Snowflake)">Sales &amp; Revenue Warehouse (Snowflake)</option>
            <option value="Customer 360 Warehouse (Snowflake)">Customer 360 Warehouse (Snowflake)</option>
            <option value="Marketing Attribution Mart (Snowflake)">Marketing Attribution Mart (Snowflake)</option>
          </Select>

          <Select
            label="Database"
            value={database}
            onChange={(e) => setDatabase(e.target.value)}
          >
            <option value="RETAIL_ANALYTICS">RETAIL_ANALYTICS</option>
            <option value="CUSTOMER_DATA_HUB">CUSTOMER_DATA_HUB</option>
            <option value="MARKETING_ATTRIBUTION">MARKETING_ATTRIBUTION</option>
          </Select>

          <Select
            label="Schema"
            value={schema}
            onChange={(e) => setSchema(e.target.value)}
          >
            <option value="SALES">SALES</option>
            <option value="CUSTOMERS">CUSTOMERS</option>
            <option value="PRODUCTS">PRODUCTS</option>
          </Select>

          <Select
            label="Target Table"
            value={table}
            onChange={(e) => setTable(e.target.value)}
          >
            <option value="ORDER_FACT">ORDER_FACT</option>
            <option value="CUSTOMER_DIM">CUSTOMER_DIM</option>
            <option value="PRODUCT_DIM">PRODUCT_DIM</option>
            <option value="SALES_TRANSACTIONS">SALES_TRANSACTIONS</option>
          </Select>
        </div>
      </Card>

      {/* SQL Query Editor & Query Presets */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-2.5 border-b border-stone-200 bg-[#fbfbf9] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-stone-700 font-semibold">
            <Code2 className="w-3.5 h-3.5 text-stone-500" />
            <span>SQL Query Worksheet</span>
            <span className="text-[10px] text-stone-400 font-mono-code font-normal">
              Snowflake SQL Dialect
            </span>
          </div>

          {/* Quick Query Templates */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-stone-400 uppercase font-medium mr-1">Presets:</span>
            <button
              onClick={() => handlePresetSelect(defaultSql)}
              className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200"
            >
              Recent Completed Orders
            </button>
            <button
              onClick={() =>
                handlePresetSelect(
                  `SELECT \n  PAYMENT_METHOD,\n  COUNT(*) AS TOTAL_ORDERS,\n  ROUND(SUM(TOTAL_AMOUNT), 2) AS GROSS_VOLUME_USD,\n  ROUND(AVG(TOTAL_AMOUNT), 2) AS AOV_USD\nFROM RETAIL_ANALYTICS.SALES.ORDER_FACT\nGROUP BY 1\nORDER BY GROSS_VOLUME_USD DESC;`
                )
              }
              className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200"
            >
              Payment Method Breakdown
            </button>
          </div>
        </div>

        {/* Monospace Query Editor */}
        <textarea
          value={sqlQuery}
          onChange={(e) => setSqlQuery(e.target.value)}
          rows={7}
          spellCheck={false}
          className="w-full p-4 font-mono-code text-xs text-stone-900 bg-white resize-y focus:outline-none leading-relaxed border-none"
        />

        {/* Execution Diagnostics Bar */}
        {queryResult && (
          <div className="px-4 py-2 border-t border-stone-200 bg-[#fbfbf9] flex flex-wrap items-center justify-between text-[11px] text-stone-500 font-mono-code gap-3">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-emerald-800 font-semibold font-sans">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Query Succeeded
              </span>
              <span>{queryResult.executionTimeMs}ms execution</span>
              <span>{queryResult.rows.length} rows returned</span>
              <span className="hidden md:inline">{queryResult.bytesScanned}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-stone-400">ID: {queryResult.snowflakeQueryId}</span>
              <Badge variant="navy" size="xs">
                Redis Cached
              </Badge>
            </div>
          </div>
        )}
      </Card>

      {/* Query Results Data Table */}
      {queryResult && (
        <EnterpriseDataTable
          columns={queryResult.columns.map((c) => ({
            key: c,
            header: c,
            sortable: true,
            isMonospace: true,
          }))}
          data={queryResult.rows}
          title="Query Results"
          subtitle="Interactive dataset with instant filtering, sorting, and CSV export"
          searchPlaceholder="Search in result rows..."
          pageSizeDefault={10}
          exportFilename="pi-analytics-query-export"
        />
      )}
    </div>
  );
};
