import { memo, useState, useRef, useEffect, useCallback } from 'react';
import DialogShell from './DialogShell';

interface SearchResultItem {
  type: 'project' | 'zone' | 'asset' | 'conduit';
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  project_name: string;
  zone_id: string | null;
  zone_name: string | null;
  highlight: string | null;
}

interface SearchResponseData {
  query: string;
  total: number;
  results: SearchResultItem[];
}

interface GlobalSearchDialogProps {
  onClose: () => void;
  onNavigateToProject: (projectId: string) => void;
}

const TYPE_ICONS: Record<string, string> = {
  project: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
  zone: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  asset: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z',
  conduit: 'M13 10V3L4 14h7v7l9-11h-7z',
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  project: {
    bg: 'bg-purple-100 dark:bg-purple-900/60',
    text: 'text-purple-700 dark:text-purple-300',
  },
  zone: {
    bg: 'bg-blue-100 dark:bg-blue-900/60',
    text: 'text-blue-700 dark:text-blue-300',
  },
  asset: {
    bg: 'bg-amber-100 dark:bg-amber-900/60',
    text: 'text-amber-700 dark:text-amber-300',
  },
  conduit: {
    bg: 'bg-green-100 dark:bg-green-900/60',
    text: 'text-green-700 dark:text-green-300',
  },
};

const TYPE_ORDER = ['project', 'zone', 'asset', 'conduit'] as const;

const GlobalSearchDialog = memo(({ onClose, onNavigateToProject }: GlobalSearchDialogProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Debounced search
  const performSearch = useCallback(async (searchQuery: string, searchType: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setLoading(true);
    setHasSearched(true);

    try {
      const token = localStorage.getItem('induform_access_token');
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        type: searchType,
        limit: '20',
      });
      const response = await fetch(`/api/search?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data: SearchResponseData = await response.json();
      setResults(data.results);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Trigger debounced search on query or type filter change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(query, typeFilter);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, typeFilter, performSearch]);

  // Group results by type for display
  const groupedResults = TYPE_ORDER.reduce<Record<string, SearchResultItem[]>>((acc, type) => {
    const items = results.filter(r => r.type === type);
    if (items.length > 0) {
      acc[type] = items;
    }
    return acc;
  }, {});

  // Flat list for keyboard navigation
  const flatResults = TYPE_ORDER.flatMap(type => groupedResults[type] || []);

  const handleSelect = useCallback((result: SearchResultItem) => {
    onNavigateToProject(result.project_id);
    onClose();
  }, [onNavigateToProject, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (flatResults.length > 0 && resultsRef.current) {
      const selectedItem = resultsRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      selectedItem?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, flatResults.length]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (flatResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex]);
        }
        break;
    }
  }, [flatResults, selectedIndex, handleSelect]);

  let flatIndex = 0;

  return (
    <DialogShell title="Search All Projects" onClose={onClose} maxWidth="max-w-2xl">
      <div className="px-6 py-4">
        {/* Search input */}
        <div className="relative mb-3">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search zones, assets, conduits, projects..."
            className="w-full pl-10 pr-4 py-3 bg-gray-100 dark:bg-slate-700/50 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-800 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {/* Type filter tabs */}
        <div className="flex gap-1 mb-3 overflow-x-auto">
          {[
            { value: 'all', label: 'All' },
            { value: 'project', label: 'Projects' },
            { value: 'zone', label: 'Zones' },
            { value: 'asset', label: 'Assets' },
            { value: 'conduit', label: 'Conduits' },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTypeFilter(value)}
              className={`px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap ${
                typeFilter === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-slate-700/50 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          className="max-h-[60vh] overflow-y-auto -mx-2"
        >
          {/* Loading state */}
          {loading && !hasSearched && (
            <div className="py-8 text-center">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
              <div className="text-sm text-gray-500 dark:text-slate-400">Searching...</div>
            </div>
          )}

          {/* No query state */}
          {!query.trim() && !hasSearched && (
            <div className="py-8 text-center">
              <svg
                className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-slate-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <div className="text-sm text-gray-500 dark:text-slate-400">
                Type to search across all your projects
              </div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Search by name, ID, IP address, vendor, or description
              </div>
            </div>
          )}

          {/* No results state */}
          {hasSearched && !loading && flatResults.length === 0 && query.trim() && (
            <div className="py-8 text-center">
              <div className="text-sm text-gray-500 dark:text-slate-400">
                No results found for "{query}"
              </div>
              <div className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                Try a different search term or adjust the type filter
              </div>
            </div>
          )}

          {/* Grouped results */}
          {TYPE_ORDER.map(type => {
            const items = groupedResults[type];
            if (!items) return null;

            const typeLabel = {
              project: 'Projects',
              zone: 'Zones',
              asset: 'Assets',
              conduit: 'Conduits',
            }[type];

            return (
              <div key={type} className="mb-2">
                <div className="px-2 py-1.5 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider">
                  {typeLabel} ({items.length})
                </div>
                {items.map(result => {
                  const currentIndex = flatIndex++;
                  const isSelected = currentIndex === selectedIndex;
                  const colors = TYPE_COLORS[result.type];

                  return (
                    <button
                      key={`${result.type}-${result.id}-${result.project_id}`}
                      data-index={currentIndex}
                      onClick={() => handleSelect(result)}
                      className={`w-full px-3 py-2.5 text-left flex items-start gap-3 rounded-lg mx-1 transition-colors ${
                        isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30'
                          : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                      }`}
                    >
                      {/* Type icon */}
                      <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${colors.bg}`}>
                        <svg className={`w-4 h-4 ${colors.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TYPE_ICONS[result.type]} />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
                            {result.name}
                          </span>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${colors.bg} ${colors.text}`}>
                            {result.type}
                          </span>
                        </div>

                        {/* Description / highlight */}
                        {(result.highlight || result.description) && (
                          <div className="text-xs text-gray-500 dark:text-slate-400 truncate">
                            {result.highlight || result.description}
                          </div>
                        )}

                        {/* Project context */}
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400 dark:text-slate-500">
                          <span className="truncate">{result.project_name}</span>
                          {result.zone_name && (
                            <>
                              <span>{'>'}</span>
                              <span className="truncate">{result.zone_name}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Navigate indicator */}
                      {isSelected && (
                        <div className="flex-shrink-0 self-center">
                          <svg className="w-4 h-4 text-gray-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer with keyboard hints */}
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between text-xs text-gray-400 dark:text-slate-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-xs">
                Up/Down
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-xs">
                Enter
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded text-xs">
                Esc
              </kbd>
              close
            </span>
          </div>
          <div>
            {flatResults.length > 0 && (
              <span>{flatResults.length} result{flatResults.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>
      </div>
    </DialogShell>
  );
});

GlobalSearchDialog.displayName = 'GlobalSearchDialog';

export default GlobalSearchDialog;
