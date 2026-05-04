'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RotateCcw } from 'lucide-react';

export interface FilterConfig {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}

interface FilterBarProps {
  filters?: FilterConfig[];
  searchPlaceholder?: string;
  onFilterChange: (filters: Record<string, string>) => void;
}

export default function FilterBar({
  filters = [],
  searchPlaceholder = 'Search...',
  onFilterChange,
}: FilterBarProps) {
  const buildInitialValues = useCallback((): Record<string, string> => {
    const initial: Record<string, string> = { search: '' };
    filters.forEach(f => { initial[f.key] = f.defaultValue || ''; });
    return initial;
  }, [filters]);

  const [values, setValues] = useState<Record<string, string>>(buildInitialValues);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const onFilterChangeRef = useRef(onFilterChange);

  // Keep the callback ref up to date to avoid stale closures
  useEffect(() => {
    onFilterChangeRef.current = onFilterChange;
  }, [onFilterChange]);

  // Debounced search
  const handleSearchChange = (search: string) => {
    setValues(prev => {
      const newValues = { ...prev, search };
      if (debounceTimer) clearTimeout(debounceTimer);
      const timer = setTimeout(() => {
        onFilterChangeRef.current(newValues);
      }, 350);
      setDebounceTimer(timer);
      return newValues;
    });
  };

  // Immediate filter for dropdowns — use functional updater to avoid stale state
  const handleFilterChange = (key: string, value: string) => {
    setValues(prev => {
      const newValues = { ...prev, [key]: value };
      // Use setTimeout to ensure the state update is committed before notifying parent
      // This avoids React batching issues where the parent re-render uses stale closure values
      setTimeout(() => {
        onFilterChangeRef.current(newValues);
      }, 0);
      return newValues;
    });
  };

  const handleReset = () => {
    const initial = buildInitialValues();
    setValues(initial);
    onFilterChangeRef.current(initial);
  };

  const hasActiveFilters = values.search !== '' || filters.some(f => values[f.key] !== (f.defaultValue || ''));

  // Clean up timer on unmount
  useEffect(() => {
    return () => { if (debounceTimer) clearTimeout(debounceTimer); };
  }, [debounceTimer]);

  return (
    <div className="filter-bar">
      <div className="filter-search">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder={searchPlaceholder}
          value={values.search}
          onChange={(e) => handleSearchChange(e.target.value)}
        />
      </div>

      {filters.length > 0 && <div className="filter-divider" />}

      {filters.map(filter => (
        <div key={filter.key} className="filter-group">
          <label>{filter.label}</label>
          <select
            value={values[filter.key] || ''}
            onChange={(e) => handleFilterChange(filter.key, e.target.value)}
          >
            {filter.options.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}

      {hasActiveFilters && (
        <>
          <div className="filter-divider" />
          <button className="filter-reset" onClick={handleReset}>
            <RotateCcw size={12} />
            Reset
          </button>
        </>
      )}
    </div>
  );
}
