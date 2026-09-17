import React, { useState, useEffect, useMemo } from 'react';
import {
  Play,
  Copy,
  Check,
  RefreshCw,
  Sliders,
  Database,
  Code2,
  Key,
  AlertCircle,
  ShieldAlert,
  Info,
  Layers,
  Table as TableIcon,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select, Input } from '../../components/ui/Input';
import { EnterpriseDataTable } from '../../components/data-table/EnterpriseDataTable';
import {
  catalogApi,
  dataSourceApi,
  BackendDataset,
  QueryExecutionResponse,
} from '../../services/api';
import { NavigationPage, DataSource } from '../../types';

interface ExplorerPageProps {
  onNavigate: (page: NavigationPage) => void;
  initialContext?: {
    sourceId?: string | number;
    database?: string;
    schema?: string;
    table?: string;
  };
}

export const ExplorerPage: React.FC<ExplorerPageProps> = ({ onNavigate, initialContext }) => {
  // Real data state from backend
  const [sources, setSources] = useState<DataSource[]>([]);
  const [datasets, setDatasets] = useState<BackendDataset[]>([]);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(true);

  // Target selectors state
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [database, setDatabase] = useState<string>('');
  const [schema, setSchema] = useState<string>('');
  const [table, setTable] = useState<string>('');
  const [rowLimit, setRowLimit] = useState<number>(50);

  // Query editor state
  const [sqlQuery, setSqlQuery] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<QueryExecutionResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<boolean>(false);

  // Ephemeral Snowflake credentials (in-memory only for this browser session)
  const [isCredentialsModalOpen, setIsCredentialsModalOpen] = useState(false);
  const [credentials, setCredentials] = useState({
    accountIdentifier: '',
    warehouse: '',
    username: '',
    password: '',
    role: '',
  });

  // Load real sources and catalog datasets on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      setIsLoadingMetadata(true);
      try {
        const [loadedSources, loadedDatasets] = await Promise.all([
          dataSourceApi.getAll().catch(() => []),
          catalogApi.getAll().catch(() => []),
        ]);

        if (!isMounted) return;

        setSources(loadedSources);
        setDatasets(loadedDatasets);

        // Resolve initial selection
        let initSrcId = '';
        if (initialContext?.sourceId) {
          initSrcId = String(initialContext.sourceId);
        } else if (loadedSources.length > 0) {
          initSrcId = String(loadedSources[0].id);
        }

        setSelectedSourceId(initSrcId);

        // Filter datasets for this initial source
        const relevantDatasets = initSrcId
          ? loadedDatasets.filter((d) => String(d.source_id) === initSrcId)
          : loadedDatasets;

        const initDb =
          initialContext?.database ||
          (relevantDatasets.length > 0 ? relevantDatasets[0].database_name : 'RETAIL_ANALYTICS');
        const initSch =
          initialContext?.schema ||
          (relevantDatasets.length > 0 ? relevantDatasets[0].schema_name : 'SALES');
        const initTbl =
          initialContext?.table ||
          (relevantDatasets.length > 0 ? relevantDatasets[0].table_name : 'ORDER_FACT');

        setDatabase(initDb);
        setSchema(initSch);
        setTable(initTbl);

        const defaultPreviewSql = `SELECT *\nFROM "${initDb}"."${initSch}"."${initTbl}"\nLIMIT 50;`;
        setSqlQuery(defaultPreviewSql);
      } catch (err: any) {
        console.error('Failed to load initial catalog:', err);
      } finally {
        if (isMounted) setIsLoadingMetadata(false);
      }
    }

    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, [initialContext]);

  // Available databases for the currently selected source
  const availableDatabases = useMemo(() => {
    const filtered = selectedSourceId
      ? datasets.filter((d) => String(d.source_id) === selectedSourceId)
      : datasets;
    const dbs = Array.from(new Set(filtered.map((d) => d.database_name))).filter(Boolean);
    return dbs.length > 0 ? dbs : ['RETAIL_ANALYTICS', 'CUSTOMER_DATA_HUB', 'MARKETING_ATTRIBUTION'];
  }, [datasets, selectedSourceId]);

  // Available schemas for the selected source & database
  const availableSchemas = useMemo(() => {
    const filtered = datasets.filter((d) => {
      const matchSource = !selectedSourceId || String(d.source_id) === selectedSourceId;
      const matchDb = !database || d.database_name.toLowerCase() === database.toLowerCase();
      return matchSource && matchDb;
    });
    const schemas = Array.from(new Set(filtered.map((d) => d.schema_name))).filter(Boolean);
    return schemas.length > 0 ? schemas : ['SALES', 'CUSTOMERS', 'PRODUCTS', 'PUBLIC'];
  }, [datasets, selectedSourceId, database]);

  // Available tables for the selected source, database & schema
  const availableTables = useMemo(() => {
    const filtered = datasets.filter((d) => {
      const matchSource = !selectedSourceId || String(d.source_id) === selectedSourceId;
      const matchDb = !database || d.database_name.toLowerCase() === database.toLowerCase();
      const matchSchema = !schema || d.schema_name.toLowerCase() === schema.toLowerCase();
      return matchSource && matchDb && matchSchema;
    });
    const tbls = Array.from(new Set(filtered.map((d) => d.table_name))).filter(Boolean);
    return tbls.length > 0 ? tbls : ['ORDER_FACT', 'CUSTOMER_DIM', 'PRODUCT_DIM', 'SALES_TRANSACTIONS'];
  }, [datasets, selectedSourceId, database, schema]);

  // When database changes, ensure schema and table update
  const handleDatabaseChange = (newDb: string) => {
    setDatabase(newDb);
    const validSchemas = Array.from(
      new Set<string>(
        datasets
          .filter(
            (d) =>
              (!selectedSourceId || String(d.source_id) === selectedSourceId) &&
              (d.database_name || '').toLowerCase() === newDb.toLowerCase()
          )
          .map((d) => d.schema_name)
      )
    );
    const newSchema = validSchemas[0] || 'PUBLIC';
    setSchema(newSchema);

    const validTables = datasets
      .filter(
        (d) =>
          (!selectedSourceId || String(d.source_id) === selectedSourceId) &&
          (d.database_name || '').toLowerCase() === newDb.toLowerCase() &&
          (d.schema_name || '').toLowerCase() === newSchema.toLowerCase()
      )
      .map((d) => d.table_name);
    const newTable = validTables[0] || 'ANALYTICS';
    setTable(newTable);
    setSqlQuery(`SELECT *\nFROM "${newDb}"."${newSchema}"."${newTable}"\nLIMIT ${rowLimit};`);
  };

  const handleSchemaChange = (newSchema: string) => {
    setSchema(newSchema);
    const validTables = datasets
      .filter(
        (d) =>
          (!selectedSourceId || String(d.source_id) === selectedSourceId) &&
          (d.database_name || '').toLowerCase() === database.toLowerCase() &&
          (d.schema_name || '').toLowerCase() === newSchema.toLowerCase()
      )
      .map((d) => d.table_name);
    const newTable = validTables[0] || 'ANALYTICS';
    setTable(newTable);
    setSqlQuery(`SELECT *\nFROM "${database}"."${newSchema}"."${newTable}"\nLIMIT ${rowLimit};`);
  };

  const handleTableChange = (newTable: string) => {
    setTable(newTable);
    setSqlQuery(`SELECT *\nFROM "${database}"."${schema}"."${newTable}"\nLIMIT ${rowLimit};`);
  };

  const handleRunQuery = async () => {
    setIsExecuting(true);
    setQueryError(null);
    try {
      const activeSourceId = selectedSourceId || (sources[0] ? String(sources[0].id) : '1');
      const res = await catalogApi.executeQuery({
        sourceId: activeSourceId,
        database: database || undefined,
        schema: schema || undefined,
        table: table || undefined,
        sqlQuery: sqlQuery.trim() || undefined,
        limit: rowLimit,
        accountIdentifier: credentials.accountIdentifier.trim() || undefined,
        username: credentials.username.trim() || undefined,
        password: credentials.password || undefined,
        warehouse: credentials.warehouse.trim() || undefined,
        role: credentials.role.trim() || undefined,
      });
      setQueryResult(res);
    } catch (err: any) {
      const errMsg = err?.message || 'Query execution failed.';
      setQueryError(errMsg);
      setQueryResult(null);
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
    setQueryError(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">Explorer</h1>
          <p className="text-xs text-stone-500 mt-1">
            Execute real read-only analytical queries directly on Snowflake Native with sub-millisecond Redis caching.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCredentialsModalOpen(true)}
            leftIcon={<Key className="w-3.5 h-3.5 text-stone-600" />}
          >
            {credentials.password ? 'Credentials Active' : 'Session Credentials'}
          </Button>
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
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <Select
            label="Data Source"
            value={selectedSourceId}
            onChange={(e) => {
              const srcId = e.target.value;
              setSelectedSourceId(srcId);
              const firstForSrc = datasets.find((d) => String(d.source_id) === srcId);
              if (firstForSrc) {
                setDatabase(firstForSrc.database_name);
                setSchema(firstForSrc.schema_name);
                setTable(firstForSrc.table_name);
                setSqlQuery(
                  `SELECT *\nFROM "${firstForSrc.database_name}"."${firstForSrc.schema_name}"."${firstForSrc.table_name}"\nLIMIT ${rowLimit};`
                );
              }
            }}
          >
            {sources.length > 0 ? (
              sources.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {s.name} ({s.source_type || 'Snowflake'})
                </option>
              ))
            ) : (
              <option value="1">Snowflake Warehouse (Primary)</option>
            )}
          </Select>

          <Select
            label="Database"
            value={database}
            onChange={(e) => handleDatabaseChange(e.target.value)}
          >
            {availableDatabases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))}
          </Select>

          <Select
            label="Schema"
            value={schema}
            onChange={(e) => handleSchemaChange(e.target.value)}
          >
            {availableSchemas.map((sch) => (
              <option key={sch} value={sch}>
                {sch}
              </option>
            ))}
          </Select>

          <Select
            label="Target Table"
            value={table}
            onChange={(e) => handleTableChange(e.target.value)}
          >
            {availableTables.map((tbl) => (
              <option key={tbl} value={tbl}>
                {tbl}
              </option>
            ))}
          </Select>

          <Select
            label="Row Limit"
            value={String(rowLimit)}
            onChange={(e) => {
              const lim = parseInt(e.target.value, 10) || 50;
              setRowLimit(lim);
              if (database && schema && table) {
                setSqlQuery(`SELECT *\nFROM "${database}"."${schema}"."${table}"\nLIMIT ${lim};`);
              }
            }}
          >
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="250">250 rows</option>
            <option value="500">500 rows</option>
            <option value="1000">1000 rows (Max)</option>
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
              Snowflake Read-Only Dialect (Max 1,000 Rows)
            </span>
          </div>

          {/* Quick Query Templates */}
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-[10px] text-stone-400 uppercase font-medium mr-1">Presets:</span>
            <button
              onClick={() =>
                handlePresetSelect(
                  database && schema && table
                    ? `SELECT *\nFROM "${database}"."${schema}"."${table}"\nLIMIT ${rowLimit};`
                    : `SELECT *\nFROM RETAIL_ANALYTICS.SALES.ORDER_FACT\nLIMIT 50;`
                )
              }
              className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors"
            >
              Table Preview
            </button>
            <button
              onClick={() =>
                handlePresetSelect(
                  `SELECT \n  PAYMENT_METHOD,\n  COUNT(*) AS TOTAL_ORDERS,\n  ROUND(SUM(TOTAL_AMOUNT), 2) AS GROSS_VOLUME_USD,\n  ROUND(AVG(TOTAL_AMOUNT), 2) AS AOV_USD\nFROM RETAIL_ANALYTICS.SALES.ORDER_FACT\nGROUP BY 1\nORDER BY GROSS_VOLUME_USD DESC\nLIMIT 50;`
                )
              }
              className="text-[11px] px-2 py-0.5 rounded bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 transition-colors"
            >
              Aggregate Breakdown
            </button>
          </div>
        </div>

        {/* Monospace Query Editor */}
        <textarea
          value={sqlQuery}
          onChange={(e) => {
            setSqlQuery(e.target.value);
            setQueryError(null);
          }}
          rows={7}
          spellCheck={false}
          className="w-full p-4 font-mono-code text-xs text-stone-900 bg-white resize-y focus:outline-none leading-relaxed border-none"
          placeholder="SELECT * FROM table LIMIT 100;"
        />

        {/* Error Notification Bar */}
        {queryError && (
          <div className="p-3 border-t border-rose-200 bg-rose-50/90 flex items-start gap-2.5 text-xs text-rose-900">
            <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Query Execution Error:</span> {queryError}
              {queryError.toLowerCase().includes('credential') && (
                <div className="mt-1">
                  <button
                    onClick={() => setIsCredentialsModalOpen(true)}
                    className="text-xs font-semibold text-rose-700 underline hover:text-rose-800"
                  >
                    Click here to provide ephemeral Snowflake credentials for this session.
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

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
                Snowflake Live
              </Badge>
            </div>
          </div>
        )}
      </Card>

      {/* Query Results Data Table or Empty State */}
      {queryResult ? (
        queryResult.rows.length > 0 ? (
          <EnterpriseDataTable
            columns={queryResult.columns.map((c) => ({
              key: c,
              header: c,
              sortable: true,
              isMonospace: true,
            }))}
            data={queryResult.rows}
            title="Query Results"
            subtitle={`Showing ${queryResult.rows.length} rows across ${queryResult.columns.length} columns`}
            searchPlaceholder="Search in result rows..."
            pageSizeDefault={10}
            exportFilename={`snowflake-${table.toLowerCase() || 'query-results'}`}
          />
        ) : (
          <Card padding="md" className="text-center py-10">
            <TableIcon className="w-8 h-8 text-stone-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-stone-700">0 rows returned</p>
            <p className="text-xs text-stone-500 mt-1">
              The query executed successfully on Snowflake, but no rows matched the criteria.
            </p>
          </Card>
        )
      ) : null}

      {/* Ephemeral Session Credentials Modal */}
      {isCredentialsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-stone-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-700" />
                <h3 className="text-base font-bold text-stone-900">Snowflake Session Credentials</h3>
              </div>
              <button
                onClick={() => setIsCredentialsModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-lg text-xs text-amber-800 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                Zero-Persistence Credential Security
              </div>
              <p>
                Credentials entered here are retained strictly in React in-memory state during your current session.
                They are never written to PostgreSQL or localStorage, and are never logged.
              </p>
            </div>

            <div className="space-y-3">
              <Input
                label="Account Identifier"
                placeholder="e.g. xy12345.us-east-1"
                value={credentials.accountIdentifier}
                onChange={(e) =>
                  setCredentials((prev) => ({ ...prev, accountIdentifier: e.target.value }))
                }
              />
              <Input
                label="Username"
                placeholder="e.g. DATA_ANALYST"
                value={credentials.username}
                onChange={(e) =>
                  setCredentials((prev) => ({ ...prev, username: e.target.value }))
                }
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••••••"
                value={credentials.password}
                onChange={(e) =>
                  setCredentials((prev) => ({ ...prev, password: e.target.value }))
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Warehouse"
                  placeholder="e.g. COMPUTE_WH"
                  value={credentials.warehouse}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, warehouse: e.target.value }))
                  }
                />
                <Input
                  label="Role (Optional)"
                  placeholder="e.g. ACCOUNTADMIN"
                  value={credentials.role}
                  onChange={(e) =>
                    setCredentials((prev) => ({ ...prev, role: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCredentials({
                    accountIdentifier: '',
                    warehouse: '',
                    username: '',
                    password: '',
                    role: '',
                  });
                  setIsCredentialsModalOpen(false);
                }}
              >
                Clear
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsCredentialsModalOpen(false)}
              >
                Save for Session
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
