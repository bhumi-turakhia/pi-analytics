import React from 'react';
import {
  Plus,
  Layers,
  Sparkles,
  BarChart3,
  Terminal,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { NavigationPage } from '../../types';

export interface DashboardQuickActionsProps {
  onNavigate: (page: NavigationPage, context?: any) => void;
  onOpenExportModal: () => void;
}

export const DashboardQuickActions: React.FC<DashboardQuickActionsProps> = ({
  onNavigate,
  onOpenExportModal,
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white border border-neutral-300 shadow-xs">
      <div>
        <h2 className="text-sm font-bold text-black flex items-center gap-1.5">
          <span>Primary Actions</span>
        </h2>
        <p className="text-xs text-neutral-600 font-medium">
          Quickly launch core workspaces, connect new pipelines, or explore governed data.
        </p>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
        <Button
          variant="primary"
          size="sm"
          onClick={() => onNavigate('sources', { openWizard: true })}
          leftIcon={<Plus className="w-3.5 h-3.5" />}
          className="shadow-xs font-semibold"
        >
          Add Data Source
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('catalog')}
          leftIcon={<Layers className="w-3.5 h-3.5" />}
          className="font-semibold"
        >
          Data Catalog
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const el = document.getElementById('ai-copilot-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          className="font-semibold"
        >
          Ask AI Copilot
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onNavigate('analytics')}
          leftIcon={<BarChart3 className="w-3.5 h-3.5" />}
          className="font-semibold"
        >
          Metric Studio
        </Button>
      </div>
    </div>
  );
};
