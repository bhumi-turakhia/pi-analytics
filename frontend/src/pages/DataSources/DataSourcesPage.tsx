import React, { useState, useEffect } from 'react';
import {
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  Search,
  CheckCircle2,
  AlertCircle,
  Database,
  Table,
  Sparkles,
  Unlink,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConnectionStatusBadge, PlatformBadge } from '../../components/status/ConnectionStatusBadge';
import { AddDataSourceWizard } from './AddDataSourceWizard';
import { useToast } from '../../components/ui/Toast';
import { dataSourceApi, catalogApi, MetadataSyncPayload, TestConnectionResult } from '../../services/api';
import { DataSource, NavigationPage } from '../../types';

export interface DataSourcesPageProps {
  onNavigate: (page: NavigationPage, context?: any) => void;
  openWizardInitial?: boolean;
}

type StatusFilterType = 'all' | 'healthy' | 'disconnected' | 'snowflake' | 'salesforce';

export const DataSourcesPage: React.FC<DataSourcesPageProps> = ({
  onNavigate,
  openWizardInitial = false,
}) => {
  const { showToast } = useToast();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(openWizardInitial);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [sourceToDelete, setSourceToDelete] = useState<DataSource | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Metadata Sync Modal State
  const [sourceForMetadataSync, setSourceForMetadataSync] = useState<DataSource | null>(null);
  const [isMetadataSyncModalOpen, setIsMetadataSyncModalOpen] = useState(false);
  const [isSyncingMetadata, setIsSyncingMetadata] = useState(false);
  const [metadataSyncError, setMetadataSyncError] = useState<string | null>(null);
  const [metadataSyncSuccess, setMetadataSyncSuccess] = useState<string | null>(null);
  const [syncCredentials, setSyncCredentials] = useState<{
    accountIdentifier: string;
    warehouse: string;
    database: string;
    username: string;
    role: string;
    password: string;
  }>({
    accountIdentifier: '',
    warehouse: '',
    database: '',
    username: '',
    role: '',
    password: '',
  });

  // Ephemeral Connection Testing Modal State
  const [sourceForTest, setSourceForTest] = useState<DataSource | null>(null);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);
  const [testValidationError, setTestValidationError] = useState<string | null>(null);
  const [testCredentials, setTestCredentials] = useState<{
    accountIdentifier: string;
    warehouse: string;
    database: string;
    defaultSchema: string;
    username: string;
    role: string;
    password: string;
  }>({
    accountIdentifier: '',
    warehouse: '',
    database: '',
    defaultSchema: '',
    username: '',
    role: '',
    password: '',
  });

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await dataSourceApi.getAll();
      setSources(data);
    } finally {
      setLoading(false);
    }
  };

  const promptSyncMetadata = (source: DataSource, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSourceForMetadataSync(source);
    setMetadataSyncError(null);
    setMetadataSyncSuccess(null);
    setSyncCredentials({
      accountIdentifier: source.accountIdentifier || '',
      warehouse: source.warehouse || '',
      database: source.database || '',
      username: source.username || '',
      role: source.role || '',
      password: '',
    });
    setIsMetadataSyncModalOpen(true);
  };

  const handleExecuteMetadataSync = async () => {
    if (!sourceForMetadataSync) return;
    setIsSyncingMetadata(true);
    setMetadataSyncError(null);
    setMetadataSyncSuccess(null);

    try {
      const payload: MetadataSyncPayload = {
        account_identifier: syncCredentials.accountIdentifier.trim(),
        warehouse: syncCredentials.warehouse.trim(),
        database: syncCredentials.database.trim(),
        username: syncCredentials.username.trim(),
        role: syncCredentials.role.trim(),
        password: syncCredentials.password,
      };

      const result = await catalogApi.syncMetadata(sourceForMetadataSync.id, payload);

      if (result.success) {
        const msg = `Successfully discovered ${result.tables_discovered} tables and ${result.columns_discovered} columns across ${result.schemas_discovered} schemas.`;
        setMetadataSyncSuccess(msg);
        showToast('success', 'Metadata Synchronized', msg);
        // Clear sensitive credentials immediately from state
        setSyncCredentials((prev) => ({ ...prev, password: '' }));
        // Refresh sources to update table and schema counts
        await loadSources();
      } else {
        const errMsg = result.error || result.message || 'Metadata discovery failed.';
        setMetadataSyncError(errMsg);
        showToast('error', 'Metadata Sync Failed', errMsg);
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to communicate with metadata sync API.';
      setMetadataSyncError(errMsg);
      showToast('error', 'Sync Failed', errMsg);
    } finally {
      setIsSyncingMetadata(false);
    }
  };

  const promptTestConnection = (source: DataSource, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (source.platform !== 'snowflake') {
      showToast(
        'info',
        `${source.platform === 'salesforce' ? 'Salesforce' : source.platform} Testing Unsupported`,
        `Real connection testing for ${source.name} is scheduled for a future milestone.`
      );
      return;
    }

    setSourceForTest(source);
    setTestResult(null);
    setTestValidationError(null);
    setTestCredentials({
      accountIdentifier: source.accountIdentifier || '',
      warehouse: source.warehouse || '',
      database: source.database || '',
      defaultSchema: source.defaultSchema || '',
      username: source.username || '',
      role: source.role || '',
      password: '',
    });
    setIsTestModalOpen(true);
  };

  const closeTestModal = () => {
    if (!isTestingConnection) {
      setIsTestModalOpen(false);
      setSourceForTest(null);
      setTestResult(null);
      setTestValidationError(null);
      setTestCredentials({
        accountIdentifier: '',
        warehouse: '',
        database: '',
        defaultSchema: '',
        username: '',
        role: '',
        password: '',
      });
    }
  };

  const handleExecuteTestConnection = async () => {
    if (!sourceForTest) return;

    // Client-side validation: missing credentials produce a validation error rather than backend failure
    const missing: string[] = [];
    if (!testCredentials.accountIdentifier.trim()) missing.push('Account Identifier');
    if (!testCredentials.username.trim()) missing.push('Username');
    if (!testCredentials.password.trim()) missing.push('Password');

    if (missing.length > 0) {
      setTestValidationError(`Please supply required Snowflake credentials: ${missing.join(', ')}.`);
      return;
    }

    setIsTestingConnection(true);
    setTestValidationError(null);
    setTestResult(null);

    try {
      const result = await dataSourceApi.testConnection({
        id: sourceForTest.id,
        platform: 'snowflake',
        accountIdentifier: testCredentials.accountIdentifier.trim(),
        warehouse: testCredentials.warehouse.trim(),
        database: testCredentials.database.trim(),
        defaultSchema: testCredentials.defaultSchema.trim(),
        username: testCredentials.username.trim(),
        role: testCredentials.role.trim(),
        password: testCredentials.password,
      });

      setTestResult(result);

      if (result.success) {
        showToast(
          'success',
          'Connection Verified',
          `Live connection to ${sourceForTest.name} verified successfully (${result.latencyMs}ms).`
        );
      } else {
        showToast(
          'error',
          'Connection Test Failed',
          result.error || result.message
        );
      }
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to verify Snowflake connection.';
      setTestResult({
        success: false,
        latencyMs: 0,
        message: 'Connection failed.',
        error: errMsg,
      });
      showToast('error', 'Test Failed', errMsg);
    } finally {
      setIsTestingConnection(false);
      // Immediately clear sensitive password value from state
      setTestCredentials((prev) => ({ ...prev, password: '' }));
    }
  };

  const handleSyncNow = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSyncingId(id);
    try {
      const updated = await dataSourceApi.syncNow(id);
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)));
      showToast('success', 'Source Synchronized', 'Pipeline sync run completed successfully.');
    } catch (error: any) {
      showToast('error', 'Sync Failed', error?.message || 'Failed to sync data source.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async (source: DataSource, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDisconnectingId(source.id);
    try {
      await dataSourceApi.disconnect(source.id);
      setSources((prev) =>
        prev.map((s) => (s.id === source.id ? { ...s, status: 'disconnected' } : s))
      );
      showToast('success', 'Source Disconnected', `${source.name} marked as disconnected.`);
    } catch (error: any) {
      showToast('error', 'Disconnect Failed', error?.message || 'Failed to disconnect data source.');
    } finally {
      setDisconnectingId(null);
    }
  };

  const promptDelete = (source: DataSource, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSourceToDelete(source);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!sourceToDelete) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await dataSourceApi.delete(sourceToDelete.id);
      setSources((prev) => prev.filter((s) => s.id !== sourceToDelete.id));
      showToast('success', 'Source Deleted', `${sourceToDelete.name} was successfully removed.`);
      setIsDeleteModalOpen(false);
      setSourceToDelete(null);
    } catch (err: any) {
      const msg = err?.message || 'Failed to delete data source.';
      setDeleteError(msg);
      showToast('error', 'Deletion Prevented', msg);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSourceCreated = (newSource: DataSource) => {
    setSources([newSource, ...sources]);
    showToast('success', 'Data Source Connected', `Opening live AI analytics dashboard for ${newSource.name}...`);
    setTimeout(() => {
      onNavigate('overview', { source: newSource });
    }, 400);
  };

  const filteredSources = sources.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.database.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.warehouse.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'healthy') return s.status === 'healthy';
    if (statusFilter === 'disconnected') return s.status === 'disconnected';
    if (statusFilter === 'snowflake') return s.platform === 'snowflake';
    if (statusFilter === 'salesforce') return s.platform === 'salesforce';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-neutral-200">
        <div>
          <h1 className="text-2xl font-bold text-black tracking-tight font-sans">Data Sources</h1>
          <p className="text-xs text-neutral-600 font-medium mt-1">
            Connect enterprise data sources (Snowflake, Salesforce). Adding a source auto-generates a live AI analytics dashboard.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={loadSources}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsWizardOpen(true)}
            leftIcon={<Plus className="w-3.5 h-3.5" />}
          >
            + Add Data Source
          </Button>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-neutral-200 shadow-2xs">
        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer select-none ${
              statusFilter === 'all'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-black hover:bg-neutral-200'
            }`}
          >
            All Sources ({sources.length})
          </button>
          <button
            onClick={() => setStatusFilter('snowflake')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer select-none ${
              statusFilter === 'snowflake'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-black hover:bg-neutral-200'
            }`}
          >
            Snowflake ({sources.filter((s) => s.platform === 'snowflake').length})
          </button>
          <button
            onClick={() => setStatusFilter('salesforce')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer select-none ${
              statusFilter === 'salesforce'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-black hover:bg-neutral-200'
            }`}
          >
            Salesforce ({sources.filter((s) => s.platform === 'salesforce').length})
          </button>
          <button
            onClick={() => setStatusFilter('healthy')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer select-none ${
              statusFilter === 'healthy'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-black hover:bg-neutral-200'
            }`}
          >
            Healthy ({sources.filter((s) => s.status === 'healthy').length})
          </button>
          <button
            onClick={() => setStatusFilter('disconnected')}
            className={`px-3 py-1 rounded-md font-bold transition-colors cursor-pointer select-none ${
              statusFilter === 'disconnected'
                ? 'bg-black text-white'
                : 'bg-neutral-100 text-black hover:bg-neutral-200'
            }`}
          >
            Disconnected ({sources.filter((s) => s.status === 'disconnected').length})
          </button>
        </div>

        {/* Search & View Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by name, DB, warehouse..."
              className="w-full text-xs text-black font-medium bg-[#fafaf9] border border-neutral-300 rounded-md pl-8 pr-3 py-1.5 focus:border-black focus:outline-none placeholder:text-neutral-500"
            />
          </div>

          <div className="flex items-center border border-neutral-300 rounded-md p-0.5 bg-neutral-100 shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded text-xs cursor-pointer ${
                viewMode === 'grid' ? 'bg-black text-white shadow-xs font-bold' : 'text-neutral-600 hover:text-black'
              }`}
              title="Grid view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded text-xs cursor-pointer ${
                viewMode === 'table' ? 'bg-black text-white shadow-xs font-bold' : 'text-neutral-600 hover:text-black'
              }`}
              title="Table view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredSources.map((source) => {
            const isDatabricks = source.platform === 'databricks';
            return (
              <Card
                key={source.id}
                className={`flex flex-col justify-between border border-neutral-300 hover:border-black transition-all shadow-xs ${
                  isDatabricks ? 'bg-neutral-50/70 opacity-90' : 'bg-white'
                }`}
              >
                <div>
                  {/* Top Bar with Platform & Status */}
                  <div className="flex items-start justify-between gap-2 pb-3 border-b border-neutral-200">
                    <PlatformBadge platform={source.platform} isComingSoon={isDatabricks} />
                    <div className="flex items-center gap-1.5">
                      <Badge variant="black" size="xs">
                        {source.environment.toUpperCase()}
                      </Badge>
                      <ConnectionStatusBadge status={source.status} />
                    </div>
                  </div>

                  {/* Title & Database info */}
                  <div className="mt-3.5">
                    <h3 className="text-sm font-bold text-black tracking-tight">
                      {source.name}
                    </h3>
                    <div className="text-xs text-neutral-600 font-mono-code mt-1 flex items-center gap-1.5 font-medium">
                      <span className="font-bold text-black">{source.database}</span>
                      <span>•</span>
                      <span>{source.warehouse}</span>
                    </div>
                  </div>

                  {/* Warning Box if any */}
                  {source.errorMessage && (
                    <div className="mt-3 p-2 rounded bg-amber-50 border border-amber-300 text-[11px] text-amber-950 flex items-start gap-1.5 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                      <span>{source.errorMessage}</span>
                    </div>
                  )}

                  {/* Statistics Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-4 p-2.5 rounded bg-[#fafaf9] border border-neutral-200 text-center">
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Tables</div>
                      <div className="text-xs font-bold text-black font-mono-code mt-0.5">
                        {source.tableCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Schemas</div>
                      <div className="text-xs font-bold text-black font-mono-code mt-0.5">
                        {source.schemaCount}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-neutral-500 uppercase font-bold">Storage</div>
                      <div className="text-xs font-bold text-black font-mono-code mt-0.5">
                        {source.storageSizeGb > 0 ? `${source.storageSizeGb} GB` : 'Live API'}
                      </div>
                    </div>
                  </div>

                  {/* Connection Details Metadata */}
                  <div className="mt-3 text-[11px] text-neutral-600 font-mono-code space-y-1 font-medium">
                    <div className="flex justify-between">
                      <span>Endpoint:</span>
                      <span className="text-black font-bold truncate max-w-[140px]">{source.accountIdentifier}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Last Synced:</span>
                      <span className="text-black">{source.lastSyncAt}</span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-5 pt-3 border-t border-neutral-200 flex items-center justify-between gap-2">
                  {!isDatabricks ? (
                    <>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          isLoading={syncingId === source.id}
                          disabled={syncingId !== null || isTestingConnection || disconnectingId !== null || isSyncingMetadata}
                          onClick={(e) => handleSyncNow(source.id, e)}
                          leftIcon={<RefreshCw className="w-3 h-3" />}
                        >
                          {source.status === 'disconnected' ? 'Reconnect' : 'Sync'}
                        </Button>
                        {source.platform === 'snowflake' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={syncingId !== null || isTestingConnection || disconnectingId !== null || isSyncingMetadata}
                            onClick={(e) => promptSyncMetadata(source, e)}
                            leftIcon={<Database className="w-3 h-3 text-neutral-600" />}
                            title="Discover and catalog databases, schemas, tables, and columns"
                          >
                            Sync Metadata
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={syncingId !== null || isTestingConnection || disconnectingId !== null || isSyncingMetadata}
                          onClick={(e) => promptTestConnection(source, e)}
                          leftIcon={<ShieldCheck className="w-3 h-3 text-neutral-600" />}
                          title="Test live connection"
                        >
                          Test
                        </Button>
                        {source.status !== 'disconnected' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={disconnectingId === source.id}
                            onClick={(e) => handleDisconnect(source, e)}
                            leftIcon={<Unlink className="w-3 h-3 text-neutral-600" />}
                            className="text-neutral-600 hover:text-black text-xs"
                            title="Disconnect this data source"
                          >
                            Disconnect
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => promptDelete(source, e)}
                          className="text-neutral-400 hover:text-rose-600 hover:bg-rose-50 px-2"
                          title="Delete this data source"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onNavigate('overview', { source })}
                        leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                      >
                        Open Dashboard
                      </Button>
                    </>
                  ) : (
                    <div className="w-full text-center text-[11px] text-neutral-500 font-bold py-1">
                      Scheduled for Phase 2 Integration
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {filteredSources.length === 0 && (
        <Card className="p-8 text-center border border-dashed border-neutral-300 bg-white">
          <div className="flex flex-col items-center justify-center space-y-2">
            <AlertCircle className="w-8 h-8 text-neutral-400" />
            <h3 className="text-sm font-bold text-black">No Data Sources Found</h3>
            <p className="text-xs text-neutral-500 max-w-sm">
              {statusFilter !== 'all' || searchQuery
                ? 'No data sources match your current search query or filter criteria.'
                : 'No data sources have been configured yet. Add your first data source to get started.'}
            </p>
            {(statusFilter !== 'all' || searchQuery) && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setStatusFilter('all');
                  setSearchQuery('');
                }}
                className="mt-2"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <Card padding="none" className="overflow-hidden border border-neutral-300 shadow-xs bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-[#f5f5f4] border-b border-neutral-200 text-black font-bold">
                  <th className="py-3 px-4">Connection Name</th>
                  <th className="py-3 px-3">Platform</th>
                  <th className="py-3 px-3">Env</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3 font-mono-code">Warehouse / Host</th>
                  <th className="py-3 px-3 font-mono-code">Database / Schema</th>
                  <th className="py-3 px-3 text-right">Tables</th>
                  <th className="py-3 px-3 text-right">Storage</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-black font-medium">
                {filteredSources.map((source) => (
                  <tr key={source.id} className="hover:bg-neutral-50 transition-colors">
                    <td className="py-3 px-4 font-bold text-black">
                      {source.name}
                    </td>
                    <td className="py-3 px-3">
                      <PlatformBadge platform={source.platform} />
                    </td>
                    <td className="py-3 px-3">
                      <Badge variant="black" size="xs">
                        {source.environment.toUpperCase()}
                      </Badge>
                    </td>
                    <td className="py-3 px-3">
                      <ConnectionStatusBadge status={source.status} />
                    </td>
                    <td className="py-3 px-3 font-mono-code text-[11px] text-neutral-700 font-bold">
                      {source.warehouse}
                    </td>
                    <td className="py-3 px-3 font-mono-code text-[11px] text-neutral-700 font-bold">
                      {source.database}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-code font-bold text-black">
                      {source.tableCount}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-code text-black text-[11px] font-bold">
                      {source.storageSizeGb > 0 ? `${source.storageSizeGb} GB` : 'API'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          isLoading={syncingId === source.id}
                          disabled={syncingId !== null || isTestingConnection || disconnectingId !== null || isSyncingMetadata}
                          onClick={(e) => handleSyncNow(source.id, e)}
                          leftIcon={<RefreshCw className="w-3 h-3" />}
                        >
                          {source.status === 'disconnected' ? 'Reconnect' : 'Sync'}
                        </Button>
                        {source.platform === 'snowflake' && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={syncingId !== null || isTestingConnection || disconnectingId !== null || isSyncingMetadata}
                            onClick={(e) => promptSyncMetadata(source, e)}
                            leftIcon={<Database className="w-3 h-3 text-neutral-600" />}
                            title="Discover and catalog databases, schemas, tables, and columns"
                          >
                            Sync Metadata
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={syncingId !== null || isTestingConnection || disconnectingId !== null || isSyncingMetadata}
                          onClick={(e) => promptTestConnection(source, e)}
                          leftIcon={<ShieldCheck className="w-3 h-3 text-neutral-600" />}
                          title="Test live connection"
                        >
                          Test
                        </Button>
                        {source.status !== 'disconnected' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={disconnectingId === source.id}
                            onClick={(e) => handleDisconnect(source, e)}
                            leftIcon={<Unlink className="w-3 h-3 text-neutral-600" />}
                            className="text-neutral-600 hover:text-black text-xs"
                            title="Disconnect this data source"
                          >
                            Disconnect
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => promptDelete(source, e)}
                          className="text-neutral-400 hover:text-rose-600 hover:bg-rose-50 px-2"
                          title="Delete this data source"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() => onNavigate('overview', { source })}
                          leftIcon={<Sparkles className="w-3 h-3" />}
                        >
                          Dashboard
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setIsDeleteModalOpen(false);
            setSourceToDelete(null);
            setDeleteError(null);
          }
        }}
        title="Delete Data Source"
        subtitle="Safely remove a data source connection from the platform"
        maxWidth="md"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsDeleteModalOpen(false);
                setSourceToDelete(null);
                setDeleteError(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              isLoading={isDeleting}
              onClick={handleConfirmDelete}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              Confirm Delete
            </Button>
          </>
        }
      >
        {sourceToDelete && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-black">{sourceToDelete.name}</span>
                <PlatformBadge platform={sourceToDelete.platform} />
              </div>
              <div className="mt-2 text-xs text-neutral-600 flex items-center gap-2 font-mono-code font-medium">
                <span>DB: {sourceToDelete.database}</span>
                <span>•</span>
                <span>WH: {sourceToDelete.warehouse}</span>
              </div>
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed font-medium">
              Are you sure you want to permanently delete <span className="font-bold text-black">{sourceToDelete.name}</span>?
              This will remove the data source connection from the catalog.
            </p>

            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold">Referential Integrity Protection:</span>
                <p className="text-[11px] text-amber-800 leading-normal">
                  If this source has existing datasets or pipeline execution runs in PostgreSQL, deletion will be blocked (HTTP 409) to preserve data integrity and prevent cascade deletion.
                </p>
              </div>
            </div>

            {deleteError && (
              <div className="p-3 rounded-md bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-rose-900">Deletion Conflict:</span>
                  <p className="text-[11px] text-rose-800 leading-normal">{deleteError}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Metadata Synchronization Modal */}
      <Modal
        isOpen={isMetadataSyncModalOpen}
        onClose={() => {
          if (!isSyncingMetadata) {
            setIsMetadataSyncModalOpen(false);
            setSourceForMetadataSync(null);
            setMetadataSyncError(null);
            setMetadataSyncSuccess(null);
            setSyncCredentials({ accountIdentifier: '', warehouse: '', database: '', username: '', role: '', password: '' });
          }
        }}
        title="Synchronize Metadata"
        subtitle="Discover databases, schemas, tables, views, and columns without scanning business data rows"
        maxWidth="lg"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsMetadataSyncModalOpen(false);
                setSourceForMetadataSync(null);
                setMetadataSyncError(null);
                setMetadataSyncSuccess(null);
                setSyncCredentials({ accountIdentifier: '', warehouse: '', database: '', username: '', role: '', password: '' });
              }}
              disabled={isSyncingMetadata}
            >
              Close
            </Button>
            {metadataSyncSuccess ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setIsMetadataSyncModalOpen(false);
                  onNavigate('catalog');
                }}
                leftIcon={<Database className="w-3.5 h-3.5" />}
              >
                View in Catalog
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                isLoading={isSyncingMetadata}
                onClick={handleExecuteMetadataSync}
                leftIcon={<Database className="w-3.5 h-3.5" />}
              >
                Start Discovery
              </Button>
            )}
          </>
        }
      >
        {sourceForMetadataSync && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-black">{sourceForMetadataSync.name}</span>
                <div className="text-xs text-neutral-600 font-mono-code mt-0.5">
                  {sourceForMetadataSync.database} • {sourceForMetadataSync.warehouse}
                </div>
              </div>
              <PlatformBadge platform={sourceForMetadataSync.platform} />
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Discovers databases, schemas, tables, views, and column definitions via Snowflake <span className="font-mono-code font-bold text-black">INFORMATION_SCHEMA</span>. Business data rows are never queried or ingested.
            </p>

            {metadataSyncSuccess ? (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-2">
                <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Metadata Synchronized Successfully</span>
                </div>
                <p className="text-xs text-emerald-900 leading-normal">{metadataSyncSuccess}</p>
                <div className="pt-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setIsMetadataSyncModalOpen(false);
                      onNavigate('catalog');
                    }}
                    leftIcon={<Database className="w-3.5 h-3.5" />}
                  >
                    Explore in Data Catalog →
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                        Account Identifier
                      </label>
                      <input
                        type="text"
                        value={syncCredentials.accountIdentifier}
                        onChange={(e) => setSyncCredentials({ ...syncCredentials, accountIdentifier: e.target.value })}
                        placeholder="e.g. xy94821.us-east-1"
                        className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                        Warehouse
                      </label>
                      <input
                        type="text"
                        value={syncCredentials.warehouse}
                        onChange={(e) => setSyncCredentials({ ...syncCredentials, warehouse: e.target.value })}
                        placeholder="e.g. COMPUTE_WH"
                        className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                        Database
                      </label>
                      <input
                        type="text"
                        value={syncCredentials.database}
                        onChange={(e) => setSyncCredentials({ ...syncCredentials, database: e.target.value })}
                        placeholder="e.g. RETAIL_ANALYTICS"
                        className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                        Username
                      </label>
                      <input
                        type="text"
                        value={syncCredentials.username}
                        onChange={(e) => setSyncCredentials({ ...syncCredentials, username: e.target.value })}
                        placeholder="Snowflake user"
                        className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                        Role (Optional)
                      </label>
                      <input
                        type="text"
                        value={syncCredentials.role}
                        onChange={(e) => setSyncCredentials({ ...syncCredentials, role: e.target.value })}
                        placeholder="e.g. ACCOUNTADMIN or SYSADMIN"
                        className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                        Snowflake Password
                      </label>
                      <input
                        type="password"
                        value={syncCredentials.password}
                        onChange={(e) => setSyncCredentials({ ...syncCredentials, password: e.target.value })}
                        placeholder="Enter password..."
                        className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-md bg-stone-50 border border-stone-200 text-stone-700 text-xs flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold text-stone-900">Zero-Persistence Credential Security</span>
                    <p className="text-[11px] text-stone-600 leading-normal">
                      Passwords are sent via encrypted TLS, used ephemerally in-memory to discover metadata, and never stored in PostgreSQL or logged.
                    </p>
                  </div>
                </div>

                {metadataSyncError && (
                  <div className="p-3 rounded-md bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-rose-900">Discovery Error</span>
                      <p className="text-[11px] text-rose-800 leading-normal">{metadataSyncError}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Test Connection Credential Modal */}
      <Modal
        isOpen={isTestModalOpen}
        onClose={closeTestModal}
        title="Test Snowflake Connection"
        subtitle="Verify live SSL handshake, authentication, and warehouse authorization"
        maxWidth="lg"
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={closeTestModal}
              disabled={isTestingConnection}
            >
              Close
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={isTestingConnection}
              onClick={handleExecuteTestConnection}
              leftIcon={<ShieldCheck className="w-3.5 h-3.5" />}
            >
              Test Connection
            </Button>
          </>
        }
      >
        {sourceForTest && (
          <div className="space-y-4">
            <div className="p-3.5 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-between">
              <div>
                <span className="text-sm font-bold text-black">{sourceForTest.name}</span>
                <div className="text-xs text-neutral-600 font-mono-code mt-0.5">
                  {sourceForTest.database} • {sourceForTest.warehouse}
                </div>
              </div>
              <PlatformBadge platform={sourceForTest.platform} />
            </div>

            <p className="text-xs text-neutral-600 leading-relaxed">
              Establishes a live TLS connection to Snowflake to verify authentication, roles, and virtual warehouse compute capacity. Credentials are ephemeral and never persisted.
            </p>

            {/* Test Results Display */}
            {testResult && (
              <div
                className={`p-3.5 rounded-lg text-xs border space-y-2 ${
                  testResult.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-medium'
                    : 'bg-rose-50 border-rose-300 text-rose-950 font-medium'
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <div className="flex items-center gap-2">
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                    )}
                    <span>{testResult.message}</span>
                  </div>
                  {testResult.latencyMs > 0 && (
                    <span className="font-mono-code text-[11px] font-normal text-neutral-600">
                      {testResult.latencyMs}ms latency
                    </span>
                  )}
                </div>

                {testResult.error && (
                  <div className="pt-2 border-t border-rose-200 text-[11px] font-normal text-rose-900 leading-snug">
                    {testResult.error}
                  </div>
                )}

                {testResult.success && testResult.details && (
                  <div className="pt-2 border-t border-emerald-200 text-[11px] font-mono-code text-emerald-900 grid grid-cols-2 gap-2">
                    {testResult.details.snowflakeVersion && (
                      <div>
                        <span className="text-emerald-700">Version: </span>
                        <span className="font-bold">v{testResult.details.snowflakeVersion}</span>
                      </div>
                    )}
                    {testResult.details.warehouseStatus && (
                      <div>
                        <span className="text-emerald-700">Warehouse: </span>
                        <span className="font-bold">{testResult.details.warehouseStatus}</span>
                      </div>
                    )}
                    {testResult.details.accessibleDatabases && testResult.details.accessibleDatabases.length > 0 && (
                      <div>
                        <span className="text-emerald-700">Database: </span>
                        <span className="font-bold">{testResult.details.accessibleDatabases[0]}</span>
                      </div>
                    )}
                    {testResult.details.accountEdition && (
                      <div>
                        <span className="text-emerald-700">Account: </span>
                        <span className="font-bold">{testResult.details.accountEdition}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Validation Error */}
            {testValidationError && (
              <div className="p-3 rounded-md bg-rose-50 border border-rose-300 text-rose-950 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-bold text-rose-900">Validation Error</span>
                  <p className="text-[11px] text-rose-800 leading-normal">{testValidationError}</p>
                </div>
              </div>
            )}

            {/* Credential Inputs */}
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Account Identifier <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={testCredentials.accountIdentifier}
                    onChange={(e) => {
                      setTestCredentials({ ...testCredentials, accountIdentifier: e.target.value });
                      setTestValidationError(null);
                    }}
                    placeholder="e.g. xy94821.us-east-1"
                    className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Warehouse
                  </label>
                  <input
                    type="text"
                    value={testCredentials.warehouse}
                    onChange={(e) => setTestCredentials({ ...testCredentials, warehouse: e.target.value })}
                    placeholder="e.g. COMPUTE_WH"
                    className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Database
                  </label>
                  <input
                    type="text"
                    value={testCredentials.database}
                    onChange={(e) => setTestCredentials({ ...testCredentials, database: e.target.value })}
                    placeholder="e.g. RETAIL_ANALYTICS"
                    className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Username / Service User <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    value={testCredentials.username}
                    onChange={(e) => {
                      setTestCredentials({ ...testCredentials, username: e.target.value });
                      setTestValidationError(null);
                    }}
                    placeholder="Snowflake service user"
                    className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Role (Optional)
                  </label>
                  <input
                    type="text"
                    value={testCredentials.role}
                    onChange={(e) => setTestCredentials({ ...testCredentials, role: e.target.value })}
                    placeholder="e.g. ACCOUNTADMIN or SYSADMIN"
                    className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 uppercase mb-1">
                    Snowflake Password <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="password"
                    value={testCredentials.password}
                    onChange={(e) => {
                      setTestCredentials({ ...testCredentials, password: e.target.value });
                      setTestValidationError(null);
                    }}
                    placeholder="Enter password..."
                    className="w-full text-xs font-mono-code bg-white border border-neutral-300 rounded px-2.5 py-1.5 focus:border-black focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Zero-Persistence Security Banner */}
            <div className="p-3 rounded-md bg-stone-50 border border-stone-200 text-stone-700 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold text-stone-900">Zero-Persistence Credential Security</span>
                <p className="text-[11px] text-stone-600 leading-normal">
                  Credentials are sent via encrypted TLS, used ephemerally in-memory to test connectivity, and never stored in PostgreSQL, localStorage, or logged.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Data Source Wizard Modal */}
      <AddDataSourceWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={handleSourceCreated}
      />
    </div>
  );
};
