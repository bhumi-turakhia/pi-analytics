import React from 'react';
import { ConnectionStatus, PlatformType } from '../../types';
import { Badge } from '../ui/Badge';
import { RefreshCw, Cloud } from 'lucide-react';

export const ConnectionStatusBadge: React.FC<{ status: ConnectionStatus; showText?: boolean }> = ({
  status,
  showText = true,
}) => {
  switch (status) {
    case 'healthy':
      return (
        <Badge variant="success" dot={true}>
          {showText ? 'Healthy' : ''}
        </Badge>
      );
    case 'syncing':
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-800 border border-sky-200">
          <RefreshCw className="w-2.5 h-2.5 animate-spin text-sky-600" />
          {showText ? 'Syncing' : ''}
        </span>
      );
    case 'warning':
      return (
        <Badge variant="warning" dot={true}>
          {showText ? 'Warning' : ''}
        </Badge>
      );
    case 'disconnected':
      return (
        <Badge variant="neutral" dot={true}>
          {showText ? 'Disconnected' : ''}
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="error" dot={true}>
          {showText ? 'Error' : ''}
        </Badge>
      );
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
};

export const PlatformBadge: React.FC<{ platform: PlatformType; isComingSoon?: boolean }> = ({
  platform,
  isComingSoon,
}) => {
  if (platform === 'snowflake') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#f0f7fc] text-[#0f548c] border border-[#d2e8f8] text-xs font-medium">
        <svg className="w-3 h-3 text-[#29b5e8]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0L14 8L22 10L15 14L18 22L12 17L6 22L9 14L2 10L10 8L12 0Z" />
        </svg>
        <span>Snowflake Native</span>
      </span>
    );
  }

  if (platform === 'salesforce') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-[#eef7ff] text-[#014486] border border-[#bcdcfc] text-xs font-medium">
        <Cloud className="w-3 h-3 text-[#00A1E0]" />
        <span>Salesforce Cloud</span>
      </span>
    );
  }

  if (platform === 'databricks') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-stone-100 text-stone-600 border border-stone-200 text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-amber-400"></span>
        <span>Databricks</span>
        {isComingSoon !== false && (
          <span className="text-[10px] uppercase font-semibold text-stone-500 bg-stone-200/80 px-1 rounded">
            Coming Soon
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200 text-xs font-medium">
      <span>PostgreSQL (Metadata)</span>
    </span>
  );
};
