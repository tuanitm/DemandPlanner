'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { masterDataApi, ProductHierarchy } from '@/lib/api';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { AlertTriangle, Search, Download } from 'lucide-react';
import XLSX from 'xlsx-js-style';

const accuracyData = [
  { name: 'SKU-001', skuName: 'Premium Rice 5kg', brandName: 'Golden Harvest', productGroup: 'Rice & Grains', forecastQty: 15200, actualQty: 14000, zone: 'good' },
  { name: 'SKU-034', skuName: 'Jasmine Tea 500ml', brandName: 'VietTea', productGroup: 'Beverages', forecastQty: 12400, actualQty: 10900, zone: 'good' },
  { name: 'SKU-012', skuName: 'Instant Noodle Beef', brandName: 'Hao Hao', productGroup: 'Instant Noodles', forecastQty: 18500, actualQty: 10200, zone: 'critical' },
  { name: 'SKU-078', skuName: 'Coconut Milk 1L', brandName: 'VietCoco', productGroup: 'Beverages', forecastQty: 6800, actualQty: 4900, zone: 'watch' },
  { name: 'SKU-055', skuName: 'Fish Sauce 750ml', brandName: 'Phu Quoc', productGroup: 'Condiments', forecastQty: 14000, actualQty: 4900, zone: 'critical' },
  { name: 'SKU-089', skuName: 'Green Bean Cake', brandName: 'Bao Minh', productGroup: 'Snacks & Cakes', forecastQty: 3200, actualQty: 3040, zone: 'good' },
  { name: 'SKU-023', skuName: 'Soy Milk Original', brandName: 'Fami', productGroup: 'Beverages', forecastQty: 9500, actualQty: 5700, zone: 'watch' },
  { name: 'SKU-067', skuName: 'Chili Paste 500g', brandName: 'Cholimex', productGroup: 'Condiments', forecastQty: 8500, actualQty: 2400, zone: 'critical' },
  { name: 'SKU-045', skuName: 'Dried Shrimp 200g', brandName: 'Phu Quoc', productGroup: 'Seafood', forecastQty: 4200, actualQty: 3570, zone: 'good' },
  { name: 'SKU-091', skuName: 'Pho Broth Concentrate', brandName: 'ViFon', productGroup: 'Instant Noodles', forecastQty: 7200, actualQty: 5600, zone: 'watch' },
  { name: 'SKU-102', skuName: 'Condensed Milk 380g', brandName: 'Vinamilk', productGroup: 'Dairy', forecastQty: 16000, actualQty: 8800, zone: 'critical' },
  { name: 'SKU-118', skuName: 'Rice Paper Rolls', brandName: 'Bao Minh', productGroup: 'Snacks & Cakes', forecastQty: 2800, actualQty: 2520, zone: 'good' },
  { name: 'SKU-133', skuName: 'Tapioca Starch 1kg', brandName: 'Golden Harvest', productGroup: 'Rice & Grains', forecastQty: 5000, actualQty: 2900, zone: 'watch' },
  { name: 'SKU-145', skuName: 'Spring Roll Wrapper', brandName: 'Safoco', productGroup: 'Snacks & Cakes', forecastQty: 11000, actualQty: 7500, zone: 'watch' },
  { name: 'SKU-156', skuName: 'Lemongrass Extract', brandName: 'Cholimex', productGroup: 'Condiments', forecastQty: 8000, actualQty: 6560, zone: 'good' },
].map(d => ({
  ...d,
  fa: d.forecastQty > 0 ? Math.round(Math.max(0, 100 - (Math.abs(d.forecastQty - d.actualQty) / d.forecastQty) * 100)) : 0,
  variance: d.actualQty - d.forecastQty,
}));

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#f1f5f9',
};

