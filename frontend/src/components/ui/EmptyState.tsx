import React from 'react';
import { Database, Plus } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = <Database className="w-8 h-8 text-stone-400 stroke-1" />,
  title,
  description,
  actionLabel,
  onAction,
  actionIcon = <Plus className="w-3.5 h-3.5" />,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-stone-200/90 rounded-xl max-w-lg mx-auto shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-4 text-stone-600">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-stone-900 mb-1 tracking-tight">{title}</h3>
      <p className="text-xs text-stone-500 max-w-sm mb-6 leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="primary" onClick={onAction} leftIcon={actionIcon}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
