'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Box } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, InventoryOnhand } from '@/lib/api';

export default function InventoryPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<InventoryOnhand[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', warehouse_code: '' });
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [form, setForm] = useState({
    item_code: '', warehouse_code: '', quantity: 0,
    unit_cost: 0, expiry_date: '', batch_number: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await transactionApi.inventory.list({
        page, page_size: pageSize,
        search: filters.search || undefined,
        warehouse_code: filters.warehouse_code || undefined,
      });
      setData(res.items); setTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load inventory', (e as Error).message); }
    finally { setLoading(false); }
  }, [page, pageSize, filters, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        expiry_date: form.expiry_date || null,
        batch_number: form.batch_number || null,
      };
      await transactionApi.inventory.create(payload as never);
      addToast('success', 'Inventory record created');
      setShowModal(false); fetchData();
      setForm({ item_code: '', warehouse_code: '', quantity: 0, unit_cost: 0, expiry_date: '', batch_number: '' });
    } catch (e) { addToast('error', 'Failed to create', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await transactionApi.inventory.delete(deleteId);
      addToast('success', 'Record deleted'); setDeleteId(null); fetchData();
    } catch (e) { addToast('error', 'Failed to delete', (e as Error).message); }
  };

  const filterCfg: FilterConfig[] = [
    { key: 'warehouse_code', label: 'Warehouse', options: [
      { value: '', label: 'All Warehouses' },
      { value: 'WH-HCM1', label: 'WH-HCM1' }, { value: 'WH-HN1', label: 'WH-HN1' },
      { value: 'WH-DN1', label: 'WH-DN1' }, { value: 'WH-BD1', label: 'WH-BD1' },
    ]},
  ];

  const columns: Column<InventoryOnhand>[] = [
    { key: 'item_code', header: 'ITEM CODE', render: r => <span className="badge badge-info">{r.item_code}</span> },
    { key: 'warehouse_code', header: 'WAREHOUSE' },
    { key: 'quantity', header: 'ON-HAND QTY', render: r => <strong>{r.quantity.toLocaleString()}</strong> },
    { key: 'unit_cost', header: 'UNIT COST', render: r => r.unit_cost ? r.unit_cost.toLocaleString('vi-VN') : '—' },
    { key: 'value', header: 'VALUE (VND)', render: r => (r.quantity * (r.unit_cost || 0)).toLocaleString('vi-VN') },
    { key: 'batch_number', header: 'BATCH', render: r => r.batch_number || '—' },
    { key: 'expiry_date', header: 'EXPIRY', render: r => {
      if (!r.expiry_date) return '—';
      const d = new Date(r.expiry_date);
      const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
      return <span className={days < 60 ? 'badge badge-danger' : days < 120 ? 'badge badge-warning' : 'badge badge-success'}>{r.expiry_date}</span>;
    }},
    { key: 'last_updated', header: 'UPDATED', render: r => new Date(r.last_updated).toLocaleDateString() },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn danger" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const totalValue = data.reduce((s, r) => s + r.quantity * (r.unit_cost || 0), 0);
  const totalQty = data.reduce((s, r) => s + r.quantity, 0);

  return (
    <>
      <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--color-accent)' } as React.CSSProperties}>
          <div className="kpi-label">Total SKU-Locations</div>
          <div className="kpi-value">{total.toLocaleString()}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--color-success)' } as React.CSSProperties}>
          <div className="kpi-label">Total On-Hand Qty</div>
          <div className="kpi-value">{totalQty.toLocaleString()}</div>
        </div>
        <div className="kpi-card" style={{ flex: 1, '--kpi-color': 'var(--chart-3)' } as React.CSSProperties}>
          <div className="kpi-label">Inventory Value (VND)</div>
          <div className="kpi-value" style={{ fontSize: 'var(--font-size-xl)' }}>{totalValue.toLocaleString('vi-VN')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <ImportExcel entityKey="inventory" entityLabel="Import Inventory" onImportComplete={fetchData} />
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          <Plus size={16} /> Add Inventory
        </button>
      </div>

      <FilterBar searchPlaceholder="Search by item code..." filters={filterCfg} onFilterChange={(f) => { setFilters(f); setPage(1); }} />
      <DataTable columns={columns} data={data} loading={loading} emptyIcon={<Box size={48} />} emptyTitle="No inventory records" emptyText="Import inventory snapshots or add records manually" />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Inventory Record" size="md">
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
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Quantity *</label>
            <input className="form-input" type="number" value={form.quantity} onChange={e => setForm({...form, quantity: parseFloat(e.target.value) || 0})} />
          </div>
          <div className="form-group">
            <label className="form-label">Unit Cost (VND)</label>
            <input className="form-input" type="number" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: parseFloat(e.target.value) || 0})} />
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Expiry Date</label>
            <input className="form-input" type="date" value={form.expiry_date} onChange={e => setForm({...form, expiry_date: e.target.value})} />
          </div>
          <div className="form-group">
            <label className="form-label">Batch Number</label>
            <input className="form-input" value={form.batch_number} onChange={e => setForm({...form, batch_number: e.target.value})} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={saving || !form.item_code || !form.warehouse_code}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Inventory Record" message="Are you sure? This action cannot be undone." />
    </>
  );
}