interface ScatterPayload {
  name: string;
  skuName: string;
  brandName: string;
  productGroup: string;
  forecastQty: number;
  actualQty: number;
  fa: number;
  variance: number;
  zone: string;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPayload }> }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div style={{ ...tooltipStyle, padding: '12px' }}>
        <div>SKU Code: <strong>{d.name}</strong></div>
        <div>SKU Name: <strong>{d.skuName}</strong></div>
        <div>Forecast Qty: <strong>{d.forecastQty.toLocaleString()}</strong></div>
        <div>Actual Qty: <strong>{d.actualQty.toLocaleString()}</strong></div>
        <div>FA%: <strong>{d.fa}%</strong></div>
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

  // Derive brands from the actual data being displayed
  const brands = useMemo(() => {
    return [...new Set(accuracyData.map(d => d.brandName))].sort();
  }, []);

  // Filter product groups based on selected brand
  const productGroups = useMemo(() => {
    const source = brandFilter.length > 0
      ? accuracyData.filter(d => brandFilter.includes(d.brandName))
      : accuracyData;
    return [...new Set(source.map(d => d.productGroup))].sort();
  }, [brandFilter]);

  // Reset product group filter when brand changes and the selected groups are no longer valid
  useEffect(() => {
    if (productGroupFilter.length > 0) {
      const validGroups = productGroupFilter.filter(g => productGroups.includes(g));
      if (validGroups.length !== productGroupFilter.length) {
        setProductGroupFilter(validGroups);
      }
    }
  }, [productGroups, productGroupFilter]);

  const filteredData = useMemo(() => {
    return accuracyData.filter(item => {
      if (brandFilter.length > 0 && !brandFilter.includes(item.brandName)) return false;
      if (productGroupFilter.length > 0 && !productGroupFilter.includes(item.productGroup)) return false;
      if (skuSearch) {
        const q = skuSearch.toLowerCase();
        if (!item.name.toLowerCase().includes(q) && !item.skuName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [brandFilter, productGroupFilter, skuSearch]);

  const criticalItems = accuracyData.filter(d => d.fa < 50 && d.forecastQty > 5000);

  const handleExportExcel = useCallback(() => {
    const sortedData = [...filteredData].sort((a, b) => a.fa - b.fa);
    const exportRows = sortedData.map(item => ({
        'SKU Code': item.name,
        'SKU Name': item.skuName,
        'Brand Name': item.brandName,
        'Product Group': item.productGroup,
        'Forecast Qty': item.forecastQty,
        'Actual Qty': item.actualQty,
        'Variance': item.variance,
        'FA%': item.fa,
        'Priority': item.zone === 'critical' ? 'Critical' : item.zone === 'watch' ? 'Watch' : 'Good',
        'Action Needed': item.zone === 'critical' ? 'Review model & input data' : item.zone === 'watch' ? 'Monitor next cycle' : '—',
      }));
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const colWidths = [
      { wch: 12 }, { wch: 24 }, { wch: 16 }, { wch: 18 },
      { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 28 },
    ];
    ws['!cols'] = colWidths;

    // Apply font colors to FA% (col E) and Priority (col G) to match report display
    const faColIdx = 7;  // Column H (0-indexed)
    const priorityColIdx = 8;  // Column I (0-indexed)
    const getFAColor = (fa: number) => {
      if (fa >= 70) return '22C55E';  // green
      if (fa >= 50) return 'F59E0B';  // amber
      return 'EF4444';                // red
    };
    const getPriorityColor = (zone: string) => {
      if (zone === 'critical') return 'EF4444';  // red
      if (zone === 'watch') return 'F59E0B';      // amber
      return '22C55E';                             // green
    };

    sortedData.forEach((item, rowIdx) => {
      const dataRow = rowIdx + 1; // +1 for header row
      // FA% cell
      const faCellRef = XLSX.utils.encode_cell({ r: dataRow, c: faColIdx });
      if (ws[faCellRef]) {
        ws[faCellRef].s = { font: { color: { rgb: getFAColor(item.fa) }, bold: true } };
      }
      // Priority cell
      const priorityCellRef = XLSX.utils.encode_cell({ r: dataRow, c: priorityColIdx });
      if (ws[priorityCellRef]) {
        ws[priorityCellRef].s = { font: { color: { rgb: getPriorityColor(item.zone) }, bold: true } };
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Forecast Accuracy');
    XLSX.writeFile(wb, `SKU_Forecast_Accuracy_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [filteredData]);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Forecast Accuracy Analysis</h1>
          <p className="page-description">FA% vs Revenue scatter analysis — identify high-impact, low-accuracy SKUs</p>
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

          <button id="export-excel" className="btn btn-primary" onClick={handleExportExcel}>
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

      {/* Scatter Plot */}
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
              type="number" dataKey="fa" name="FA%" unit="%"
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              label={{ value: 'Forecast Accuracy (%)', position: 'insideBottom', offset: -10, style: { fill: '#64748b', fontSize: 12 } }}
            />
            <YAxis
              type="number" dataKey="forecastQty" name="Forecast Qty"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
              label={{ value: 'Forecast Qty', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 12 } }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea x1={0} x2={50} y1={5000} y2={20000} fill="rgba(239,68,68,0.08)" />
            <ReferenceLine x={50} stroke="rgba(239,68,68,0.4)" strokeDasharray="5 5" label={{ value: 'FA% Threshold', fill: '#ef4444', fontSize: 11 }} />
            <ReferenceLine y={5000} stroke="rgba(245,158,11,0.4)" strokeDasharray="5 5" />
            <Scatter
              data={accuracyData}
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
            {filteredData.length} of {accuracyData.length} SKUs
          </span>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>SKU Code</th>
              <th>SKU Name</th>
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
              .sort((a, b) => a.fa - b.fa)
              .map((item, i) => (
                <tr key={i}>
                  <td>{item.name}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{item.skuName}</td>
                  <td style={{ fontWeight: 500 }}>{item.forecastQty.toLocaleString()}</td>
                  <td>{item.actualQty.toLocaleString()}</td>
                  <td style={{ color: item.variance >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 500 }}>
                    {item.variance >= 0 ? '+' : ''}{item.variance.toLocaleString()}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <div style={{ width: 60, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ width: `${item.fa}%`, height: '100%', borderRadius: 3, background: item.fa >= 70 ? '#22c55e' : item.fa >= 50 ? '#f59e0b' : '#ef4444' }} />
                      </div>
                      <span style={{ fontWeight: 600 }}>{item.fa}%</span>
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
    </div>
  );
}
