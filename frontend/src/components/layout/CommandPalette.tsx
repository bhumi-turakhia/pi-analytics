import React, { useState, useEffect } from 'react';
import { Search, Table, Database, Layers, ArrowRight, X } from 'lucide-react';
import { catalogApi } from '../../services/api';
import { NavigationPage } from '../../types';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: NavigationPage, context?: any) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ type: string; name: string; path: string; description: string; source: string }>>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else setQuery('');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    catalogApi.searchCatalog(query).then(setResults);
  }, [query, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true">
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div className="flex min-h-full items-start justify-center p-4 pt-20">
        <div className="relative transform overflow-hidden rounded-xl bg-white shadow-2xl transition-all w-full max-w-xl border border-stone-200 divide-y divide-stone-100">
          <div className="flex items-center px-4 py-3 bg-[#fbfbf9]">
            <Search className="w-4 h-4 text-stone-400 shrink-0 mr-3" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tables, schemas, columns, or enter command (e.g. ORDER_FACT)..."
              className="w-full text-xs text-stone-900 placeholder:text-stone-400 bg-transparent border-none outline-none focus:ring-0"
            />
            <button
              onClick={onClose}
              className="p-1 text-stone-400 hover:text-stone-600 rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-2 space-y-1">
            <div className="px-2 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
              Quick Navigation
            </div>
            <button
              onClick={() => {
                onNavigate('sources');
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left rounded-md hover:bg-stone-50 group text-xs text-stone-700 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Database className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900" />
                <span>Go to Data Sources</span>
              </span>
              <ArrowRight className="w-3 h-3 text-stone-400 group-hover:text-stone-900 opacity-0 group-hover:opacity-100" />
            </button>
            <button
              onClick={() => {
                onNavigate('catalog');
                onClose();
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-left rounded-md hover:bg-stone-50 group text-xs text-stone-700 cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-900" />
                <span>Explore Data Catalog</span>
              </span>
              <ArrowRight className="w-3 h-3 text-stone-400 group-hover:text-stone-900 opacity-0 group-hover:opacity-100" />
            </button>

            <div className="px-2 pt-3 pb-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wider border-t border-stone-100 mt-2">
              Catalog Items ({results.length})
            </div>

            {results.map((item, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onNavigate('catalog', { tableId: item.name.toLowerCase() });
                  onClose();
                }}
                className="w-full flex items-start gap-3 px-3 py-2 rounded-md hover:bg-stone-50 text-left cursor-pointer group"
              >
                <div className="p-1 rounded bg-stone-100 text-stone-600 mt-0.5 shrink-0">
                  <Table className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-stone-900 group-hover:text-black">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono-code">
                      {item.type.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 font-mono-code truncate">
                    {item.path}
                  </div>
                  <div className="text-[11px] text-stone-400 truncate mt-0.5">
                    {item.description}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="px-4 py-2.5 bg-[#fbfbf9] text-[11px] text-stone-400 flex items-center justify-between">
            <span>Navigation: Click or press ESC to dismiss</span>
            <span className="font-mono-code text-[10px] bg-stone-200/80 px-1.5 py-0.5 rounded text-stone-600">
              ESC
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
