'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, TrendingUp } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, ActualSales } from '@/lib/api';

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;

export default function SalesEntryPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<ActualSales[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({
    search: '',
    year: String(currentYear),
    month: String(currentMonth),
  });
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({
    item_code: '', warehouse_code: '', partner_code: '',
    year: currentYear, month: currentMonth,
    quantity: 0, amount: 0, source: 'Manual'
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transactionApi.sales.list({
        page, page_size: pageSize,
        search: filters.search || undefined,
        year: filters.year ? parseInt(filters.year) : undefined,
        month: filters.month ? parseInt(filters.month) : undefined,
      });
      setData(res.items); setTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load sales', (e as Error).message); }
    finally { setLoading(false); }
  }, [page, pageSize, filters, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const filterCfg: FilterConfig[] = [
    { key: 'year', label: 'Year', defaultValue: String(currentYear), options: [
      { value: '', label: 'All Years' },
      { value: '2026', label: '2026' }, { value: '2025', label: '2025' },
      { value: '2024', label: '2024' },
    ]},
    { key: 'month', label: 'Month', defaultValue: String(currentMonth), options: [
      { value: '', label: 'All Months' },
      { value: '1', label: '01 - January' },
      { value: '2', label: '02 - February' },
      { value: '3', label: '03 - March' },
      { value: '4', label: '04 - April' },
      { value: '5', label: '05 - May' },
      { value: '6', label: '06 - June' },
      { value: '7', label: '07 - July' },
      { value: '8', label: '08 - August' },
      { value: '9', label: '09 - September' },
      { value: '10', label: '10 - October' },
      { value: '11', label: '11 - November' },
      { value: '12', label: '12 - December' },
    ]},
  ];

  const columns: Column<ActualSales>[] = [
    { key: 'brand', header: 'BRAND', render: r => r.brand || '—' },
    { key: 'item_group_name', header: 'ITEM GROUP', render: r => r.item_group_name || '—' },
    { key: 'item_code', header: 'ITEM CODE', render: r => <span className="badge badge-info">{r.item_code}</span> },
    { key: 'item_name', header: 'ITEM NAME', render: r => r.item_name || '—' },
    { key: 'item_uom', header: 'ITEM UOM', render: r => r.item_uom || '—' },
    { key: 'channel', header: 'CHANNEL', render: r => r.channel || '—' },
    { key: 'partner_code', header: 'PARTNER', render: r => r.partner_name || r.partner_code || '—' },
    { key: 'year', header: 'YEAR' },
    { key: 'month', header: 'MONTH', render: r => String(r.month).padStart(2, '0') },
    { key: 'quantity', header: 'QUANTITY', render: r => r.quantity.toLocaleString() },
    { key: 'amount', header: 'AMOUNT (VND)', render: r => r.amount.toLocaleString('vi-VN') },
    { key: 'source', header: 'SOURCE', render: r => <span className={`badge ${r.source === 'SAP' ? 'badge-info' : 'badge-warning'}`}>{r.source}</span> },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn danger" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const fmtNum = (n: number) => n.toLocaleString();

  return (
    <>
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

      <FilterBar searchPlaceholder="Search by item code..." filters={filterCfg} onFilterChange={(f) => { setFilters(f); setPage(1); }} />
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
    </>
  );
}
