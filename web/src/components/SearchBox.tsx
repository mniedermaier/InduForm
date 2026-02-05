import { memo, useState, useRef, useEffect, useMemo } from 'react';
import type { Zone, Conduit, ZoneType } from '../types/models';
import { ZONE_TYPE_CONFIG } from '../types/models';

interface SearchResult {
  type: 'zone' | 'conduit' | 'asset';
  id: string;
  name: string;
  description?: string;
  zoneId?: string; // For assets
  zone?: Zone;
  conduit?: Conduit;
}

interface FilterState {
  types: ZoneType[];
  securityLevels: number[];
  showOnlyWithAssets: boolean;
}

interface SearchBoxProps {
  zones: Zone[];
  conduits: Conduit[];
  onSelectZone: (zone: Zone) => void;
  onSelectConduit: (conduit: Conduit) => void;
}

const SearchBox = memo(({
  zones,
  conduits,
  onSelectZone,
  onSelectConduit,
}: SearchBoxProps) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    securityLevels: [],
    showOnlyWithAssets: false,
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters = useMemo(() =>
    filters.types.length > 0 ||
    filters.securityLevels.length > 0 ||
    filters.showOnlyWithAssets,
  [filters]);

  // Build search results
  const results: SearchResult[] = [];

  const shouldSearch = query.trim().length > 0 || hasActiveFilters;

  if (shouldSearch) {
    const q = query.toLowerCase();

    // Search zones
    zones.forEach(zone => {
      // Apply type filter
      if (filters.types.length > 0 && !filters.types.includes(zone.type)) {
        return;
      }

      // Apply security level filter
      if (filters.securityLevels.length > 0 && !filters.securityLevels.includes(zone.security_level_target)) {
        return;
      }

      // Apply "only with assets" filter
      if (filters.showOnlyWithAssets && zone.assets.length === 0) {
        return;
      }

      // Apply text search
      const matchesQuery = !q || (
        zone.id.toLowerCase().includes(q) ||
        zone.name.toLowerCase().includes(q) ||
        zone.description?.toLowerCase().includes(q)
      );

      if (matchesQuery) {
        results.push({
          type: 'zone',
          id: zone.id,
          name: zone.name,
          description: `${ZONE_TYPE_CONFIG[zone.type].label} - SL ${zone.security_level_target}${zone.assets.length > 0 ? ` - ${zone.assets.length} assets` : ''}`,
          zone,
        });
      }

      // Search assets within zones (only if text query is present)
      if (q) {
        zone.assets.forEach(asset => {
          if (
            asset.id.toLowerCase().includes(q) ||
            asset.name.toLowerCase().includes(q) ||
            asset.ip_address?.toLowerCase().includes(q) ||
            asset.vendor?.toLowerCase().includes(q)
          ) {
            results.push({
              type: 'asset',
              id: asset.id,
              name: asset.name,
              description: `${asset.type} in ${zone.name}`,
              zoneId: zone.id,
              zone,
            });
          }
        });
      }
    });

    // Search conduits (only if text query is present or no zone filters are active)
    if (q || (filters.types.length === 0 && filters.securityLevels.length === 0 && !filters.showOnlyWithAssets)) {
      conduits.forEach(conduit => {
        const fromZone = zones.find(z => z.id === conduit.from_zone);
        const toZone = zones.find(z => z.id === conduit.to_zone);

        const matchesQuery = !q || (
          conduit.id.toLowerCase().includes(q) ||
          conduit.name?.toLowerCase().includes(q) ||
          conduit.flows.some(f => f.protocol.toLowerCase().includes(q))
        );

        if (matchesQuery) {
          results.push({
            type: 'conduit',
            id: conduit.id,
            name: conduit.name || conduit.id,
            description: `${fromZone?.name || conduit.from_zone} → ${toZone?.name || conduit.to_zone}`,
            conduit,
          });
        }
      });
    }
  }

  // Limit results
  const limitedResults = results.slice(0, 10);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || limitedResults.length === 0) {
      if (e.key === 'Escape') {
        setQuery('');
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, limitedResults.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        selectResult(limitedResults[selectedIndex]);
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
    }
  };

  const selectResult = (result: SearchResult) => {
    if (result.type === 'zone' && result.zone) {
      onSelectZone(result.zone);
    } else if (result.type === 'conduit' && result.conduit) {
      onSelectConduit(result.conduit);
    } else if (result.type === 'asset' && result.zone) {
      // Select the zone containing the asset
      onSelectZone(result.zone);
    }
    setQuery('');
    setIsOpen(false);
    inputRef.current?.blur();
  };

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        filterRef.current &&
        !filterRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTypeFilter = (type: ZoneType) => {
    setFilters(prev => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type],
    }));
  };

  const toggleSecurityLevel = (level: number) => {
    setFilters(prev => ({
      ...prev,
      securityLevels: prev.securityLevels.includes(level)
        ? prev.securityLevels.filter(l => l !== level)
        : [...prev.securityLevels, level],
    }));
  };

  const clearFilters = () => {
    setFilters({
      types: [],
      securityLevels: [],
      showOnlyWithAssets: false,
    });
  };

  return (
    <div className="relative flex items-center gap-1">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search zones, conduits, assets..."
          className="w-64 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {/* Filter button */}
      <button
        onClick={() => setShowFilters(!showFilters)}
        className={`p-1.5 rounded-md transition-colors ${
          hasActiveFilters
            ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        title={hasActiveFilters ? 'Filters active' : 'Show filters'}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        {hasActiveFilters && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full"></span>
        )}
      </button>

      {/* Filter dropdown */}
      {showFilters && (
        <div
          ref={filterRef}
          className="absolute top-full right-0 mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-3 px-4 z-50"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Filters</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Zone Type Filter */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Zone Type
            </label>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(ZONE_TYPE_CONFIG) as ZoneType[]).map(type => (
                <button
                  key={type}
                  onClick={() => toggleTypeFilter(type)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    filters.types.includes(type)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {ZONE_TYPE_CONFIG[type].label}
                </button>
              ))}
            </div>
          </div>

          {/* Security Level Filter */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Security Level
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map(level => (
                <button
                  key={level}
                  onClick={() => toggleSecurityLevel(level)}
                  className={`w-8 h-8 text-xs rounded flex items-center justify-center font-medium transition-colors ${
                    filters.securityLevels.includes(level)
                      ? level === 1 ? 'bg-green-600 text-white' :
                        level === 2 ? 'bg-yellow-500 text-white' :
                        level === 3 ? 'bg-orange-500 text-white' :
                        'bg-red-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  SL{level}
                </button>
              ))}
            </div>
          </div>

          {/* Additional Filters */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.showOnlyWithAssets}
                onChange={(e) => setFilters(prev => ({ ...prev, showOnlyWithAssets: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Only zones with assets</span>
            </label>
          </div>
        </div>
      )}

      {isOpen && limitedResults.length > 0 && !showFilters && (
        <div
          ref={resultsRef}
          className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50 max-h-80 overflow-y-auto"
        >
          {limitedResults.map((result, index) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => selectResult(result)}
              className={`w-full px-3 py-2 text-left flex items-start gap-2 ${
                index === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <span className={`px-1.5 py-0.5 text-xs rounded ${
                result.type === 'zone'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : result.type === 'conduit'
                  ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}>
                {result.type}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                  {result.name}
                </div>
                {result.description && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {result.description}
                  </div>
                )}
              </div>
            </button>
          ))}
          {results.length > 10 && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t dark:border-gray-700">
              Showing 10 of {results.length} results
            </div>
          )}
        </div>
      )}

      {isOpen && shouldSearch && limitedResults.length === 0 && !showFilters && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-3 px-4 z-50">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {hasActiveFilters ? 'No zones match the selected filters' : 'No results found'}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
});

SearchBox.displayName = 'SearchBox';

export default SearchBox;
