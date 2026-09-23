import React from 'react';
import { AlertCircle, Lock, ServerCrash, ArrowLeft } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { PiByThreeLogo } from '../../components/brand/Logo';
import { NavigationPage } from '../../types';

export const Error404Page: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6 text-center text-black">
      <div className="mb-6 cursor-pointer" onClick={() => onNavigate('overview')}>
        <PiByThreeLogo size="md" showTagline={true} />
      </div>
      <div className="w-12 h-12 rounded-full bg-neutral-100 border border-neutral-300 flex items-center justify-center mb-4 text-black font-mono-code font-bold text-sm">
        404
      </div>
      <h1 className="text-xl font-bold text-black tracking-tight">Catalog Resource Not Found</h1>
      <p className="text-xs text-neutral-600 max-w-sm mt-1 mb-6 leading-relaxed font-medium">
        The requested database, schema, or table does not exist in the PostgreSQL metadata index or may have been dropped from Snowflake.
      </p>
      <Button
        variant="primary"
        size="sm"
        onClick={() => onNavigate('overview')}
        leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
      >
        Return to Dashboard
      </Button>
    </div>
  );
};

export const Error500Page: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6 text-center text-black">
      <div className="mb-6 cursor-pointer" onClick={() => onNavigate('overview')}>
        <PiByThreeLogo size="md" showTagline={true} />
      </div>
      <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-300 flex items-center justify-center mb-4 text-rose-700">
        <ServerCrash className="w-6 h-6" />
      </div>
      <h1 className="text-xl font-bold text-black tracking-tight">Internal Platform Error</h1>
      <p className="text-xs text-neutral-600 max-w-sm mt-1 mb-6 leading-relaxed font-medium">
        An unhandled exception occurred in the FastAPI metadata synchronization worker while querying Snowflake information schema.
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
        >
          Reload Session
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={() => onNavigate('overview')}
        >
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
};

export const Error403Page: React.FC<{ onNavigate: (page: NavigationPage) => void }> = ({ onNavigate }) => {
  return (
    <div className="min-h-screen bg-[#fafaf9] flex flex-col items-center justify-center p-6 text-center text-black">
      <div className="mb-6 cursor-pointer" onClick={() => onNavigate('overview')}>
        <PiByThreeLogo size="md" showTagline={true} />
      </div>
      <div className="w-12 h-12 rounded-full bg-amber-50 border border-amber-300 flex items-center justify-center mb-4 text-amber-700">
        <Lock className="w-6 h-6" />
      </div>
      <h1 className="text-xl font-bold text-black tracking-tight">Access Restricted (RBAC 403)</h1>
      <p className="text-xs text-neutral-600 max-w-sm mt-1 mb-6 leading-relaxed font-medium">
        Your role <span className="font-mono-code font-bold text-black">DATA_ARCHITECT</span> does not possess SELECT grants on this classified PII schema in Snowflake.
      </p>
      <Button
        variant="primary"
        size="sm"
        onClick={() => onNavigate('overview')}
        leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
      >
        Return to Dashboard
      </Button>
    </div>
  );
};
