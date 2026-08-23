import React, { useState } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  technicalDetails?: string;
  onRetry?: () => void;
  variant?: 'inline' | 'page';
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to complete operation',
  message,
  technicalDetails,
  onRetry,
  variant = 'inline',
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (variant === 'page') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center mb-4 text-rose-600">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-semibold text-stone-900 mb-2">{title}</h2>
        <p className="text-xs text-stone-600 mb-6 leading-relaxed">{message}</p>

        {technicalDetails && (
          <div className="w-full text-left mb-6">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-[11px] font-medium text-stone-500 hover:text-stone-800 flex items-center gap-1 mb-2"
            >
              <span>{showDetails ? 'Hide technical diagnostics' : 'View technical diagnostics'}</span>
              {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showDetails && (
              <pre className="p-3 bg-stone-900 text-stone-200 text-[11px] font-mono-code rounded border border-stone-800 overflow-x-auto whitespace-pre-wrap">
                {technicalDetails}
              </pre>
            )}
          </div>
        )}

        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Retry Connection
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 bg-rose-50/60 border border-rose-200 rounded-lg text-rose-900 flex items-start gap-3">
      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold">{title}</div>
        <div className="text-xs text-rose-700 mt-0.5">{message}</div>
        {technicalDetails && (
          <details className="mt-2 text-[11px] text-rose-800">
            <summary className="cursor-pointer font-medium hover:underline">Diagnostics</summary>
            <pre className="mt-1 p-2 bg-rose-100/70 rounded text-[10px] font-mono-code overflow-x-auto">
              {technicalDetails}
            </pre>
          </details>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 bg-white">
          Retry
        </Button>
      )}
    </div>
  );
};
