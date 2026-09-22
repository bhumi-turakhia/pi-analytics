import React, { useState, useEffect } from 'react';
import {
  Activity as ActivityIcon,
  Search,
  Download,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  RefreshCw,
  Terminal,
  User,
  Info,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { activityApi } from '../../services/api';
import { ActivityLog, NavigationPage } from '../../types';

export const ActivityPage: React.FC<{ onNavigate: (page: NavigationPage) => void }> = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await activityApi.getAll();
      setLogs(data);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = async () => {
    const csvData = await activityApi.exportAuditTrail();
    const encodedUri = encodeURI('data:text/csv;charset=utf-8,' + csvData);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pi-analytics-audit-log-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.user.name.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    return true;
  });

  const getStatusBadge = (status: ActivityLog['status']) => {
    switch (status) {
      case 'success':
        return <Badge variant="success" dot={true}>Success</Badge>;
      case 'warning':
        return <Badge variant="warning" dot={true}>Warning</Badge>;
      case 'failure':
        return <Badge variant="error" dot={true}>Failure</Badge>;
      case 'info':
        return <Badge variant="info" dot={true}>Info</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-stone-200/80">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 tracking-tight font-sans">Activity Audit</h1>
          <p className="text-xs text-stone-500 mt-1">
            Enterprise immutable audit trail recording connection events, schema syncs, queries, and user logins.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            leftIcon={<Download className="w-3.5 h-3.5" />}
          >
            Export Audit Trail (CSV)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadLogs}
            isLoading={loading}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-lg border border-stone-200 shadow-[0_1px_2px_rgba(0,0,0,0.01)]">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search audit actions, resources, users..."
              className="w-full text-xs text-stone-800 bg-[#fbfbf9] border border-stone-200 rounded-md pl-8 pr-3 py-1.5 focus:border-stone-800 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-36 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success Only</option>
            <option value="warning">Warnings</option>
            <option value="failure">Failures</option>
            <option value="info">Info / Queries</option>
          </Select>
        </div>
      </div>

      {/* Audit Log Table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-semibold select-none">
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-3">Actor / User</th>
                <th className="py-3 px-3">Action</th>
                <th className="py-3 px-3">Resource Target</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3 font-mono-code">IP Address</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-stone-800">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-400">
                    {loading ? 'Loading pipeline activity logs...' : 'No activity or pipeline run logs found.'}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-stone-50/70 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 font-mono-code text-[11px] text-stone-500 whitespace-nowrap">
                      {log.timestamp}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-stone-900 text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
                          {log.user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-semibold text-stone-900 leading-tight">{log.user.name}</div>
                          <div className="text-[10px] text-stone-400 font-mono-code">{log.user.role}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-stone-900">
                      {log.action}
                    </td>
                    <td className="py-3 px-3 font-mono-code text-[11px] text-stone-700">
                      {log.resource}
                    </td>
                    <td className="py-3 px-3">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="py-3 px-3 font-mono-code text-[11px] text-stone-500">
                      {log.ipAddress}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button size="sm" variant="ghost">
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail Inspection Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Audit Log Event Details"
          subtitle={`Event ID: ${selectedLog.id}`}
        >
          <div className="space-y-4 text-xs font-mono-code text-stone-800">
            <div className="p-3 bg-stone-50 rounded border border-stone-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">Timestamp:</span>
                <span className="font-semibold">{selectedLog.timestamp}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">Actor:</span>
                <span>{selectedLog.user.name} ({selectedLog.user.email})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">Role:</span>
                <span>{selectedLog.user.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">Action:</span>
                <span className="font-semibold text-stone-900">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">Target Resource:</span>
                <span className="font-semibold text-stone-900">{selectedLog.resource}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">Status:</span>
                <span>{getStatusBadge(selectedLog.status)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500 font-sans">IP Address:</span>
                <span>{selectedLog.ipAddress}</span>
              </div>
            </div>

            {selectedLog.details && (
              <div>
                <label className="font-sans font-semibold text-stone-700 block mb-1">
                  Diagnostics &amp; Detailed Payload:
                </label>
                <pre className="p-3 bg-stone-900 text-stone-100 rounded border border-stone-800 text-[11px] whitespace-pre-wrap">
                  {selectedLog.details}
                </pre>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};
