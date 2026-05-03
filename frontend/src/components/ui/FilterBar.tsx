'use client';

import { useState, useEffect, useCallback } from 'react';
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
  const getInitialValues = useCallback(() => {
    const initial: Record<string, string> = { search: '' };
    filters.forEach(f => { initial[f.key] = f.defaultValue || ''; });
    return initial;
  }, [filters]);

  const [values, setValues] = useState<Record<string, string>>(getInitialValues);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  // Debounced search
  const handleSearchChange = (search: string) => {
    const newValues = { ...values, search };
    setValues(newValues);

    if (debounceTimer) clearTimeout(debounceTimer);
    const timer = setTimeout(() => {
      onFilterChange(newValues);
    }, 350);
    setDebounceTimer(timer);
  };

  // Immediate filter for dropdowns
  const handleFilterChange = (key: string, value: string) => {
    const newValues = { ...values, [key]: value };
    setValues(newValues);
    onFilterChange(newValues);
  };

  const handleReset = () => {
    const initial = getInitialValues();
    setValues(initial);
    onFilterChange(initial);
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
