'use client';

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { TrendingUp, Download, Search, Upload, Save, FileSpreadsheet, X } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { masterDataApi, transactionApi } from '@/lib/api';

interface HierarchyData {
  item_group_code: string;
  item_group_name: string;
  business: string;
  brand: string;
  item_category_code: string;
  item_category_name: string;
  status: string;
}

interface WarehouseData {
  warehouse_code: string;
  warehouse_name: string;
  warehouse_region: string;
  warehouse_status: string;
}

interface ItemData {
  item_code: string;
  item_name: string;
  uom: string;
  item_group_code: string;
  item_type: string;
  status: string;
}

interface SalesRow {
  id: number;
  year: number;
  brand: string;
  productGroup: string;
  skuCode: string;
  skuName: string;
  unit: string;
  channel: string;
  region: string;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
}

const currentYear = new Date().getFullYear();
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CHANNELS = ['Domestic', 'Export', 'E-Commerce', 'Modern Trade', 'General Trade'];
const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'] as const;
type MonthKey = typeof MONTH_KEYS[number];

const filterInputStyle: React.CSSProperties = {
  padding: '8px 12px 8px 36px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-sm)',
  minWidth: 200,
  outline: 'none',
};

export default function SalesEntryPage() {
  const [yearFilter, setYearFilter] = useState(currentYear);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');

  const [showMonthDd, setShowMonthDd] = useState(false);
  const [showBrandDd, setShowBrandDd] = useState(false);
  const [showGroupDd, setShowGroupDd] = useState(false);
  const [showChannelDd, setShowChannelDd] = useState(false);
  const [showRegionDd, setShowRegionDd] = useState(false);

  const [salesData, setSalesData] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: number; field: MonthKey } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Master data from API
  const [hierarchy, setHierarchy] = useState<HierarchyData[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<WarehouseData[]>([]);
  const [allItems, setAllItems] = useState<ItemData[]>([]);

  // ── localStorage helpers ──
  const storageKey = `sales_${yearFilter}`;
  const saveToStorage = useCallback((data: SalesRow[]) => {
    try { localStorage.setItem(storageKey, JSON.stringify(data)); } catch {}
  }, [storageKey]);
  const loadFromStorage = useCallback((): SalesRow[] | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }, [storageKey]);

  // ── Load saved sales data when year changes ──
  useEffect(() => {
    const saved = loadFromStorage();
    if (saved && saved.length > 0) {
      setSalesData(saved);
      setHasUnsaved(false);
    } else {
      setSalesData([]);
    }
  }, [yearFilter, loadFromStorage]);

  // ── Fetch all master data on mount ──
  useEffect(() => {
    const fetchHierarchy = async () => {
      try {
        let all: HierarchyData[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.productHierarchy.list({ page: p, page_size: 100 });
          all = [...all, ...(res.items as unknown as HierarchyData[])];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setHierarchy(all);
      } catch (e) {}
    };
    const fetchWarehouses = async () => {
      try {
        const res = await masterDataApi.warehouses.list({ page_size: 200 });
        setAllWarehouses(res.items as unknown as WarehouseData[]);
      } catch (e) {}
    };
    const fetchItems = async () => {
      try {
        let all: ItemData[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.items.list({ page: p, page_size: 200 });
          all = [...all, ...(res.items as unknown as ItemData[])];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllItems(all);
      } catch (e) {}
    };
    fetchHierarchy();
    fetchWarehouses();
    fetchItems();
  }, []);

  // ── Cascading filter options ──

  // Brands: from hierarchy
  const brands = useMemo(() =>
    [...new Set(hierarchy.map(h => h.brand))].filter(Boolean).sort(),
  [hierarchy]);

  // Months
  const monthOptions = useMemo(() => SHORT_MONTHS, []);

  // Product Groups: cascades from Brand
  const productGroups = useMemo(() => {
    const source = brandFilter.length > 0
      ? hierarchy.filter(h => brandFilter.includes(h.brand))
      : hierarchy;
    return [...new Set(source.map(h => h.item_group_name))].filter(Boolean).sort();
  }, [hierarchy, brandFilter]);

  // Regions: from warehouses
  const regions = useMemo(() =>
    [...new Set(allWarehouses.map(w => w.warehouse_region))].filter(Boolean).sort(),
  [allWarehouses]);

  // Auto-reset Product Group when Brand changes
  useEffect(() => {
    if (groupFilter.length > 0) {
      const valid = groupFilter.filter(g => productGroups.includes(g));
      if (valid.length !== groupFilter.length) setGroupFilter(valid);
    }
  }, [productGroups, groupFilter]);

  const closeAllDd = () => { setShowMonthDd(false); setShowBrandDd(false); setShowGroupDd(false); setShowChannelDd(false); setShowRegionDd(false); };

  // ── Month Columns to Display ──
  const visibleMonthKeys = useMemo(() => {
    if (monthFilter.length === 0) return MONTH_KEYS;
    const selectedIndexes = monthFilter.map(m => SHORT_MONTHS.indexOf(m));
    return MONTH_KEYS.filter((_, i) => selectedIndexes.includes(i));
  }, [monthFilter]);

  // ── Load from API ──
  const handleLoadFromDB = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all sales for the year, paginating if needed
      let allSales: Array<Record<string, unknown>> = [];
      let page = 1;
      while (true) {
        const res = await transactionApi.sales.list({
          page,
          page_size: 200,
          year: yearFilter,
        });
        allSales = [...allSales, ...res.items as unknown as Array<Record<string, unknown>>];
        if (allSales.length >= res.total || res.items.length === 0) break;
        page++;
      }

      // Pivot: group by (skuCode + channel + region + year)
      const pivotMap = new Map<string, SalesRow>();
      let nextId = 0;

      for (const sale of allSales) {
        const skuCode = String(sale.item_code || '');
        const channel = String(sale.channel || '');
        const region = String(sale.region || '');
        const key = `${skuCode}|${channel}|${region}`;

        if (!pivotMap.has(key)) {
          pivotMap.set(key, {
            id: ++nextId,
            year: yearFilter,
            brand: String(sale.brand || ''),
            productGroup: String(sale.item_group_name || ''),
            skuCode,
            skuName: String(sale.item_name || ''),
            unit: String(sale.item_uom || 'PCS'),
            channel,
            region,
            jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
            jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
          });
        }

        const row = pivotMap.get(key)!;
        const monthIdx = Number(sale.month) - 1;
        if (monthIdx >= 0 && monthIdx < 12) {
          const monthKey = MONTH_KEYS[monthIdx];
          row[monthKey] += Number(sale.quantity || 0);
        }
      }

      const rows = Array.from(pivotMap.values());
      setSalesData(rows);
      saveToStorage(rows);
      setHasUnsaved(false);
    } catch (e) {
      console.error('Failed to load sales data:', e);
    } finally {
      setLoading(false);
    }
  }, [yearFilter, saveToStorage]);

  // Filter displayed data by search text and filters
  const displayedData = useMemo(() => {
    let result = salesData;

    if (brandFilter.length > 0) {
      result = result.filter(r => brandFilter.includes(r.brand));
    }
    if (groupFilter.length > 0) {
      result = result.filter(r => groupFilter.includes(r.productGroup));
    }
    if (channelFilter.length > 0) {
      result = result.filter(r => channelFilter.includes(r.channel));
    }
    if (regionFilter.length > 0) {
      result = result.filter(r => regionFilter.includes(r.region));
    }
    if (searchText) {
      const q = searchText.toLowerCase();
      result = result.filter(r =>
        r.skuCode.toLowerCase().includes(q) ||
        r.skuName.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.productGroup.toLowerCase().includes(q)
      );
    }
    return result;
  }, [salesData, searchText, brandFilter, groupFilter, channelFilter, regionFilter]);

  // Export Excel
  const handleExport = useCallback(() => {
    if (displayedData.length === 0) return;
    const rows = displayedData.map(r => ({
      'Year': r.year, 'Brand': r.brand, 'Product Group': r.productGroup,
      'SKU Code': r.skuCode, 'SKU Name': r.skuName, 'Unit': r.unit,
      'Channel': r.channel, 'Region': r.region,
      'Jan': r.jan, 'Feb': r.feb, 'Mar': r.mar, 'Apr': r.apr,
      'May': r.may, 'Jun': r.jun, 'Jul': r.jul, 'Aug': r.aug,
      'Sep': r.sep, 'Oct': r.oct, 'Nov': r.nov, 'Dec': r.dec,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 16 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    const numFmt = '#,##0';
    for (let r = 1; r <= displayedData.length; r++) {
      for (let c = 8; c <= 19; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (ws[ref]) ws[ref].s = { numFmt };
      }
    }
    for (let c = 0; c <= 19; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = { font: { bold: true }, alignment: { horizontal: 'center' } };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Actual Sales');
    XLSX.writeFile(wb, `Actual_Sales_${yearFilter}.xlsx`);
  }, [displayedData, yearFilter]);

  // ── Import Excel (client-side) ──
  const handleImportExcel = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // Find header row dynamically (usually row 0 for frontend export, row 2 for backend template)
        let headerRowIndex = 0;
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
        for (let R = range.s.r; R <= Math.min(range.e.r, 10); ++R) {
          // Check first few columns for 'Year' or 'Brand' to identify header row
          const cellRef1 = XLSX.utils.encode_cell({c: 0, r: R});
          const cellRef2 = XLSX.utils.encode_cell({c: 1, r: R});
          const val1 = ws[cellRef1]?.v ? String(ws[cellRef1].v).toLowerCase().trim() : '';
          const val2 = ws[cellRef2]?.v ? String(ws[cellRef2].v).toLowerCase().trim() : '';
          if (val1 === 'year' || val2 === 'brand') {
            headerRowIndex = R;
            break;
          }
        }
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: headerRowIndex });

        // Map columns (case-insensitive lookup)
        const rows: SalesRow[] = json.map((row, idx) => {
          const get = (keys: string[]) => {
            for (const k of keys) {
              for (const col of Object.keys(row)) {
                if (col.toLowerCase().replace(/[\s_]/g, '') === k.toLowerCase().replace(/[\s_]/g, '')) return String(row[col] ?? '');
              }
            }
            return '';
          };
          return {
            id: idx + 1,
            year: parseInt(get(['Year'])) || yearFilter,
            brand: get(['Brand', 'BrandName']),
            productGroup: get(['ProductGroup', 'Product Group', 'ItemGroup']),
            skuCode: get(['SKUCode', 'SKU Code', 'ItemCode', 'SKU Code']),
            skuName: get(['SKUName', 'SKU Name', 'ItemName', 'SKU Name']),
            unit: get(['Unit', 'UOM']) || 'PCS',
            channel: get(['Channel']),
            region: get(['Region']),
            jan: parseFloat(get(['Jan', 'January'])) || 0,
            feb: parseFloat(get(['Feb', 'February'])) || 0,
            mar: parseFloat(get(['Mar', 'March'])) || 0,
            apr: parseFloat(get(['Apr', 'April'])) || 0,
            may: parseFloat(get(['May'])) || 0,
            jun: parseFloat(get(['Jun', 'June'])) || 0,
            jul: parseFloat(get(['Jul', 'July'])) || 0,
            aug: parseFloat(get(['Aug', 'August'])) || 0,
            sep: parseFloat(get(['Sep', 'September'])) || 0,
            oct: parseFloat(get(['Oct', 'October'])) || 0,
            nov: parseFloat(get(['Nov', 'November'])) || 0,
            dec: parseFloat(get(['Dec', 'December'])) || 0,
          };
        }).filter(r => r.skuCode); // Only include rows with a SKU Code

        // Data Consistency Check & Auto-correction
        const groupLookup = new Map<string, { brand: string; groupName: string }>();
        hierarchy.forEach(h => groupLookup.set(h.item_group_code, { brand: h.brand, groupName: h.item_group_name }));
        const itemLookup = new Map<string, ItemData>();
        allItems.forEach(i => itemLookup.set(i.item_code, i));

        const validChannels = new Set(CHANNELS);
        const validRegions = new Set(regions);

        const invalidSKUs = new Set<string>();
        const validRows: SalesRow[] = [];

        rows.forEach(r => {
          const item = itemLookup.get(r.skuCode);
          if (!item) {
            invalidSKUs.add(r.skuCode);
            // Allow row but use provided values since master data is missing
            validRows.push({
              ...r,
              channel: validChannels.has(r.channel) ? r.channel : 'Domestic',
              region: validRegions.has(r.region) ? r.region : (regions[0] || 'South')
            });
            return;
          }
          const info = groupLookup.get(item.item_group_code);
          validRows.push({
            ...r,
            brand: info?.brand || r.brand,
            productGroup: info?.groupName || r.productGroup,
            skuName: item.item_name || r.skuName,
            unit: item.uom || r.unit || 'PCS',
            channel: validChannels.has(r.channel) ? r.channel : 'Domestic',
            region: validRegions.has(r.region) ? r.region : (regions[0] || 'South')
          });
        });

        if (invalidSKUs.size > 0) {
          alert(`Warning: ${invalidSKUs.size} SKU(s) were not found in Master Data (${Array.from(invalidSKUs).slice(0, 3).join(', ')}${invalidSKUs.size > 3 ? '...' : ''}). They have been imported, but please ensure they are added to Master Data. `);
        }

        // Merge with existing data
        const mergedMap = new Map<string, SalesRow>();
        salesData.forEach(r => {
          const key = `${r.year}|${r.skuCode}|${r.channel}|${r.region}`;
          mergedMap.set(key, r);
        });

        validRows.forEach(r => {
          const key = `${r.year}|${r.skuCode}|${r.channel}|${r.region}`;
          if (mergedMap.has(key)) {
            // Update existing row
            const existing = mergedMap.get(key)!;
            mergedMap.set(key, { ...existing, ...r, id: existing.id });
          } else {
            // Add new row
            mergedMap.set(key, r);
          }
        });

        // Reassign IDs to be sequential
        const finalRows = Array.from(mergedMap.values()).map((r, i) => ({ ...r, id: i + 1 }));

        setSalesData(finalRows);
        saveToStorage(finalRows);
        setHasUnsaved(false);
      } catch (err) {
        alert('Failed to parse Excel file. Please check the format.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
    setShowImportModal(false);
  }, [yearFilter, saveToStorage, salesData, allItems, hierarchy, CHANNELS, regions]);

  // ── Download Excel template ──
  const handleDownloadTemplate = useCallback(() => {
    const templateHeaders = ['Year', 'Brand', 'Product Group', 'SKU Code', 'SKU Name', 'Unit', 'Channel', 'Region', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const sampleRow = [yearFilter, 'Brand Name', 'Group Name', 'SKU-001', 'Sample Item', 'PCS', 'Domestic', 'South', 1000, 1100, 1200, 1050, 1300, 1250, 1400, 1350, 1500, 1450, 1600, 1700];
    const ws = XLSX.utils.aoa_to_sheet([templateHeaders, sampleRow]);
    ws['!cols'] = [{ wch: 8 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 28 }, { wch: 8 }, { wch: 16 }, { wch: 16 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
    // Style headers
    for (let c = 0; c <= 19; c++) {
      const ref = XLSX.utils.encode_cell({ r: 0, c });
      if (ws[ref]) ws[ref].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '22C55E' } }, alignment: { horizontal: 'center' } };
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Actual Sales Template');
    XLSX.writeFile(wb, 'Actual_Sales_Template.xlsx');
  }, [yearFilter]);

  // Multi-select dropdown renderer
  const renderMultiSelect = (
    label: string, options: string[], selected: string[],
    setSelected: (v: string[]) => void, show: boolean, setShow: (v: boolean) => void, width = 160
  ) => (
    <div style={{ position: 'relative' }}>
      <div
        className="form-input form-select"
        style={{ width, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        onClick={() => { closeAllDd(); setShow(!show); }}
      >
        {selected.length > 0 ? `${selected.length} ${label}` : `All ${label}`}
      </div>
      {show && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 20,
          background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto',
          padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        }}>
          {options.map(opt => (
            <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={e => {
                  const next = e.target.checked ? [...selected, opt] : selected.filter(x => x !== opt);
                  setSelected(next);
                }}
              />
              <span style={{ fontSize: 'var(--font-size-sm)' }}>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const totalQty = displayedData.reduce((s, r) => s + r.jan + r.feb + r.mar + r.apr + r.may + r.jun + r.jul + r.aug + r.sep + r.oct + r.nov + r.dec, 0);

  return (
    <>
      {/* KPI Summary */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--color-accent)' } as React.CSSProperties}>
          <div className="kpi-label">Total Records</div>
          <div className="kpi-value">{displayedData.length.toLocaleString()}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--color-success)' } as React.CSSProperties}>
          <div className="kpi-label">Total Sales Qty</div>
          <div className="kpi-value">{totalQty.toLocaleString()}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': '#f59e0b' } as React.CSSProperties}>
          <div className="kpi-label">Period</div>
          <div className="kpi-value">{yearFilter}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': '#a855f7' } as React.CSSProperties}>
          <div className="kpi-label">Unique SKUs</div>
          <div className="kpi-value">{new Set(displayedData.map(r => r.skuCode)).size}</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <button
          className="btn btn-primary"
          style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', border: 'none' }}
          onClick={handleLoadFromDB}
          disabled={loading}
        >
          {loading ? <span className="loading-spinner" /> : <TrendingUp size={16} />}
          {loading ? ' Loading...' : ' Load from Database'}
        </button>
        <button className="btn btn-secondary" onClick={() => setShowImportModal(true)}>
          <Upload size={16} /> Import Excel
        </button>
        <button className="btn btn-primary" onClick={handleExport} disabled={displayedData.length === 0}>
          <Download size={16} /> Export Excel
        </button>
      </div>

      {/* Import Excel Modal */}
      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal-content modal-md" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Import Actual Sales</div>
              <button className="modal-close" onClick={() => setShowImportModal(false)}><X size={16} /></button>
            </div>

            {/* Step 1: Download Template */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-4)',
              padding: 'var(--space-4)', background: 'var(--color-bg-glass)',
              borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-5)',
              border: '1px solid var(--color-border)',
            }}>
              <FileSpreadsheet size={24} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>Step 1: Download Template</div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                  Get the Excel template with correct columns and a sample row
                </div>
              </div>
              <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={handleDownloadTemplate}>
                <Download size={14} /> Template
              </button>
            </div>

            {/* Step 2: Upload File */}
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginBottom: 'var(--space-3)' }}>
                Step 2: Upload filled Excel file
              </div>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleImportExcel} />
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-8) var(--space-6)',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; e.currentTarget.style.background = 'transparent'; }}
              >
                <Upload size={32} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }} />
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                  Drag & drop your Excel file here, or <span style={{ color: 'var(--color-accent)', fontWeight: 500 }}>browse</span>
                </div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-1)' }}>
                  Supports .xlsx files only
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowImportModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="filter-group">
          <label>Year</label>
          <select className="form-input form-select" style={{ width: 90 }} value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>

        {renderMultiSelect('Months', monthOptions, monthFilter, setMonthFilter, showMonthDd, setShowMonthDd, 140)}
        {renderMultiSelect('Brands', brands, brandFilter, setBrandFilter, showBrandDd, setShowBrandDd, 160)}
        {renderMultiSelect('Groups', productGroups, groupFilter, setGroupFilter, showGroupDd, setShowGroupDd, 180)}
        {renderMultiSelect('Channels', CHANNELS, channelFilter, setChannelFilter, showChannelDd, setShowChannelDd, 160)}
        {renderMultiSelect('Regions', regions, regionFilter, setRegionFilter, showRegionDd, setShowRegionDd, 150)}

        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Search items..." value={searchText} onChange={e => setSearchText(e.target.value)} style={filterInputStyle} />
        </div>

        {(monthFilter.length > 0 || brandFilter.length > 0 || groupFilter.length > 0 || channelFilter.length > 0 || regionFilter.length > 0 || searchText) && (
          <button
            onClick={() => { setMonthFilter([]); setBrandFilter([]); setGroupFilter([]); setChannelFilter([]); setRegionFilter([]); setSearchText(''); }}
            style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500 }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Data Table */}
      <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Year</th><th>Brand</th><th>Product Group</th>
                <th>SKU Code</th><th>SKU Name</th><th>Unit</th>
                <th>Channel</th><th>Region</th>
                {visibleMonthKeys.map(m => (
                  <th key={m} style={{ textAlign: 'right', textTransform: 'capitalize' }}>{m}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedData.length === 0 ? (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: 'var(--space-12)', color: 'var(--color-text-muted)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                      <TrendingUp size={48} style={{ color: 'var(--color-success)', opacity: 0.4 }} />
                      <div style={{ fontSize: 'var(--font-size-md)', fontWeight: 600 }}>No sales data yet</div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        Click <strong>&quot;Load from Database&quot;</strong> to pull existing data or <strong>&quot;Import Excel&quot;</strong> to upload
                      </div>
                    </div>
                  </td>
                </tr>
              ) : displayedData.map(r => (
                <tr key={r.id}>
                  <td>{r.year}</td>
                  <td style={{ fontWeight: 500 }}>{r.brand}</td>
                  <td>{r.productGroup}</td>
                  <td>{r.skuCode}</td>
                  <td style={{ color: 'var(--color-text-primary)' }}>{r.skuName}</td>
                  <td>{r.unit}</td>
                  <td>{r.channel}</td>
                  <td>{r.region}</td>
                  {visibleMonthKeys.map(m => (
                    <td key={m} style={{ textAlign: 'right', padding: editingCell?.id === r.id && editingCell?.field === m ? '2px 8px' : undefined }}>
                      {editingCell?.id === r.id && editingCell?.field === m ? (
                        <input
                          type="number"
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => {
                            const v = parseFloat(editValue);
                            if (!isNaN(v) && v >= 0) {
                              const updated = salesData.map(row => row.id === r.id ? { ...row, [m]: Math.round(v) } : row);
                              setSalesData(updated);
                              setHasUnsaved(true);
                            }
                            setEditingCell(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          style={{ width: 70, textAlign: 'right', padding: '4px 8px', background: 'rgba(34,197,94,0.15)', border: '1px solid var(--color-success)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', fontFamily: 'monospace', fontWeight: 600, fontSize: 'var(--font-size-sm)', outline: 'none' }}
                          min={0}
                          step={1}
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingCell({ id: r.id, field: m }); setEditValue(String(r[m])); }}
                          style={{ cursor: 'pointer', fontWeight: 600, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 'var(--radius-sm)', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(34,197,94,0.1)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                          title="Click to edit"
                        >
                          {r[m].toLocaleString()}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {displayedData.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-4)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>
          <span>Showing {displayedData.length} of {salesData.length} records</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            {hasUnsaved && <span className="badge badge-warning" style={{ padding: '4px 10px' }}>Unsaved changes</span>}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { saveToStorage(salesData); setHasUnsaved(false); }}
              disabled={!hasUnsaved}
              style={{ opacity: hasUnsaved ? 1 : 0.5 }}
            >
              <Save size={14} /> Save
            </button>
          </div>
        </div>
      )}
    </>
  );
}
