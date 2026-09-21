import React, { useState } from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Code2,
  CheckCircle2,
  X,
  Sliders,
  Sparkles,
  FileSpreadsheet,
  Presentation,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import {
  ExportFormat,
  ExportResolution,
  ExportOptions,
  DashboardExportData,
  exportDashboardToPDF,
  exportDashboardToPNG,
  exportDashboardToJPEG,
  exportDashboardToSVG,
  exportDashboardToJSON,
  exportDashboardToXLSX,
  exportDashboardToPPTX,
} from '../../services/exportService';
import { useToast } from '../ui/Toast';

export interface DashboardExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dashboardElementRef: React.RefObject<HTMLDivElement | null>;
  exportData: DashboardExportData;
}

export const DashboardExportModal: React.FC<DashboardExportModalProps> = ({
  isOpen,
  onClose,
  dashboardElementRef,
  exportData,
}) => {
  const { showToast } = useToast();
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [selectedResolution, setSelectedResolution] = useState<ExportResolution>('2x');
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeBranding, setIncludeBranding] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const formatOptions = [
    {
      id: 'pdf' as ExportFormat,
      name: 'PDF Document',
      desc: 'Executive Summary with visual charts and audit summary',
      icon: <FileText className="w-5 h-5 text-black" />,
      badge: 'Recommended',
    },
    {
      id: 'xlsx' as ExportFormat,
      name: 'Excel Workbook (.xlsx)',
      desc: 'Multi-sheet workbook with real KPI, source, and query data',
      icon: <FileSpreadsheet className="w-5 h-5 text-black" />,
      badge: 'Spreadsheet',
    },
    {
      id: 'pptx' as ExportFormat,
      name: 'PowerPoint Presentation (.pptx)',
      desc: 'Executive slide deck with real metric cards and data tables',
      icon: <Presentation className="w-5 h-5 text-black" />,
      badge: 'Slides',
    },
    {
      id: 'png' as ExportFormat,
      name: 'PNG Image',
      desc: 'High-definition lossless raster graphics',
      icon: <ImageIcon className="w-5 h-5 text-black" />,
      badge: 'Lossless',
    },
    {
      id: 'jpeg' as ExportFormat,
      name: 'JPG / JPEG Image',
      desc: 'Optimized compressed snapshot for presentations',
      icon: <ImageIcon className="w-5 h-5 text-black" />,
      badge: 'Web Ready',
    },
    {
      id: 'svg' as ExportFormat,
      name: 'SVG Vector',
      desc: 'Resolution-independent scalable vector graphic snapshot',
      icon: <Code2 className="w-5 h-5 text-black" />,
      badge: 'Vector',
    },
    {
      id: 'json' as ExportFormat,
      name: 'JSON Data',
      desc: 'Raw structured telemetry metrics and source states',
      icon: <Code2 className="w-5 h-5 text-black" />,
      badge: 'Data Payload',
    },
  ];

  const resolutionOptions = [
    { id: '1x' as ExportResolution, label: 'Standard (1x)', desc: '96 DPI • Small file size' },
    { id: '2x' as ExportResolution, label: 'High (2x)', desc: '192 DPI • Retina screens' },
    { id: '4x' as ExportResolution, label: 'Print (4x)', desc: '300+ DPI • Ultra-HD presentation' },
  ];

  const handleExecuteExport = async () => {
    setIsExporting(true);
    const options: ExportOptions = {
      format: selectedFormat,
      resolution: selectedResolution,
      includeMetadata,
      includeBranding,
      filename: `pi-analytics-dashboard-${Date.now()}.${selectedFormat === 'jpeg' ? 'jpg' : selectedFormat}`,
    };

    try {
      const element = dashboardElementRef.current;

      if (selectedFormat === 'pdf') {
        await exportDashboardToPDF(element, exportData, options);
      } else if (selectedFormat === 'xlsx') {
        await exportDashboardToXLSX(exportData, options);
      } else if (selectedFormat === 'pptx') {
        await exportDashboardToPPTX(element, exportData, options);
      } else if (selectedFormat === 'png') {
        if (!element) throw new Error('Dashboard canvas not ready for capture.');
        await exportDashboardToPNG(element, options);
      } else if (selectedFormat === 'jpeg') {
        if (!element) throw new Error('Dashboard canvas not ready for capture.');
        await exportDashboardToJPEG(element, options);
      } else if (selectedFormat === 'svg') {
        if (!element) throw new Error('Dashboard canvas not ready for capture.');
        await exportDashboardToSVG(element, options);
      } else if (selectedFormat === 'json') {
        exportDashboardToJSON(exportData, options);
      }

      showToast('success', 'Export Completed', `Dashboard saved successfully as ${selectedFormat.toUpperCase()}.`);
      onClose();
    } catch (error: any) {
      console.error('Export failed:', error);
      showToast('error', 'Export Error', error?.message || 'Failed to export dashboard.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Export &amp; Save Dashboard"
      size="lg"
    >
      <div className="space-y-5 p-1">
        {/* Intro */}
        <p className="text-xs text-neutral-600 font-medium">
          Generate high-fidelity snapshots or data payloads of your current Pi Analytics dashboard.
        </p>

        {/* 1. Format Selection */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-black uppercase tracking-wider">
            1. Select Export Format
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {formatOptions.map((fmt) => {
              const isSelected = selectedFormat === fmt.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setSelectedFormat(fmt.id)}
                  className={`p-3 rounded-lg border text-left flex items-start justify-between gap-3 transition-all cursor-pointer ${
                    isSelected
                      ? 'border-black bg-neutral-100/70 shadow-xs'
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 shrink-0">{fmt.icon}</div>
                    <div>
                      <div className="text-xs font-bold text-black flex items-center gap-1.5">
                        <span>{fmt.name}</span>
                        {fmt.badge && (
                          <span className="text-[9px] font-mono-code bg-black text-white px-1.5 py-0.2 rounded font-bold">
                            {fmt.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-neutral-500 font-normal mt-0.5">
                        {fmt.desc}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected ? 'border-black bg-black text-white' : 'border-neutral-300'
                    }`}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Resolution & Quality (applicable for raster/image/PDF) */}
        {selectedFormat !== 'json' && (
          <div className="space-y-2 pt-2 border-t border-neutral-200">
            <label className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-black" />
              <span>2. Resolution &amp; Quality Scale</span>
            </label>
            <div className="grid grid-cols-3 gap-2.5">
              {resolutionOptions.map((res) => {
                const isSelected = selectedResolution === res.id;
                return (
                  <button
                    key={res.id}
                    type="button"
                    onClick={() => setSelectedResolution(res.id)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'border-black bg-black text-white'
                        : 'border-neutral-200 bg-white hover:border-neutral-400 text-black'
                    }`}
                  >
                    <div className="text-xs font-bold">{res.label}</div>
                    <div
                      className={`text-[10px] mt-0.5 ${
                        isSelected ? 'text-neutral-300' : 'text-neutral-500'
                      }`}
                    >
                      {res.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. Export Options */}
        <div className="pt-2 border-t border-neutral-200 space-y-2">
          <label className="text-xs font-bold text-black uppercase tracking-wider">
            3. Inclusion Options
          </label>
          <div className="flex items-center gap-6 text-xs font-medium text-black">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeMetadata}
                onChange={(e) => setIncludeMetadata(e.target.checked)}
                className="w-4 h-4 accent-black rounded cursor-pointer"
              />
              <span>Include Ecosystem Metadata &amp; Timestamp</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeBranding}
                onChange={(e) => setIncludeBranding(e.target.checked)}
                className="w-4 h-4 accent-black rounded cursor-pointer"
              />
              <span>Include Pi by 3 Official Branding</span>
            </label>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="pt-4 border-t border-neutral-200 flex items-center justify-between">
          <div className="text-[11px] text-neutral-500 font-mono-code">
            Target: <span className="text-black font-bold">{selectedFormat.toUpperCase()}</span> ({selectedResolution})
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isExporting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExecuteExport}
              isLoading={isExporting}
              leftIcon={<Download className="w-3.5 h-3.5" />}
              className="font-semibold"
            >
              Export Now
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};
