import React from 'react';
import {
  Download,
  FileText,
  Image as ImageIcon,
  Code2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { ExportFormat } from '../../services/exportService';

export interface DashboardExportProps {
  onOpenExportModal: () => void;
  onQuickExport: (format: ExportFormat) => void;
}

export const DashboardExport: React.FC<DashboardExportProps> = ({
  onOpenExportModal,
  onQuickExport,
}) => {
  return (
    <div className="rounded-xl border border-neutral-300 bg-white p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4 text-black" />
          <h2 className="text-sm font-bold text-black tracking-tight">
            Dashboard Export &amp; Save
          </h2>
          <Badge variant="neutral" size="xs">
            Multi-Format
          </Badge>
        </div>
        <p className="text-xs text-neutral-600 font-medium">
          Download high-resolution PDF, PNG, JPG, or SVG snapshots of your enterprise workspace.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onQuickExport('pdf')}
          leftIcon={<FileText className="w-3.5 h-3.5 text-black" />}
          className="text-xs font-semibold"
        >
          Quick PDF
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onQuickExport('png')}
          leftIcon={<ImageIcon className="w-3.5 h-3.5 text-black" />}
          className="text-xs font-semibold"
        >
          Quick PNG (2x)
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={onOpenExportModal}
          leftIcon={<Sliders className="w-3.5 h-3.5" />}
          className="text-xs font-semibold"
        >
          Configure Export...
        </Button>
      </div>
    </div>
  );
};
