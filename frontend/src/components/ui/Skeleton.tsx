import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-stone-200/70 rounded ${className}`} />;
};

export const CardSkeleton: React.FC = () => (
  <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
    <div className="flex justify-between items-center">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-4 rounded-full" />
    </div>
    <Skeleton className="h-8 w-20" />
    <Skeleton className="h-3 w-36" />
  </div>
);

export const TableSkeleton: React.FC<{ rows?: number; cols?: number }> = ({ rows = 5, cols = 4 }) => (
  <div className="border border-stone-200 rounded-lg overflow-hidden bg-white">
    <div className="bg-stone-50 border-b border-stone-200 px-4 py-3 flex gap-4">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
    <div className="divide-y divide-stone-100">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="px-4 py-3 flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  </div>
);
