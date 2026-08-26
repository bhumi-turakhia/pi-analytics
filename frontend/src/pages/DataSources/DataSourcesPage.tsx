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
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConnectionStatusBadge, PlatformBadge } from '../../components/status/ConnectionStatusBadge';
import { AddDataSourceWizard } from './AddDataSourceWizard';
import { useToast } from '../../components/ui/Toast';
import { dataSourceApi } from '../../services/api';
import { DataSource, NavigationPage } from '../../types';

export interface DataSourcesPageProps {
  onNavigate: (page: NavigationPage, context?: any) => void;
  openWizardInitial?: boolean;
}

export const DataSourcesPage: React.FC<DataSourcesPageProps> = ({
  onNavigate,
  openWizardInitial = false,
}) => {
  const { showToast } = useToast();
  const [sources, setSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'healthy' | 'snowflake' | 'salesforce'>('all');
  const [isWizardOpen, setIsWizardOpen] = useState(openWizardInitial);
  const [syncingId, setSyncingId] = useState<string | null>(null);

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

  const handleSyncNow = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSyncingId(id);
    try {
      await dataSourceApi.syncNow(id);
      await loadSources();
      showToast('success', 'Source Synchronized', 'Pipeline sync run completed successfully.');
    } catch (error: any) {
      showToast('error', 'Sync Failed', error?.message || 'Failed to sync data source.');
    } finally {
      setSyncingId(null);
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
                      <Button
                        size="sm"
                        variant="outline"
                        isLoading={syncingId === source.id}
                        onClick={(e) => handleSyncNow(source.id, e)}
                        leftIcon={<RefreshCw className="w-3 h-3" />}
                      >
                        Sync
                      </Button>
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
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => onNavigate('overview', { source })}
                        leftIcon={<Sparkles className="w-3 h-3" />}
                      >
                        Dashboard
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add Data Source Wizard Modal */}
      <AddDataSourceWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onSuccess={handleSourceCreated}
      />
    </div>
  );
};
