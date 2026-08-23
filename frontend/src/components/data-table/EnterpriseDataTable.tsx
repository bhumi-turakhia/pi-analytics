import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  Download,
  Copy,
  Check,
  RefreshCw,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/Button';

export interface ColumnDef<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  isMonospace?: boolean;
  width?: string;
}

export interface EnterpriseDataTableProps<T extends Record<string, any>> {
  columns: ColumnDef<T>[];
  data: T[];
  searchPlaceholder?: string;
  title?: string;
  subtitle?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  actions?: React.ReactNode;
  exportFilename?: string;
  pageSizeDefault?: number;
  emptyMessage?: string;
}

export function EnterpriseDataTable<T extends Record<string, any>>({
  columns,
  data,
  searchPlaceholder = 'Search records...',
  title,
  subtitle,
  isLoading = false,
  onRefresh,
  actions,
  exportFilename = 'pi-analytics-export',
  pageSizeDefault = 10,
  emptyMessage = 'No matching records found',
}: EnterpriseDataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(pageSizeDefault);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    columns.map((c) => String(c.key))
  );
  const [showColMenu, setShowColMenu] = useState(false);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === 'asc') {
        setSortOrder('desc');
      } else {
        setSortKey(null);
        setSortOrder('asc');
      }
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((item) =>
      Object.values(item).some((val) =>
        String(val ?? '').toLowerCase().includes(q)
      )
    );
  }, [data, searchQuery]);

  const sortedData = useMemo(() => {
    if (!sortKey) return filteredData;
    return [...filteredData].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (valA === null || valA === undefined) return 1;
      if (valB === null || valB === undefined) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      return sortOrder === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });
  }, [filteredData, sortKey, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleCopy = (text: string, cellId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell(cellId);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleExportCSV = () => {
    if (!sortedData.length) return;
    const keys = visibleColumns;
    const headerRow = keys.join(',');
    const rows = sortedData.map((row) =>
      keys.map((k) => `"${String(row[k] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headerRow, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${exportFilename}-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeCols = columns.filter((c) => visibleColumns.includes(String(c.key)));

  return (
    <div className="bg-white border border-stone-200/90 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
      {/* Table Header Bar */}
      {(title || subtitle || searchPlaceholder || actions) && (
        <div className="p-4 border-b border-stone-200/80 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#fbfbf9]/40">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-stone-900 tracking-tight flex items-center gap-2">
                <span>{title}</span>
                <span className="text-xs font-normal text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full border border-stone-200">
                  {filteredData.length} records
                </span>
              </h3>
            )}
            {subtitle && <p className="text-xs text-stone-500 mt-0.5">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Search input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={searchPlaceholder}
                className="w-full text-xs text-stone-800 bg-white border border-stone-200 rounded-md pl-8 pr-3 py-1.5 focus:border-stone-800 focus:outline-none placeholder:text-stone-400"
              />
            </div>

            {/* Column selector toggle */}
            <div className="relative">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowColMenu(!showColMenu)}
                leftIcon={<SlidersHorizontal className="w-3.5 h-3.5" />}
              >
                Columns
              </Button>
              {showColMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-white border border-stone-200 rounded-lg shadow-lg z-30 p-2 text-xs space-y-1">
                  <div className="font-semibold text-stone-700 px-2 py-1 border-b border-stone-100 mb-1">
                    Toggle Columns
                  </div>
                  {columns.map((col) => {
                    const keyStr = String(col.key);
                    const isChecked = visibleColumns.includes(keyStr);
                    return (
                      <label
                        key={keyStr}
                        className="flex items-center gap-2 px-2 py-1 hover:bg-stone-50 rounded cursor-pointer text-stone-700 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setVisibleColumns([...visibleColumns, keyStr]);
                            } else if (visibleColumns.length > 1) {
                              setVisibleColumns(visibleColumns.filter((c) => c !== keyStr));
                            }
                          }}
                          className="rounded border-stone-300 text-stone-900 focus:ring-stone-900"
                        />
                        <span className="truncate">{col.header}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Export CSV */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              leftIcon={<Download className="w-3.5 h-3.5" />}
            >
              Export CSV
            </Button>

            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                isLoading={isLoading}
                leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
              >
                Refresh
              </Button>
            )}

            {actions}
          </div>
        </div>
      )}

      {/* Table grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-stone-50/80 border-b border-stone-200 text-stone-600 font-semibold select-none">
              {activeCols.map((col) => {
                const keyStr = String(col.key);
                const isSorted = sortKey === keyStr;
                return (
                  <th
                    key={keyStr}
                    style={{ width: col.width }}
                    className={`py-2.5 px-3.5 tracking-tight font-medium ${
                      col.sortable !== false ? 'cursor-pointer hover:bg-stone-100/60' : ''
                    } ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    }`}
                    onClick={() => col.sortable !== false && handleSort(keyStr)}
                  >
                    <div
                      className={`inline-flex items-center gap-1.5 ${
                        col.align === 'right' ? 'justify-end w-full' : ''
                      }`}
                    >
                      <span>{col.header}</span>
                      {col.sortable !== false && (
                        <span className="text-stone-400">
                          {isSorted ? (
                            sortOrder === 'asc' ? (
                              <ChevronUp className="w-3 h-3 text-stone-900" />
                            ) : (
                              <ChevronDown className="w-3 h-3 text-stone-900" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3 h-3 opacity-40 hover:opacity-100" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 text-stone-800 font-normal bg-white">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {activeCols.map((col) => (
                    <td key={String(col.key)} className="py-3 px-3.5">
                      <div className="h-3.5 bg-stone-200/70 rounded w-4/5" />
                    </td>
                  ))}
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={activeCols.length} className="py-12 text-center text-stone-400">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, rIdx) => (
                <tr
                  key={rIdx}
                  className="hover:bg-stone-50/70 transition-colors group"
                >
                  {activeCols.map((col) => {
                    const keyStr = String(col.key);
                    const cellVal = row[keyStr];
                    const cellId = `${rIdx}_${keyStr}`;
                    const isCopied = copiedCell === cellId;

                    return (
                      <td
                        key={keyStr}
                        className={`py-2.5 px-3.5 text-stone-700 align-middle ${
                          col.isMonospace ? 'font-mono-code text-[11px]' : ''
                        } ${
                          col.align === 'right'
                            ? 'text-right'
                            : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                        }`}
                      >
                        {col.render ? (
                          col.render(row, rIdx)
                        ) : (
                          <div
                            className={`flex items-center gap-1.5 ${
                              col.align === 'right' ? 'justify-end' : ''
                            }`}
                          >
                            <span className="truncate max-w-xs">{String(cellVal ?? '—')}</span>
                            {cellVal !== undefined && cellVal !== null && (
                              <button
                                onClick={() => handleCopy(String(cellVal), cellId)}
                                title="Copy value"
                                className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-700 p-0.5 rounded transition-opacity"
                              >
                                {isCopied ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-stone-200 bg-[#fbfbf9]/60 flex items-center justify-between text-xs text-stone-500">
        <div className="flex items-center gap-2">
          <span>Rows per page:</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border border-stone-200 rounded px-1.5 py-0.5 bg-white text-stone-700 text-xs focus:outline-none"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span className="hidden sm:inline text-stone-400">|</span>
          <span className="hidden sm:inline">
            Showing {Math.min(filteredData.length, (currentPage - 1) * pageSize + 1)}–
            {Math.min(filteredData.length, currentPage * pageSize)} of {filteredData.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="p-1 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-2 text-stone-700 font-medium">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="p-1 rounded border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
