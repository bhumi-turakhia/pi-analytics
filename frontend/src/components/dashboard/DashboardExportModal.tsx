import React, { useState } from 'react';
import {
  Download,
  BarChart3,
  CheckCircle2,
  X,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { DashboardExportData } from '../../services/exportService';
import { useToast } from '../ui/Toast';

export interface DashboardExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dashboardElementRef: React.RefObject<HTMLDivElement | null>;
  exportData: DashboardExportData;
}

interface PowerBIExportPayload {
  metrics: Array<Record<string, any>>;
  breakdown: Array<Record<string, any>>;
  records: Array<Record<string, any>>;
  project_name: string;
}

export const DashboardExportModal: React.FC<DashboardExportModalProps> = ({
  isOpen,
  onClose,
  exportData,
}) => {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const buildPayload = (): PowerBIExportPayload => {
    const metrics = (exportData.kpis || []).map((kpi) => ({
      metric_name: kpi.label,
      metric_value:
        typeof kpi.value === 'number'
          ? kpi.value
          : Number(String(kpi.value).replace(/[^0-9.-]/g, '')) || 0,
    }));

    const breakdown: Array<Record<string, any>> = [];
    const records: Array<Record<string, any>> = [];

    for (const widget of exportData.widgets || []) {
      const rows = widget.rows || [];
      const spec = widget.visualization_spec || {};

      for (const row of rows) {
        const keys = Object.keys(row);

        if (keys.length === 0) {
          continue;
        }

        const categoryKey =
          spec.xField && row[spec.xField] !== undefined
            ? spec.xField
            : keys[0];

        const valueKey =
          spec.yField && row[spec.yField] !== undefined
            ? spec.yField
            : keys.length > 1
              ? keys[1]
              : keys[0];

        const category = row[categoryKey];
        const value = row[valueKey];

        breakdown.push({
          category:
            category === null || category === undefined
              ? 'Unknown'
              : String(category),
          metric_name: widget.title || 'Dashboard Metric',
          metric_value:
            typeof value === 'number'
              ? value
              : Number(value) || 0,
        });
      }

      for (const row of rows) {
        const keys = Object.keys(row);

        if (keys.length === 0) {
          continue;
        }

        const recordId =
          row.id ??
          row.Id ??
          row.ID ??
          row.record_id ??
          row.RecordId ??
          row[keys[0]];

        const recordName =
          row.name ??
          row.Name ??
          row.record_name ??
          row[keys[1] || keys[0]];

        const region =
          row.region ??
          row.Region ??
          row.Region__c ??
          '';

        const numericKey = keys.find(
          (key) =>
            typeof row[key] === 'number' &&
            key !== 'id' &&
            key !== 'Id' &&
            key !== 'ID'
        );

        const metricValue =
          numericKey && typeof row[numericKey] === 'number'
            ? row[numericKey]
            : '';

        const createdDate =
          row.created_date ??
          row.CreatedDate ??
          row.createdAt ??
          row.created_at ??
          '';

        records.push({
          record_id: recordId === null || recordId === undefined
            ? ''
            : String(recordId),
          record_name: recordName === null || recordName === undefined
            ? ''
            : String(recordName),
          region: region === null || region === undefined
            ? ''
            : String(region),
          metric_value: metricValue,
          created_date: createdDate,
        });
      }
    }

    if (records.length === 0 && exportData.dataTable) {
      for (const row of exportData.dataTable.rows || []) {
        const keys = Object.keys(row);

        if (keys.length === 0) {
          continue;
        }

        records.push({
          record_id: String(row.id ?? row.Id ?? row[keys[0]] ?? ''),
          record_name: String(
            row.name ??
            row.Name ??
            row[keys[1] || keys[0]] ??
            ''
          ),
          region: String(
            row.region ??
            row.Region ??
            row.Region__c ??
            ''
          ),
          metric_value:
            typeof row.metric_value === 'number'
              ? row.metric_value
              : '',
          created_date: String(
            row.created_date ??
            row.CreatedDate ??
            ''
          ),
        });
      }
    }

    if (metrics.length === 0) {
      metrics.push({
        metric_name: 'Dashboard Metrics',
        metric_value: 0,
      });
    }

    if (breakdown.length === 0) {
      breakdown.push({
        category: 'No breakdown data',
        metric_name: 'Dashboard',
        metric_value: 0,
      });
    }

    if (records.length === 0) {
      records.push({
        record_id: 'NO_DATA',
        record_name: 'No dashboard records available',
        region: '',
        metric_value: '',
        created_date: '',
      });
    }

    return {
      metrics,
      breakdown,
      records,
      project_name: 'PI_Analytics_Dashboard',
    };
  };

  const handlePowerBIExport = async () => {
    setIsExporting(true);

    try {
      const payload = buildPayload();

      const response = await fetch('/api/powerbi/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let message = 'Power BI export failed.';

        try {
          const errorBody = await response.json();
          message = errorBody?.detail || message;
        } catch {
          // Keep the default error message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();

      const contentDisposition =
        response.headers.get('content-disposition') || '';

      const filenameMatch =
        contentDisposition.match(/filename="?([^"]+)"?/i);

      const filename =
        filenameMatch?.[1] || 'PI_Analytics_Dashboard.zip';

      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(url);

      showToast(
        'success',
        'Power BI Project Exported',
        'The real dashboard data was exported as a Power BI project ZIP.'
      );

      onClose();
    } catch (error: any) {
      console.error('Power BI export failed:', error);

      showToast(
        'error',
        'Power BI Export Error',
        error?.message || 'Failed to export the Power BI dashboard.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export Power BI Dashboard"
      maxWidth="lg"
    >
      <div className="space-y-5 p-1">
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-black p-2 text-white">
              <BarChart3 className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-sm font-bold text-black">
                Power BI Dashboard Project
              </h3>

              <p className="mt-1 text-xs text-neutral-600 leading-relaxed">
                Export the current dashboard as a Power BI project containing
                the dashboard metrics, visualization breakdowns, and real
                dashboard records.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-black uppercase tracking-wider">
            Dashboard contents
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                KPIs
              </div>
              <div className="mt-1 text-lg font-bold text-black">
                {exportData.kpis?.length || 0}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                Visualizations
              </div>
              <div className="mt-1 text-lg font-bold text-black">
                {exportData.widgets?.length || 0}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-3">
              <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                Data rows
              </div>
              <div className="mt-1 text-lg font-bold text-black">
                {(exportData.widgets || []).reduce(
                  (total, widget) => total + (widget.rows?.length || 0),
                  0
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-black mt-0.5 shrink-0" />

            <div className="text-[11px] text-neutral-600 leading-relaxed">
              The export uses the current dashboard state and sends it to the
              backend Power BI exporter. No browser screenshot or PDF is used.
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
          <div className="text-[11px] text-neutral-500 font-mono-code">
            Output:{' '}
            <span className="text-black font-bold">
              PI_Analytics_Dashboard.zip
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isExporting}
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              size="sm"
              onClick={handlePowerBIExport}
              isLoading={isExporting}
              leftIcon={<Download className="w-3.5 h-3.5" />}
              className="font-semibold"
            >
              Export Power BI
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
