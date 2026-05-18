'use client';

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Trash2, TrendingUp, Search } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, masterDataApi, ActualSales, ProductHierarchy, Warehouse } from '@/lib/api';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CHANNELS = ['Domestic', 'Export', 'E-Commerce', 'Modern Trade', 'General Trade'];

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
  const { addToast } = useToast();
  const [data, setData] = useState<ActualSales[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [yearFilter, setYearFilter] = useState<number>(currentYear);
  const [monthFilter, setMonthFilter] = useState<string[]>([]);
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);
  const [regionFilter, setRegionFilter] = useState<string[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([]);
  const [searchText, setSearchText] = useState('');

  // Dropdown UI state
  const [showMonthDd, setShowMonthDd] = useState(false);
  const [showBrandDd, setShowBrandDd] = useState(false);
  const [showGroupDd, setShowGroupDd] = useState(false);
  const [showChannelDd, setShowChannelDd] = useState(false);
  const [showRegionDd, setShowRegionDd] = useState(false);
  const [showWhDd, setShowWhDd] = useState(false);

  // Master data
  const [hierarchy, setHierarchy] = useState<ProductHierarchy[]>([]);
  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({
    item_code: '', warehouse_code: '', partner_code: '',
    year: currentYear, month: currentMonth,
    quantity: 0, amount: 0, source: 'Manual'
  });

  // Fetch Master Data
  useEffect(() => {
    const fetchHierarchy = async () => {
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
    const fetchWarehouses = async () => {
      try {
        const res = await masterDataApi.warehouses.list({ page_size: 200 });
        setAllWarehouses(res.items);
      } catch (e) {}
    };
    fetchHierarchy();
    fetchWarehouses();
  }, []);

  // Cascading logic
  const monthOptions = useMemo(() => MONTH_NAMES.slice(1).map((m, i) => `${String(i + 1).padStart(2, '0')} - ${m}`), []);

  const brands = useMemo(() =>
    [...new Set(hierarchy.map(h => h.brand))].filter(Boolean).sort(),
  [hierarchy]);

  const productGroups = useMemo(() => {
    const source = brandFilter.length > 0
      ? hierarchy.filter(h => brandFilter.includes(h.brand))
      : hierarchy;
    return [...new Set(source.map(h => h.item_group_name))].filter(Boolean).sort();
  }, [hierarchy, brandFilter]);

  const regions = useMemo(() =>
    [...new Set(allWarehouses.map(w => w.warehouse_region))].filter(Boolean).sort(),
  [allWarehouses]);

  const warehouseOptions = useMemo(() => {
    const source = regionFilter.length > 0
      ? allWarehouses.filter(w => regionFilter.includes(w.warehouse_region))
      : allWarehouses;
    return source.map(w => w.warehouse_code).sort();
  }, [allWarehouses, regionFilter]);

  // Auto-reset dependent filters
  useEffect(() => {
    if (groupFilter.length > 0) {
      const valid = groupFilter.filter(g => productGroups.includes(g));
      if (valid.length !== groupFilter.length) setGroupFilter(valid);
    }
  }, [productGroups, groupFilter]);

  useEffect(() => {
    if (warehouseFilter.length > 0) {
      const valid = warehouseFilter.filter(w => warehouseOptions.includes(w));
      if (valid.length !== warehouseFilter.length) setWarehouseFilter(valid);
    }
  }, [warehouseOptions, warehouseFilter]);

  const closeAllDd = () => { 
    setShowMonthDd(false); setShowBrandDd(false); setShowGroupDd(false); 
    setShowChannelDd(false); setShowRegionDd(false); setShowWhDd(false); 
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const monthNumbers = monthFilter.map(m => parseInt(m.split(' ')[0]));
      const res = await transactionApi.sales.list({
        page, page_size: pageSize,
        search: searchText || undefined,
        year: yearFilter,
        month: monthNumbers.length > 0 ? monthNumbers : undefined,
        brand: brandFilter.length > 0 ? brandFilter : undefined,
        item_group: groupFilter.length > 0 ? groupFilter : undefined,
        channel: channelFilter.length > 0 ? channelFilter : undefined,
        region: regionFilter.length > 0 ? regionFilter : undefined,
        warehouse_code: warehouseFilter.length > 0 ? warehouseFilter : undefined,
      });
      setData(res.items); setTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load sales', (e as Error).message); }
    finally { setLoading(false); }
  }, [page, pageSize, searchText, yearFilter, monthFilter, brandFilter, groupFilter, channelFilter, regionFilter, warehouseFilter, addToast]);

  // Fetch data when filters or pagination change
  useEffect(() => {
    // Reset to page 1 if any filter changes (simplistic approach: just call fetchData and trust the effect dependencies)
    // Actually, we should trigger a fetch. Since page is in deps, changing page triggers fetch.
    const delayDebounceFn = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [fetchData]);

  // Handle Search Input (reset to page 1)
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setPage(1);
  };

  const handleCreate = async () => {
    setSaving(true);
    try {
      await transactionApi.sales.create(form as never);
      addToast('success', 'Sales record created');
      setShowModal(false); fetchData();
      setForm({ item_code: '', warehouse_code: '', partner_code: '', year: currentYear, month: currentMonth, quantity: 0, amount: 0, source: 'Manual' });
    } catch (e) { addToast('error', 'Failed to create', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await transactionApi.sales.delete(deleteId);
      addToast('success', 'Record deleted');
      setDeleteId(null); fetchData();
    } catch (e) { addToast('error', 'Failed to delete', (e as Error).message); }
  };

  const columns: Column<ActualSales>[] = [
    { key: 'brand', header: 'BRAND', render: r => r.brand || '—' },
    { key: 'item_group_name', header: 'ITEM GROUP', render: r => r.item_group_name || '—' },
    { key: 'item_code', header: 'ITEM CODE', render: r => <span>{r.item_code}</span> },
    { key: 'item_name', header: 'ITEM NAME', render: r => r.item_name || '—' },
    { key: 'item_uom', header: 'ITEM UOM', render: r => r.item_uom || '—' },
    { key: 'channel', header: 'CHANNEL', render: r => r.channel || '—' },
    { key: 'partner_code', header: 'PARTNER', render: r => r.partner_name || r.partner_code || '—' },
    { key: 'year', header: 'YEAR' },
    { key: 'month', header: 'MONTH', render: r => String(r.month).padStart(2, '0') },
    { key: 'quantity', header: 'QUANTITY', render: r => r.quantity.toLocaleString() },
    { key: 'amount', header: 'AMOUNT (VND)', render: r => r.amount.toLocaleString('vi-VN') },
    { key: 'source', header: 'SOURCE' },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn danger" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const fmtNum = (n: number) => n.toLocaleString();

  const renderMultiSelect = (
    label: string, options: string[], selected: string[],
    setSelected: (v: string[]) => void, show: boolean, setShow: (v: boolean) => void, width = 140
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
                  setPage(1);
                }}
              />
              <span style={{ fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap' }}>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div onClick={() => closeAllDd()}>
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--color-accent)' } as React.CSSProperties}>
          <div className="kpi-label">Total Records</div>
          <div className="kpi-value">{fmtNum(total)}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--color-success)' } as React.CSSProperties}>
          <div className="kpi-label">Total Quantity</div>
          <div className="kpi-value">{fmtNum(data.reduce((s, r) => s + r.quantity, 0))}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--chart-3)' } as React.CSSProperties}>
          <div className="kpi-label">Total Amount (VND)</div>
          <div className="kpi-value" style={{ fontSize: 'var(--font-size-xl)' }}>{data.reduce((s, r) => s + r.amount, 0).toLocaleString('vi-VN')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <ImportExcel entityKey="actual-sales" entityLabel="Import Sales" onImportComplete={fetchData} />
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add Sales Record
        </button>
      </div>

      {/* Filters */}
      <div className="filter-bar" style={{ marginBottom: 'var(--space-6)' }} onClick={e => e.stopPropagation()}>
        <div className="filter-group">
          <label>Year</label>
          <select className="form-input form-select" style={{ width: 90 }} value={yearFilter} onChange={e => { setYearFilter(Number(e.target.value)); setPage(1); }}>
            {[currentYear, currentYear - 1, currentYear - 2].map(y => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>

        {renderMultiSelect('Months', monthOptions, monthFilter, setMonthFilter, showMonthDd, setShowMonthDd, 140)}
        {renderMultiSelect('Brands', brands, brandFilter, setBrandFilter, showBrandDd, setShowBrandDd, 140)}
        {renderMultiSelect('Groups', productGroups, groupFilter, setGroupFilter, showGroupDd, setShowGroupDd, 160)}
        {renderMultiSelect('Channels', CHANNELS, channelFilter, setChannelFilter, showChannelDd, setShowChannelDd, 150)}
        {renderMultiSelect('Regions', regions, regionFilter, setRegionFilter, showRegionDd, setShowRegionDd, 140)}
        {renderMultiSelect('Warehouses', warehouseOptions, warehouseFilter, setWarehouseFilter, showWhDd, setShowWhDd, 150)}

        <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          <input type="text" placeholder="Search items..." value={searchText} onChange={handleSearchChange} style={filterInputStyle} />
        </div>

        {(monthFilter.length > 0 || brandFilter.length > 0 || groupFilter.length > 0 || channelFilter.length > 0 || regionFilter.length > 0 || warehouseFilter.length > 0 || searchText) && (
          <button
            onClick={() => { setMonthFilter([]); setBrandFilter([]); setGroupFilter([]); setChannelFilter([]); setRegionFilter([]); setWarehouseFilter([]); setSearchText(''); setPage(1); }}
            style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500 }}
          >
            Clear Filters
          </button>
        )}
      </div>

      <DataTable columns={columns} data={data} loading={loading} emptyIcon={<TrendingUp size={48} />} emptyTitle="No sales records" emptyText="Start by importing sales data or adding records manually" />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Sales Record" size="md">
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Item Code *</label>
            <input className="form-input" value={form.item_code} onChange={e => setForm({...form, item_code: e.target.value})} placeholder="e.g. SKU-001" />
          </div>
          <div className="form-group">
            <label className="form-label">Warehouse Code *</label>
            <input className="form-input" value={form.warehouse_code} onChange={e => setForm({...form, warehouse_code: e.target.value})} placeholder="e.g. WH-HCM1" />
          </div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group">
            <label className="form-label">Partner Code</label>
            <input className="form-input" value={form.partner_code} onChange={e => setForm({...form, partner_code: e.target.value})} placeholder="e.g. BP-001" />
          </div>
          <div className="form-group">
            <label className="form-label">Year *</label>
            <input className="form-input" type="number" value={form.year} onChange={e => setForm({...form, year: parseInt(e.target.value) || 2026})} />
          </div>
          <div className="form-group">
            <label className="form-label">Month *</label>
            <input className="form-input" type="number" min={1} max={12} value={form.month} onChange={e => setForm({...form, month: parseInt(e.target.value) || 1})} />
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Quantity *</label>
            <input className="form-input" type="number" value={form.quantity} onChange={e => setForm({...form, quantity: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="form-group">
            <label className="form-label">Amount (VND)</label>
            <input className="form-input" type="number" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.item_code || !form.warehouse_code}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Sales Record" message="Are you sure you want to delete this sales record? This action cannot be undone." />
    </div>
  );
}
