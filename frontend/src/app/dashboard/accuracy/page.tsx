'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { forecastApi, AccuracySummaryItem, masterDataApi, ProductHierarchy } from '@/lib/api';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { AlertTriangle, Search, Download, Loader2 } from 'lucide-react';
import XLSX from 'xlsx-js-style';

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#f1f5f9',
};

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: AccuracySummaryItem }> }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div style={{ ...tooltipStyle, padding: '12px' }}>
        <div>SKU Code: <strong>{d.item_code}</strong></div>
        <div>SKU Name: <strong>{d.item_name}</strong></div>
        <div>Brand: <strong>{d.brand}</strong></div>
        <div>Product Group: <strong>{d.product_group}</strong></div>
        <div>Forecast Qty: <strong>{d.forecast_qty.toLocaleString()}</strong></div>
        <div>Actual Qty: <strong>{d.actual_qty.toLocaleString()}</strong></div>
        <div>FA%: <strong>{d.fa_percent}%</strong></div>
      </div>
    );
  }
  return null;
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

const CURRENT_YEAR = new Date().getFullYear();
const ALL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function ForecastAccuracyPage() {
  const [yearFilter, setYearFilter] = useState(CURRENT_YEAR);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [productGroupFilter, setProductGroupFilter] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState<string>('');
  const [hierarchy, setHierarchy] = useState<ProductHierarchy[]>([]);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  // API data
  const [accuracyData, setAccuracyData] = useState<AccuracySummaryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [overallFa, setOverallFa] = useState(0);

  const closeAllDd = () => { setShowMonthDropdown(false); setShowBrandDropdown(false); setShowGroupDropdown(false); };

  // Fetch product hierarchy from master data on mount
  useEffect(() => {
    const fetchAll = async () => {
      try {
        let all: ProductHierarchy[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.productHierarchy.list({ page: p, page_size: 100 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setHierarchy(all);
      } catch (e) {}
    };
    fetchAll();
  }, []);

  // Fetch accuracy data from API when filters change
  useEffect(() => {
    const fetchAccuracy = async () => {
      setLoading(true);
      try {
        // Convert month names to month numbers
        const monthNumbers = monthFilter.length > 0
          ? monthFilter.map(m => ALL_MONTHS.indexOf(m) + 1)
          : undefined;

        const res = await forecastApi.accuracySummary({
          year: yearFilter,
          month: monthNumbers,
          brand: brandFilter.length > 0 ? brandFilter : undefined,
          product_group: productGroupFilter.length > 0 ? productGroupFilter : undefined,
          search: skuSearch || undefined,
        });

        setAccuracyData(res.items);
        setOverallFa(res.overall_fa);
      } catch (e) {
        console.error('Failed to load accuracy data:', e);
        setAccuracyData([]);
        setOverallFa(0);
      } finally {
        setLoading(false);
      }
    };
    fetchAccuracy();
  }, [yearFilter, monthFilter, brandFilter, productGroupFilter, skuSearch]);

  // Derive brands from hierarchy
  const brands = useMemo(() =>
    [...new Set(hierarchy.map(h => h.brand))].filter(Boolean).sort(),
  [hierarchy]);

  // Filter product groups based on selected brand
  const productGroups = useMemo(() => {
    const source = brandFilter.length > 0
      ? hierarchy.filter(h => brandFilter.includes(h.brand))
      : hierarchy;
    return [...new Set(source.map(h => h.item_group_name))].filter(Boolean).sort();
  }, [brandFilter, hierarchy]);

  // Reset product group filter when brand changes and the selected groups are no longer valid
  useEffect(() => {
    if (productGroupFilter.length > 0) {
      const validGroups = productGroupFilter.filter(g => productGroups.includes(g));
      if (validGroups.length !== productGroupFilter.length) {
        setProductGroupFilter(validGroups);
      }
    }
  }, [productGroups, productGroupFilter]);

  // The API already handles filtering, so filteredData = accuracyData
  const filteredData = accuracyData;

  const volThreshold = filteredData.length > 0
    ? Math.round(filteredData.reduce((sum, d) => sum + d.forecast_qty, 0) / filteredData.length * 0.5)
    : 5000;
  const maxVol = filteredData.length > 0 ? Math.max(...filteredData.map(d => d.forecast_qty)) * 1.2 : 20000;
  const criticalItems = filteredData.filter(d => d.fa_percent < 50 && d.forecast_qty > volThreshold);

  const handleExportExcel = useCallback(() => {
    const sortedData = [...filteredData].sort((a, b) => a.fa_percent - b.fa_percent);
    const exportRows = sortedData.map(item => ({
        'SKU Code': item.item_code,
        'SKU Name': item.item_name,
        'Brand': item.brand,
        'Product Group': item.product_group,
        'Forecast Qty': item.forecast_qty,
        'Actual Qty': item.actual_qty,
        'Variance': item.variance,
        'FA%': item.fa_percent,
        'Priority': item.zone === 'critical' ? 'Critical' : item.zone === 'watch' ? 'Watch' : 'Good',
        'Action Needed': item.zone === 'critical' ? 'Review model & input data' : item.zone === 'watch' ? 'Monitor next cycle' : '—',
      }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const colWidths = [
      { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 28 },
    ];
    ws['!cols'] = colWidths;

    // Apply font colors to FA% (col G) and Priority (col H)
    const faColIdx = 7;
    const priorityColIdx = 8;
    const getFAColor = (fa: number) => {
      if (fa >= 70) return '22C55E';
      if (fa >= 50) return 'F59E0B';
      return 'EF4444';
    };
    const getPriorityColor = (zone: string) => {
      if (zone === 'critical') return 'EF4444';
      if (zone === 'watch') return 'F59E0B';
      return '22C55E';
    };

    sortedData.forEach((item, rowIdx) => {
      const dataRow = rowIdx + 1;
      const faCellRef = XLSX.utils.encode_cell({ r: dataRow, c: faColIdx });
      if (ws[faCellRef]) {
        ws[faCellRef].s = { font: { color: { rgb: getFAColor(item.fa_percent) }, bold: true } };
      }
      const priorityCellRef = XLSX.utils.encode_cell({ r: dataRow, c: priorityColIdx });
      if (ws[priorityCellRef]) {
        ws[priorityCellRef].s = { font: { color: { rgb: getPriorityColor(item.zone) }, bold: true } };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Forecast Accuracy');
    XLSX.writeFile(wb, `SKU_Forecast_Accuracy_${yearFilter}.xlsx`);
  }, [filteredData, yearFilter]);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Forecast Accuracy Analysis</h1>
          <p className="page-description">FA% vs Forecast Qty scatter analysis — identify high-impact, low-accuracy SKUs{overallFa > 0 && ` (Overall FA: ${overallFa}%)`}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {/* Year */}
          <select
            className="form-input form-select"
            style={{ width: 100 }}
            value={yearFilter}
            onChange={e => setYearFilter(Number(e.target.value))}
          >
            {[CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Month multi-select */}
          <div style={{ position: 'relative' }}>
            <div
              className="form-input form-select"
              style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { closeAllDd(); setShowMonthDropdown(!showMonthDropdown); }}
            >
              {monthFilter.length > 0 ? `${monthFilter.length} Months Selected` : 'All Months'}
            </div>
            {showMonthDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 300, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {ALL_MONTHS.map(m => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input type="checkbox" checked={monthFilter.includes(m)} onChange={e => { const next = e.target.checked ? [...monthFilter, m] : monthFilter.filter(x => x !== m); setMonthFilter(next); }} />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{m}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Brand multi-select */}
          <div style={{ position: 'relative' }}>
            <div
              className="form-input form-select"
              style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { closeAllDd(); setShowBrandDropdown(!showBrandDropdown); }}
            >
              {brandFilter.length > 0 ? `${brandFilter.length} Brands Selected` : 'All Brands'}
            </div>
            {showBrandDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {brands.map(b => (
                  <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input type="checkbox" checked={brandFilter.includes(b)} onChange={e => { const nb = e.target.checked ? [...brandFilter, b] : brandFilter.filter(x => x !== b); setBrandFilter(nb); }} />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{b}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Product Group multi-select */}
          <div style={{ position: 'relative' }}>
            <div
              className="form-input form-select"
              style={{ width: 200, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { closeAllDd(); setShowGroupDropdown(!showGroupDropdown); }}
            >
              {productGroupFilter.length > 0 ? `${productGroupFilter.length} Groups Selected` : 'All Product Groups'}
            </div>
            {showGroupDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {productGroups.map(pg => (
                  <label key={pg} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input type="checkbox" checked={productGroupFilter.includes(pg)} onChange={e => { const nc = e.target.checked ? [...productGroupFilter, pg] : productGroupFilter.filter(x => x !== pg); setProductGroupFilter(nc); }} />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{pg}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input type="text" placeholder="Search SKU..." value={skuSearch} onChange={e => setSkuSearch(e.target.value)} style={filterInputStyle} />
          </div>

          {(monthFilter.length > 0 || brandFilter.length > 0 || productGroupFilter.length > 0 || skuSearch) && (
            <button
              onClick={() => { setMonthFilter([]); setBrandFilter([]); setProductGroupFilter([]); setSkuSearch(''); }}
              style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500 }}
            >
              Clear Filters
            </button>
          )}

          <button id="export-excel" className="btn btn-primary" onClick={handleExportExcel} disabled={filteredData.length === 0}>
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* Alert for critical items */}
      {criticalItems.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          background: 'var(--color-danger-bg)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)',
          color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)'
        }}>
          <AlertTriangle size={18} />
          <strong>{criticalItems.length} SKUs</strong> with high forecast qty but low forecast accuracy require immediate attention.
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-8)', gap: 'var(--space-3)', color: 'var(--color-text-muted)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          Loading accuracy data...
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredData.length === 0 && (
        <div className="card" style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--space-2)' }}>No forecast accuracy data available</p>
          <p style={{ fontSize: 'var(--font-size-sm)' }}>
            Run forecast generation first, or check if the <code>forecast_accuracy</code> table has data for {yearFilter}.
          </p>
        </div>
      )}

      {/* Scatter Plot */}
      {!loading && filteredData.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-header">
              <div>
                <div className="card-title">FA% vs Forecast Qty Priority Matrix</div>
                <div className="card-subtitle">Red zone: High Forecast Qty + Low FA% — needs immediate action</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={450}>
              <ScatterChart margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis
                  type="number" dataKey="fa_percent" name="FA%" unit="%"
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  label={{ value: 'Forecast Accuracy (%)', position: 'insideBottom', offset: -10, style: { fill: '#64748b', fontSize: 12 } }}
                />
                <YAxis
                  type="number" dataKey="forecast_qty" name="Forecast Qty"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
                  label={{ value: 'Forecast Qty', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 12 } }}
                />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceArea x1={0} x2={50} y1={volThreshold} y2={maxVol} fill="rgba(239,68,68,0.08)" />
                <ReferenceLine x={50} stroke="rgba(239,68,68,0.4)" strokeDasharray="5 5" label={{ value: 'FA% Threshold', fill: '#ef4444', fontSize: 11 }} />
                <ReferenceLine y={volThreshold} stroke="rgba(245,158,11,0.4)" strokeDasharray="5 5" />
                <Scatter
                  data={filteredData}
                  fill="#6366f1"
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  shape={(props: any) => {
                    const color = props.payload.zone === 'critical' ? '#ef4444' :
                                  props.payload.zone === 'watch' ? '#f59e0b' : '#22c55e';
                    return <circle cx={props.cx} cy={props.cy} r={8} fill={color} fillOpacity={0.8} stroke={color} strokeWidth={2} strokeOpacity={0.3} />;
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Detail Table */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">SKU Forecast Accuracy Detail</div>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                {filteredData.length} SKUs
              </span>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU Code</th>
                  <th>SKU Name</th>
                  <th>Brand</th>
                  <th>Product Group</th>
                  <th>Forecast Qty</th>
                  <th>Actual Qty</th>
                  <th>Variance</th>
                  <th>FA%</th>
                  <th>Priority</th>
                  <th>Action Needed</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredData]
                  .sort((a, b) => a.fa_percent - b.fa_percent)
                  .map((item, i) => (
                    <tr key={i}>
                      <td>{item.item_code}</td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{item.item_name}</td>
                      <td style={{ fontWeight: 500 }}>{item.brand}</td>
                      <td>{item.product_group}</td>
                      <td style={{ fontWeight: 500 }}>{item.forecast_qty.toLocaleString()}</td>
                      <td>{item.actual_qty.toLocaleString()}</td>
                      <td style={{ color: item.variance >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
                        {item.variance >= 0 ? '+' : ''}{item.variance.toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                          <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            <div style={{ width: `${item.fa_percent}%`, height: '100%', borderRadius: 3, background: item.fa_percent >= 70 ? '#22c55e' : item.fa_percent >= 50 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span style={{ fontWeight: 600 }}>{item.fa_percent}%</span>
                        </div>
                      </td>
                      <td>
                        <span>
                          {item.zone === 'critical' ? 'Critical' : item.zone === 'watch' ? 'Watch' : 'Good'}
                        </span>
                      </td>
                      <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                        {item.zone === 'critical' ? 'Review model & input data' : item.zone === 'watch' ? 'Monitor next cycle' : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
