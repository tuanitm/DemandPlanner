'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { Download, Search, Loader2 } from 'lucide-react';
// XLSX is dynamically imported when needed to avoid OOM in dev
import { dashboardApi, MonthlyComparisonRow } from '../../../lib/api';

// Types for the flat matrix
type MonthMetrics = { forecast: number, actual: number, variance: number };
interface FlatRow {
  key: string;
  brand: string;
  productGroup: string;
  itemCode: string;
  itemName: string;
  warehouseCode: string;
  warehouseName: string;
  warehouseRegion: string;
  months: Record<string, MonthMetrics>;
}

const tooltipStyle = {
  backgroundColor: 'rgba(30, 41, 59, 0.8)',
  backdropFilter: 'blur(8px)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#f1f5f9',
};

const filterInputStyle: React.CSSProperties = {
  padding: '8px 12px 8px 36px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-sm)',
  minWidth: 220,
  outline: 'none',
};

export default function MonthlyComparisonPage() {
  const [yearFilter, setYearFilter] = useState<number>(new Date().getFullYear());
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [productGroupFilter, setProductGroupFilter] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState<string>('');
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  // Data from API
  const [rawData, setRawData] = useState<MonthlyComparisonRow[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [productGroups, setProductGroups] = useState<{ code: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ALL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Fetch data from API when year changes
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await dashboardApi.monthlyComparison({ year: yearFilter });
        setRawData(res.data);
        setBrands(res.brands);
        setProductGroups(res.product_groups);
      } catch (e: any) {
        setError(e.message || 'Failed to load data');
        setRawData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [yearFilter]);

  // Filter available product groups based on selected brands
  const filteredProductGroups = useMemo(() => {
    if (brandFilter.length === 0) return productGroups;
    const groupsFromData = new Set(
      rawData.filter(d => brandFilter.includes(d.brand)).map(d => d.product_group)
    );
    return productGroups.filter(pg => groupsFromData.has(pg.name));
  }, [productGroups, brandFilter, rawData]);

  // Reset product group filter if it becomes invalid
  useEffect(() => {
    if (productGroupFilter.length > 0) {
      const validNames = filteredProductGroups.map(pg => pg.name);
      const validGroups = productGroupFilter.filter(g => validNames.includes(g));
      if (validGroups.length !== productGroupFilter.length) setProductGroupFilter(validGroups);
    }
  }, [filteredProductGroups, productGroupFilter]);

  // Apply client-side filters (month, brand, group, search)
  const filteredData = useMemo(() => {
    return rawData.filter(item => {
      if (monthFilter.length > 0 && !monthFilter.includes(item.month_name)) return false;
      if (brandFilter.length > 0 && !brandFilter.includes(item.brand)) return false;
      if (productGroupFilter.length > 0 && !productGroupFilter.includes(item.product_group)) return false;
      if (skuSearch) {
        const q = skuSearch.toLowerCase();
        if (!item.item_code.toLowerCase().includes(q) && !item.item_name.toLowerCase().includes(q) && !item.brand.toLowerCase().includes(q) && !item.product_group.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rawData, monthFilter, brandFilter, productGroupFilter, skuSearch]);

  // Build flat SKU-level rows for the matrix
  const flatRows = useMemo(() => {
    const map = new Map<string, FlatRow>();
    const getEmptyMonths = () => {
      const m: Record<string, MonthMetrics> = {};
      ALL_MONTHS.forEach(mon => m[mon] = { forecast: 0, actual: 0, variance: 0 });
      return m;
    };

    filteredData.forEach(row => {
      const key = `${row.brand}|${row.product_group}|${row.item_code}|${row.warehouse_code}`;
      if (!map.has(key)) {
        map.set(key, {
          key, brand: row.brand, productGroup: row.product_group, itemCode: row.item_code, itemName: row.item_name,
          warehouseCode: row.warehouse_code, warehouseName: row.warehouse_name, warehouseRegion: row.warehouse_region,
          months: getEmptyMonths(),
        });
      }
      const entry = map.get(key)!;
      entry.months[row.month_name].forecast += row.forecast;
      entry.months[row.month_name].actual += row.actual;
      entry.months[row.month_name].variance = entry.months[row.month_name].actual - entry.months[row.month_name].forecast;
    });

    return [...map.values()].sort((a, b) => a.brand.localeCompare(b.brand) || a.productGroup.localeCompare(b.productGroup) || a.itemCode.localeCompare(b.itemCode));
  }, [filteredData]);

  // Aggregate for the Chart & KPIs
  const monthlyAggregated = useMemo(() => {
    const displayMonths = monthFilter.length > 0 ? ALL_MONTHS.filter(m => monthFilter.includes(m)) : ALL_MONTHS;
    return displayMonths.map(month => {
      let forecast = 0; let actual = 0;
      flatRows.forEach(row => {
        forecast += row.months[month].forecast;
        actual += row.months[month].actual;
      });
      const variance = actual - forecast;
      const fa = forecast > 0 ? Math.max(0, 100 - (Math.abs(forecast - actual) / forecast) * 100) : 0;
      return { month, forecast, actual, variance, fa: Number(fa.toFixed(1)) };
    });
  }, [flatRows, monthFilter]);

  const avgFA = monthlyAggregated.length > 0 ? (monthlyAggregated.reduce((s, d) => s + d.fa, 0) / monthlyAggregated.length).toFixed(1) : '0.0';
  const totalForecast = monthlyAggregated.reduce((s, d) => s + d.forecast, 0);
  const totalActual = monthlyAggregated.reduce((s, d) => s + d.actual, 0);
  const bias = totalActual > 0 ? (((totalForecast - totalActual) / totalActual) * 100).toFixed(1) : '0.0';

  // Months to display
  const displayMonths = useMemo(() =>
    monthFilter.length > 0 ? ALL_MONTHS.filter(m => monthFilter.includes(m)) : ALL_MONTHS,
  [monthFilter]);

  const handleExportExcel = useCallback(async () => {
    const XLSX = await import('xlsx-js-style');
    const headerRow1 = ['Brand', 'Product Group', 'Item Code', 'Item Name', 'Warehouse', 'Region'];
    const headerRow2 = ['', '', '', '', '', ''];
    const merges = [
      { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } }, { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } }, { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
      { s: { r: 0, c: 3 }, e: { r: 1, c: 3 } }, { s: { r: 0, c: 4 }, e: { r: 1, c: 4 } }, { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }
    ];
    
    displayMonths.forEach((m, idx) => {
      const startCol = 6 + (idx * 4);
      merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + 3 } });
      headerRow1.push(m, '', '', '');
      headerRow2.push('Forecast', 'Actual', 'Variance', 'FA%');
    });
    
    const aoa = [headerRow1, headerRow2];
    
    flatRows.forEach(row => {
      const rowData: any[] = [
        row.brand, row.productGroup, row.itemCode, row.itemName,
        row.warehouseName, row.warehouseRegion
      ];
      displayMonths.forEach(m => {
        const cell = row.months[m] || { forecast: 0, actual: 0, variance: 0 };
        const fa = cell.forecast > 0 ? Math.max(0, 100 - (Math.abs(cell.forecast - cell.actual) / cell.forecast) * 100) : 0;
        rowData.push(cell.forecast, cell.actual, cell.variance, Number(fa.toFixed(1)));
      });
      aoa.push(rowData);
    });
    
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    
    const cols = [{ wch: 20 }, { wch: 22 }, { wch: 15 }, { wch: 30 }, { wch: 20 }, { wch: 12 }];
    for(let i=0; i<displayMonths.length * 4; i++) cols.push({ wch: 12 });
    ws['!cols'] = cols;

    const colCount = 6 + displayMonths.length * 4;
    for (let c = 0; c < colCount; c++) {
      const cell1 = XLSX.utils.encode_cell({ r: 0, c });
      const cell2 = XLSX.utils.encode_cell({ r: 1, c });
      if (ws[cell1]) ws[cell1].s = { font: { bold: true }, alignment: { horizontal: 'center' } };
      if (ws[cell2]) ws[cell2].s = { font: { bold: true, color: { rgb: '555555' } }, alignment: { horizontal: 'center' } };
    }

    const numFmt = '#,##0';
    flatRows.forEach((row, rowIdx) => {
      const dataRow = rowIdx + 2;
      displayMonths.forEach((m, mIdx) => {
        const forecastCol = 6 + (mIdx * 4);
        const actualCol = forecastCol + 1;
        const varianceCol = forecastCol + 2;
        const faCol = forecastCol + 3;
        const cell = row.months[m] || { forecast: 0, actual: 0, variance: 0 };

        const fcRef = XLSX.utils.encode_cell({ r: dataRow, c: forecastCol });
        if (ws[fcRef]) ws[fcRef].s = { numFmt };

        const acRef = XLSX.utils.encode_cell({ r: dataRow, c: actualCol });
        if (ws[acRef]) ws[acRef].s = { numFmt };

        const vrRef = XLSX.utils.encode_cell({ r: dataRow, c: varianceCol });
        if (ws[vrRef]) {
          ws[vrRef].s = { numFmt, font: { bold: true, color: { rgb: cell.variance >= 0 ? '22C55E' : 'EF4444' } } };
        }

        const faRef = XLSX.utils.encode_cell({ r: dataRow, c: faCol });
        if (ws[faRef]) {
          const faVal = cell.forecast > 0 ? Math.max(0, 100 - (Math.abs(cell.forecast - cell.actual) / cell.forecast) * 100) : 0;
          ws[faRef].s = { numFmt: '0.0"%"', font: { bold: true, color: { rgb: faVal >= 80 ? '22C55E' : faVal >= 60 ? 'F59E0B' : 'EF4444' } } };
        }
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Drill-Down Matrix');
    XLSX.writeFile(wb, `Monthly_Matrix_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [flatRows, displayMonths]);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Forecast vs Actual</h1>
          <p className="page-description">Year-over-year comparison to detect seasonality and forecast gaps</p>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          
          <select 
            className="form-input form-select"
            style={{ width: 100 }}
            value={yearFilter}
            onChange={e => setYearFilter(Number(e.target.value))}
          >
            {[new Date().getFullYear(), new Date().getFullYear() - 1, new Date().getFullYear() - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <div style={{ position: 'relative' }}>
            <div 
              className="form-input form-select" 
              style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setShowMonthDropdown(!showMonthDropdown); setShowBrandDropdown(false); setShowGroupDropdown(false); }}
            >
              {monthFilter.length > 0 ? `${monthFilter.length} Months Selected` : 'All Months'}
            </div>
            {showMonthDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 300, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {ALL_MONTHS.map(m => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={monthFilter.includes(m)}
                      onChange={e => {
                        const next = e.target.checked ? [...monthFilter, m] : monthFilter.filter(x => x !== m);
                        setMonthFilter(next);
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{m}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <div 
              className="form-input form-select" 
              style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setShowBrandDropdown(!showBrandDropdown); setShowGroupDropdown(false); setShowMonthDropdown(false); }}
            >
              {brandFilter.length > 0 ? `${brandFilter.length} Brands Selected` : 'All Brands'}
            </div>
            {showBrandDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {brands.map(b => (
                  <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={brandFilter.includes(b)}
                      onChange={e => {
                        const nb = e.target.checked ? [...brandFilter, b] : brandFilter.filter(x => x !== b);
                        setBrandFilter(nb);
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{b}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <div 
              className="form-input form-select" 
              style={{ width: 200, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setShowGroupDropdown(!showGroupDropdown); setShowBrandDropdown(false); setShowMonthDropdown(false); }}
            >
              {productGroupFilter.length > 0 ? `${productGroupFilter.length} Groups Selected` : 'All Product Groups'}
            </div>
            {showGroupDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {filteredProductGroups.map(pg => (
                  <label key={pg.code} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={productGroupFilter.includes(pg.name)}
                      onChange={e => {
                        const nc = e.target.checked ? [...productGroupFilter, pg.name] : productGroupFilter.filter(x => x !== pg.name);
                        setProductGroupFilter(nc);
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{pg.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search items..."
              value={skuSearch}
              onChange={e => setSkuSearch(e.target.value)}
              style={filterInputStyle}
            />
          </div>

          {(monthFilter.length > 0 || brandFilter.length > 0 || productGroupFilter.length > 0 || skuSearch) && (
            <button
              onClick={() => { setMonthFilter([]); setBrandFilter([]); setProductGroupFilter([]); setSkuSearch(''); }}
              style={{
                padding: '8px 14px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-md)',
                color: '#ef4444',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.15s ease',
              }}
            >
              Clear Filters
            </button>
          )}

          <button className="btn btn-primary" onClick={handleExportExcel} disabled={loading || flatRows.length === 0}>
            <Download size={16} style={{ marginRight: 8 }} /> Export Matrix
          </button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-12)', gap: 'var(--space-3)' }}>
          <Loader2 size={24} className="spin" style={{ animation: 'spin 1s linear infinite' }} />
          <span style={{ color: 'var(--color-text-muted)' }}>Loading forecast vs actual data...</span>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-danger)' }}>
          <p>Failed to load data: {error}</p>
          <button className="btn btn-primary" onClick={() => setYearFilter(yearFilter)} style={{ marginTop: 'var(--space-4)' }}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Summary KPIs */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="kpi-card" style={{ '--kpi-color': '#6366f1' } as React.CSSProperties}>
              <div className="kpi-label">Average FA%</div>
              <div className="kpi-value">{avgFA}%</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': '#22c55e' } as React.CSSProperties}>
              <div className="kpi-label">Total Actual Sales</div>
              <div className="kpi-value">{(totalActual / 1000).toFixed(0)}K</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': parseFloat(bias) > 0 ? '#f59e0b' : '#22c55e' } as React.CSSProperties}>
              <div className="kpi-label">Forecast Bias</div>
              <div className="kpi-value">{bias}%</div>
              <div className="card-subtitle" style={{ marginTop: 4 }}>
                {parseFloat(bias) > 0 ? 'Over-forecasting' : 'Under-forecasting'}
              </div>
            </div>
          </div>

          {/* Chart */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-header">
              <div>
                <div className="card-title">Forecast vs Actual by Month</div>
                <div className="card-subtitle">Aggregated totals based on applied filters</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              <ComposedChart data={monthlyAggregated} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.5} />
                  </linearGradient>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.9} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.5} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#94a3b8' }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} unit="%" />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="forecast" name="Forecast" fill="url(#colorForecast)" radius={[4, 4, 0, 0]} />
                <Bar yAxisId="left" dataKey="actual" name="Actual" fill="url(#colorActual)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="fa" name="FA%" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6, strokeWidth: 0 }} style={{ filter: 'drop-shadow(0px 4px 6px rgba(245,158,11,0.4))' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly Matrix Detail */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-header">
              <div className="card-title">Monthly Matrix Detail</div>
              <div className="card-subtitle">SKU-level forecast vs actual by month. Scroll horizontally for months.</div>
            </div>
            
            <div style={{ overflowX: 'auto', maxWidth: '100%', paddingBottom: 'var(--space-2)' }}>
              <table className="data-table" style={{ minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={{ minWidth: 160 }}>Brand</th>
                    <th rowSpan={2} style={{ minWidth: 160 }}>Product Group</th>
                    <th rowSpan={2} style={{ minWidth: 120 }}>Item Code</th>
                    <th rowSpan={2} style={{ minWidth: 200 }}>Item Name</th>
                    <th rowSpan={2} style={{ textAlign: 'center', minWidth: 140 }}>Warehouse</th>
                    <th rowSpan={2} style={{ textAlign: 'center', minWidth: 90 }}>Region</th>
                    {displayMonths.map(m => (
                      <th colSpan={4} key={m} style={{ textAlign: 'center', borderLeft: '1px solid var(--color-border)' }}>{m}</th>
                    ))}
                  </tr>
                  <tr>
                    {displayMonths.map(m => (
                      <React.Fragment key={`${m}-sub`}>
                        <th style={{ borderLeft: '1px solid var(--color-border)', fontSize: '11px', color: 'var(--color-text-muted)' }}>Forecast</th>
                        <th style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Actual</th>
                        <th style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>Variance</th>
                        <th style={{ fontSize: '11px', color: '#f59e0b' }}>FA%</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flatRows.map(row => (
                    <tr key={row.key} style={{ transition: 'background 0.2s', borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ borderBottom: '1px solid var(--color-border)' }}>{row.brand}</td>
                      <td style={{ borderBottom: '1px solid var(--color-border)' }}>{row.productGroup}</td>
                      <td style={{ borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem', fontWeight: 500 }}>{row.itemCode}</td>
                      <td style={{ borderBottom: '1px solid var(--color-border)', fontSize: '0.8125rem', color: 'var(--color-text-primary)' }}>{row.itemName}</td>
                      <td style={{ textAlign: 'center', fontSize: '0.8125rem', borderBottom: '1px solid var(--color-border)' }}>
                        {row.warehouseName}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: '0.8125rem', borderBottom: '1px solid var(--color-border)' }}>{row.warehouseRegion}</td>
                      {displayMonths.map(m => {
                        const cell = row.months[m] || { forecast: 0, actual: 0, variance: 0 };
                        const fa = cell.forecast > 0 ? Math.max(0, 100 - (Math.abs(cell.forecast - cell.actual) / cell.forecast) * 100) : 0;
                        return (
                          <React.Fragment key={`${row.key}-${m}`}>
                            <td style={{ borderLeft: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'rgba(255,255,255,0.01)' }}>{cell.forecast.toLocaleString()}</td>
                            <td style={{ borderBottom: '1px solid var(--color-border)' }}>{cell.actual.toLocaleString()}</td>
                            <td style={{ borderBottom: '1px solid var(--color-border)', color: cell.variance >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
                              {cell.variance >= 0 ? '+' : ''}{cell.variance.toLocaleString()}
                            </td>
                            <td style={{ borderBottom: '1px solid var(--color-border)', color: fa >= 80 ? '#22c55e' : fa >= 60 ? '#f59e0b' : '#ef4444', fontWeight: 600, textAlign: 'right' }}>
                              {fa.toFixed(1)}%
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                  {flatRows.length === 0 && (
                    <tr>
                    <td colSpan={6 + displayMonths.length * 4} style={{ textAlign: 'center', padding: 'var(--space-8)' }}>No data available for the selected filters.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
