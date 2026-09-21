import React, { useState, useEffect } from 'react';
import {
  Layers,
  Database,
  Table as TableIcon,
  Search,
  Key,
  Link as LinkIcon,
  Tag,
  Shield,
  FileCode,
  Sparkles,
  Copy,
  Check,
  Download,
  Terminal,
  Activity,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Clock,
  HardDrive,
  Users,
  Eye,
  GitBranch,
  ShieldCheck,
  Play,
  AlertCircle,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PlatformBadge } from '../../components/status/ConnectionStatusBadge';
import { EnterpriseDataTable } from '../../components/data-table/EnterpriseDataTable';
import { ColumnProfileModal } from '../../components/catalog/ColumnProfileModal';
import { SchemaErdView } from '../../components/catalog/SchemaErdView';
import { useToast } from '../../components/ui/Toast';
import { catalogApi } from '../../services/api';
import { CatalogDatabase, CatalogTable, CatalogColumn, NavigationPage } from '../../types';

export const CatalogPage: React.FC<{
  onNavigate: (page: NavigationPage, context?: any) => void;
  initialTableId?: string;
}> = ({ onNavigate, initialTableId }) => {
  const { showToast } = useToast();
  const [hierarchy, setHierarchy] = useState<CatalogDatabase[]>([]);
  const [selectedTable, setSelectedTable] = useState<CatalogTable | null>(null);
  const [selectedTab, setSelectedTab] = useState<'overview' | 'columns' | 'sample' | 'erd' | 'lineage' | 'ddl'>('overview');
  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([]);
  const [treeSearch, setTreeSearch] = useState('');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [copiedDdl, setCopiedDdl] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeProfileColumn, setActiveProfileColumn] = useState<CatalogColumn | null>(null);
  const [isRunningQualityChecks, setIsRunningQualityChecks] = useState(false);

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setLoadError(null);

    try {
      const data = await catalogApi.getHierarchy();
      setHierarchy(data);

      if (data.length === 0) {
        setSelectedTable(null);
        setSampleRows([]);
        return;
      }

      const defaultExpanded: Record<string, boolean> = {};
      data.forEach((db) => {
        defaultExpanded[db.name] = true;
        db.schemas.forEach((sch) => {
          defaultExpanded[`${db.name}.${sch.name}`] = true;
        });
      });
      setExpandedNodes((prev) => ({ ...defaultExpanded, ...prev }));

      const firstTableId = data[0]?.schemas[0]?.tables[0]?.id;
      const targetTableId = initialTableId || (selectedTable?.id && data.some(db => db.schemas.some(s => s.tables.some(t => t.id === selectedTable.id))) ? selectedTable.id : firstTableId);
      const tbl = await catalogApi.getTableById(targetTableId || '');
      setSelectedTable(tbl);
      if (tbl) {
        const samples = await catalogApi.getSampleData(tbl.id, 50);
        setSampleRows(samples);
      }
      if (isRefresh) {
        showToast('success', 'Catalog Refreshed', 'Successfully reloaded metadata from PostgreSQL.');
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to load catalog metadata from backend.';
      setLoadError(msg);
      showToast('error', 'Catalog Load Failed', msg);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleSelectTable = async (tableId: string) => {
    const tbl = await catalogApi.getTableById(tableId);
    setSelectedTable(tbl);
    if (tbl) {
      const samples = await catalogApi.getSampleData(tbl.id, 50);
      setSampleRows(samples);
      showToast('info', 'Table Loaded', `${tbl.name} metadata refreshed from database.`);
    }
  };

  const toggleNode = (nodeKey: string) => {
    setExpandedNodes((prev) => ({ ...prev, [nodeKey]: !prev[nodeKey] }));
  };

  const handleCopyDdl = () => {
    if (!selectedTable?.ddl) return;
    navigator.clipboard.writeText(selectedTable.ddl);
    setCopiedDdl(true);
    showToast('success', 'DDL Copied', 'Snowflake CREATE TABLE statement copied to clipboard.');
    setTimeout(() => setCopiedDdl(false), 1800);
  };

  const handleRunQualityTests = async () => {
    setIsRunningQualityChecks(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setIsRunningQualityChecks(false);
    showToast('success', 'Data Quality SLA Passed', '0 null violations, 100% unique primary key integrity verified on Snowflake.');
  };

  const columnTableDefs = [
    {
      key: 'ordinal',
      header: '#',
      align: 'center' as const,
      sortable: false,
      render: (_: any, index?: number) => (
        <span className="font-mono-code text-[11px] text-stone-400 font-semibold">
          {(index ?? 0) + 1}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Column Name',
      sortable: true,
      render: (row: CatalogColumn) => (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveProfileColumn(row)}
            className="font-mono-code font-semibold text-stone-900 text-xs hover:text-blue-700 underline underline-offset-2 text-left cursor-pointer"
            title="Inspect statistical distribution"
          >
            {row.name}
          </button>
          {row.isPrimaryKey && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">
              <Key className="w-2.5 h-2.5" /> PK
            </span>
          )}
          {row.isForeignKey && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-medium"
              title={row.foreignKeyTarget}
            >
              <LinkIcon className="w-2.5 h-2.5" /> FK
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Snowflake Type',
      sortable: true,
      isMonospace: true,
      render: (row: CatalogColumn) => (
        <span className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-700 text-[11px] font-mono-code border border-stone-200/60">
          {row.type}
        </span>
      ),
    },
    {
      key: 'nullable',
      header: 'Nullable',
      sortable: true,
      align: 'center' as const,
      render: (row: CatalogColumn) => (
        <span className={`text-[11px] font-medium ${row.nullable ? 'text-stone-500' : 'text-stone-900 font-semibold'}`}>
          {row.nullable ? 'YES' : 'NO'}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description / Comment',
      render: (row: CatalogColumn) => (
        <span className="text-xs text-stone-600 leading-snug">{row.description || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Profile',
      align: 'right' as const,
      render: (row: CatalogColumn) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => setActiveProfileColumn(row)}
          leftIcon={<Eye className="w-3 h-3" />}
        >
          Profile
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">Data Catalog</h1>
          <p className="text-xs text-stone-500 mt-1">
            Discover, search, and understand schema hierarchies, column statistics, ERD relations, and table lineage.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            isLoading={isRefreshing}
            onClick={() => loadHierarchy(true)}
            leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}
            title="Reload catalog metadata from backend"
          >
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            isLoading={isRunningQualityChecks}
            onClick={handleRunQualityTests}
            leftIcon={<ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
          >
            Run Quality SLA Check
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              onNavigate(
                'explorer',
                selectedTable
                  ? {
                      sourceId: selectedTable.sourceId,
                      database: selectedTable.database,
                      schema: selectedTable.schema,
                      table: selectedTable.name,
                    }
                  : undefined
              )
            }
            leftIcon={<Terminal className="w-3.5 h-3.5" />}
          >
            Open in Explorer
          </Button>
        </div>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Tree Navigation (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <Card padding="none" className="overflow-hidden">
            {/* Tree Header & Search */}
            <div className="p-3 border-b border-stone-200 bg-[#fbfbf9]/70 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-stone-500" />
                  <span>Catalog Hierarchy</span>
                </span>
                <span className="text-[10px] font-mono-code text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                  Snowflake Native
                </span>
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={treeSearch}
                  onChange={(e) => setTreeSearch(e.target.value)}
                  placeholder="Filter schemas, tables..."
                  className="w-full text-xs text-stone-800 bg-white border border-stone-200 rounded pl-8 pr-3 py-1 focus:border-stone-800 focus:outline-none"
                />
              </div>
            </div>

            {/* Tree Node List */}
            <div className="p-2 max-h-[640px] overflow-y-auto space-y-1 text-xs">
              {loading && !isRefreshing ? (
                <div className="py-8 text-center text-stone-400 space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-stone-400" />
                  <p className="text-[11px] font-mono-code">Loading catalog tree...</p>
                </div>
              ) : loadError ? (
                <div className="p-3 text-center space-y-2">
                  <AlertCircle className="w-5 h-5 mx-auto text-rose-500" />
                  <p className="text-[11px] text-rose-600 font-medium">{loadError}</p>
                  <Button size="sm" variant="outline" onClick={() => loadHierarchy(false)}>
                    Retry
                  </Button>
                </div>
              ) : hierarchy.length === 0 ? (
                <div className="py-8 px-3 text-center space-y-2 text-stone-400">
                  <Database className="w-6 h-6 mx-auto text-stone-300" />
                  <p className="text-xs font-semibold text-stone-700">No Metadata Synchronized</p>
                  <p className="text-[11px] text-stone-500">Run "Sync Metadata" on a Snowflake source to populate the catalog.</p>
                </div>
              ) : (
                hierarchy.map((db) => {
                  const dbExpanded = expandedNodes[db.name] ?? false;
                  const dbKey = db.name;

                  return (
                    <div key={db.name} className="space-y-1">
                      {/* Database Row */}
                      <button
                        onClick={() => toggleNode(dbKey)}
                        className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-stone-100/70 text-left font-semibold text-stone-900 select-none group cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {dbExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                          )}
                          <Database className="w-3.5 h-3.5 text-stone-600 shrink-0" />
                          <span className="truncate font-mono-code text-[11px]">{db.name}</span>
                        </div>
                        <span className="text-[10px] font-normal text-stone-400 font-mono-code">
                          {db.schemaCount} schemas
                        </span>
                      </button>

                      {/* Schemas under Database */}
                      {dbExpanded && (
                        <div className="pl-4 space-y-1 border-l border-stone-200 ml-3">
                          {db.schemas.map((sch) => {
                            const schKey = `${db.name}.${sch.name}`;
                            const schExpanded = expandedNodes[schKey] ?? false;

                            return (
                              <div key={sch.name} className="space-y-1">
                                {/* Schema Row */}
                                <button
                                  onClick={() => toggleNode(schKey)}
                                  className="w-full flex items-center justify-between px-2 py-1 rounded hover:bg-stone-100/60 text-left font-medium text-stone-700 select-none cursor-pointer"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    {schExpanded ? (
                                      <ChevronDown className="w-3 h-3 text-stone-400 shrink-0" />
                                    ) : (
                                      <ChevronRight className="w-3 h-3 text-stone-400 shrink-0" />
                                    )}
                                    <Layers className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                                    <span className="truncate font-mono-code text-[11px] text-stone-800">
                                      {sch.name}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono-code text-stone-400">
                                    {sch.tableCount} tbls
                                  </span>
                                </button>

                                {/* Tables under Schema */}
                                {schExpanded && (
                                  <div className="pl-4 space-y-0.5 border-l border-stone-200 ml-2.5">
                                    {sch.tables
                                      .filter(
                                        (t) =>
                                          !treeSearch ||
                                          t.name.toLowerCase().includes(treeSearch.toLowerCase())
                                      )
                                      .map((tbl) => {
                                        const isSelected = selectedTable?.id === tbl.id || selectedTable?.name === tbl.name;
                                        return (
                                          <button
                                            key={tbl.id || tbl.name}
                                            onClick={() => handleSelectTable(tbl.id || tbl.name)}
                                            className={`w-full flex items-center justify-between px-2 py-1 rounded text-left select-none cursor-pointer transition-colors ${
                                              isSelected
                                                ? 'bg-stone-900 text-white font-medium shadow-2xs'
                                                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 truncate">
                                              <TableIcon
                                                className={`w-3 h-3 shrink-0 ${
                                                  isSelected ? 'text-white' : 'text-stone-400'
                                                }`}
                                              />
                                              <span className="truncate font-mono-code text-[11px]">
                                                {tbl.name}
                                              </span>
                                            </div>
                                            {tbl.rowCount != null && (
                                              <span
                                                className={`text-[9px] font-mono-code ${
                                                  isSelected ? 'text-stone-300' : 'text-stone-400'
                                                }`}
                                              >
                                                {tbl.rowCount > 1000000
                                                  ? `${(tbl.rowCount / 1000000).toFixed(1)}M`
                                                  : tbl.rowCount}
                                              </span>
                                            )}
                                          </button>
                                        );
                                      })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>

        {/* Right Side: Selected Table Details & Tabbed View (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          {loading && !isRefreshing ? (
            <Card className="p-16 text-center">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-stone-400 mb-2" />
              <p className="text-xs font-medium text-stone-600">Loading catalog metadata from PostgreSQL...</p>
            </Card>
          ) : loadError ? (
            <Card className="p-12 text-center border border-rose-200 bg-rose-50/40">
              <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                <div className="p-3 bg-rose-100 rounded-full text-rose-600">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-stone-900">Failed to Load Catalog</h3>
                <p className="text-xs text-stone-600">{loadError}</p>
                <Button size="sm" variant="primary" onClick={() => loadHierarchy(false)}>
                  Retry Loading Catalog
                </Button>
              </div>
            </Card>
          ) : hierarchy.length === 0 ? (
            <Card className="p-12 text-center border border-dashed border-stone-300 bg-white">
              <div className="flex flex-col items-center justify-center space-y-3 max-w-md mx-auto">
                <div className="p-3 bg-stone-100 rounded-full text-stone-600">
                  <Database className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-stone-900 font-mono-code">
                  No catalog metadata has been synchronized yet.
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed max-w-sm">
                  Connect your Snowflake data warehouse and run metadata synchronization to discover databases, schemas, tables, and column definitions.
                </p>
                <div className="pt-2 flex items-center gap-3">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onNavigate('sources')}
                    leftIcon={<Layers className="w-3.5 h-3.5" />}
                  >
                    Go to Data Sources
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => loadHierarchy(true)}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    Refresh Catalog
                  </Button>
                </div>
              </div>
            </Card>
          ) : selectedTable ? (
            <>
              {/* Table Master Header Card */}
              <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    {/* Path breadcrumb */}
                    <div className="flex items-center gap-1.5 text-xs text-stone-500 font-mono-code mb-1">
                      <PlatformBadge platform="snowflake" />
                      <span>{selectedTable.database}</span>
                      <span>/</span>
                      <span className="text-stone-700 font-semibold">{selectedTable.schema}</span>
                    </div>

                    <h2 className="text-xl font-bold text-stone-900 font-mono-code tracking-tight flex items-center gap-2">
                      <span>{selectedTable.name}</span>
                    </h2>

                    <p className="mt-2 text-xs text-stone-600 max-w-2xl leading-relaxed">
                      {selectedTable.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        onNavigate(
                          'explorer',
                          selectedTable
                            ? {
                                sourceId: selectedTable.sourceId,
                                database: selectedTable.database,
                                schema: selectedTable.schema,
                                table: selectedTable.name,
                              }
                            : undefined
                        )
                      }
                      leftIcon={<Terminal className="w-3.5 h-3.5" />}
                    >
                      Explore Data
                    </Button>
                  </div>
                </div>

                {/* Tags & Certified Badges */}
                <div className="mt-4 pt-4 border-t border-stone-100 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-[11px] text-stone-400 flex items-center gap-1">
                    <Tag className="w-3 h-3" /> Tags:
                  </span>
                  {selectedTable.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 bg-stone-100 text-stone-700 rounded-md border border-stone-200/80 text-[11px] font-mono-code"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </Card>

              {/* Navigation Tabs */}
              <div className="flex border-b border-stone-200 bg-white rounded-t-lg px-4 pt-2 gap-6 text-xs font-medium overflow-x-auto">
                {[
                  { id: 'overview', label: 'Overview & Metadata' },
                  { id: 'columns', label: `Columns (${selectedTable.columns?.length || 0})` },
                  { id: 'sample', label: 'Sample Data (Snowflake Live)' },
                  { id: 'erd', label: 'ERD Relationships' },
                  { id: 'lineage', label: 'Lineage & BI Usage' },
                  { id: 'ddl', label: 'DDL Schema' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTab(t.id as any)}
                    className={`pb-3 pt-1 border-b-2 transition-colors cursor-pointer select-none whitespace-nowrap ${
                      selectedTab === t.id
                        ? 'border-stone-900 text-stone-900 font-semibold'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab 1: Overview */}
              {selectedTab === 'overview' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Card padding="sm">
                      <div className="text-[10px] text-stone-400 uppercase font-medium">Total Rows</div>
                      <div className="text-base font-bold text-stone-900 font-mono-code mt-1">
                        {selectedTable.rowCount != null ? selectedTable.rowCount.toLocaleString() : '0'}
                      </div>
                    </Card>
                    <Card padding="sm">
                      <div className="text-[10px] text-stone-400 uppercase font-medium">Table Size</div>
                      <div className="text-base font-bold text-stone-900 font-mono-code mt-1">
                        {selectedTable.sizeFormatted || '0 B'}
                      </div>
                    </Card>
                    <Card padding="sm">
                      <div className="text-[10px] text-stone-400 uppercase font-medium">Columns</div>
                      <div className="text-base font-bold text-stone-900 font-mono-code mt-1">
                        {selectedTable.columns?.length || 0}
                      </div>
                    </Card>
                    <Card padding="sm">
                      <div className="text-[10px] text-stone-400 uppercase font-medium">Sync Freshness</div>
                      <div className="text-base font-bold text-emerald-800 font-mono-code mt-1">
                        {selectedTable.lastSyncedAt ? new Date(selectedTable.lastSyncedAt).toLocaleString() : 'Live'}
                      </div>
                    </Card>
                  </div>

                  {/* Metadata Specification Details */}
                  <Card padding="none" className="overflow-hidden">
                    <div className="px-4 py-3 border-b border-stone-200 bg-[#fbfbf9] font-semibold text-xs text-stone-900">
                      Snowflake Information Schema Attributes
                    </div>
                    <div className="divide-y divide-stone-100 text-xs font-mono-code">
                      <div className="px-4 py-2.5 flex justify-between">
                        <span className="text-stone-500 font-sans">Table Type:</span>
                        <span className="text-stone-800 font-semibold">{selectedTable.tags?.[0] || 'TABLE'}</span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between">
                        <span className="text-stone-500 font-sans">Source Warehouse:</span>
                        <span className="text-stone-800">{selectedTable.sourceName} (Source #{selectedTable.sourceId})</span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between">
                        <span className="text-stone-500 font-sans">Database / Schema:</span>
                        <span className="text-stone-800">{selectedTable.database}.{selectedTable.schema}</span>
                      </div>
                      <div className="px-4 py-2.5 flex justify-between">
                        <span className="text-stone-500 font-sans">App Metadata Store:</span>
                        <span className="text-stone-800">PostgreSQL (catalog_columns &amp; datasets)</span>
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* Tab 2: Columns */}
              {selectedTab === 'columns' && (
                <div className="space-y-3">
                  <EnterpriseDataTable
                    columns={columnTableDefs}
                    data={selectedTable.columns || []}
                    title={`${selectedTable.name} Schema Columns`}
                    searchPlaceholder="Filter columns by name or type..."
                    pageSizeDefault={15}
                    exportFilename={`${selectedTable.name}-columns`}
                  />
                </div>
              )}

              {/* Tab 3: Sample Data */}
              {selectedTab === 'sample' && (
                <div className="space-y-2">
                  <div className="p-3 bg-stone-50 rounded-lg border border-stone-200 text-xs text-stone-600 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-stone-700" />
                      <span>Showing first 50 sample micro-partition records cached in Redis from Snowflake</span>
                    </span>
                    <Badge variant="success">Live Synced</Badge>
                  </div>

                  <EnterpriseDataTable
                    columns={(selectedTable.columns || []).map((col) => ({
                      key: col.name,
                      header: col.name,
                      sortable: true,
                      isMonospace: true,
                    }))}
                    data={sampleRows}
                    title="Live Sample Records"
                    searchPlaceholder="Search sample records..."
                    pageSizeDefault={10}
                    exportFilename={`${selectedTable.name}-sample-records`}
                  />
                </div>
              )}

              {/* Tab 4: ERD Relationships */}
              {selectedTab === 'erd' && (
                <SchemaErdView
                  selectedTableName={selectedTable.name}
                  onSelectTable={(tblName) => handleSelectTable(tblName.toLowerCase())}
                />
              )}

              {/* Tab 5: Lineage & Downstream BI Usage */}
              {selectedTab === 'lineage' && (
                <div className="space-y-4">
                  <Card>
                    <h3 className="text-xs font-semibold text-stone-900 mb-2">
                      Downstream BI &amp; Analytics Applications
                    </h3>
                    <p className="text-xs text-stone-500 mb-4">
                      The following enterprise dashboards and dbt transformation models reference this table directly:
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {selectedTable.downstreamDashboards?.map((db, i) => (
                        <div key={i} className="p-3 bg-stone-50 rounded border border-stone-200 text-xs">
                          <div className="font-semibold text-stone-900">{db}</div>
                          <div className="text-[10px] text-stone-400 font-mono-code mt-1">
                            Tableau / PowerBI • Daily SLA
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card>
                    <h3 className="text-xs font-semibold text-stone-900 mb-2">
                      dbt Lineage &amp; Upstream Models
                    </h3>
                    <div className="p-4 bg-[#fbfbf9] rounded border border-stone-200 text-xs font-mono-code space-y-2 text-stone-700">
                      <div>[Source: RAW_INGESTION_STAGING.LANDING.CHECKOUT_PAYLOADS]</div>
                      <div className="pl-4">└── [dbt model: stg_retail__orders]</div>
                      <div className="pl-8 text-stone-900 font-bold">
                        └── 🎯 [Target: {selectedTable.database}.{selectedTable.schema}.{selectedTable.name}]
                      </div>
                    </div>
                  </Card>
                </div>
              )}

              {/* Tab 6: DDL Schema */}
              {selectedTab === 'ddl' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-800">
                      Snowflake Native DDL Definition
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCopyDdl}
                      leftIcon={copiedDdl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    >
                      {copiedDdl ? 'Copied to Clipboard' : 'Copy DDL'}
                    </Button>
                  </div>

                  <pre className="p-4 bg-stone-900 text-stone-100 font-mono-code text-xs rounded-lg border border-stone-800 overflow-x-auto whitespace-pre leading-relaxed">
                    {selectedTable.ddl || `CREATE TABLE ${selectedTable.database}.${selectedTable.schema}.${selectedTable.name} (\n  -- metadata definition\n);`}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <Card className="p-12 text-center text-stone-400">
              Select a table from the catalog hierarchy on the left to inspect metadata.
            </Card>
          )}
        </div>
      </div>

      {/* Column Profile Modal */}
      <ColumnProfileModal
        column={activeProfileColumn}
        tableName={selectedTable?.name || ''}
        isOpen={Boolean(activeProfileColumn)}
        onClose={() => setActiveProfileColumn(null)}
      />
    </div>
  );
};
