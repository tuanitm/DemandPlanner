'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, ShoppingCart, Factory, Edit2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, PurchaseOrder, ProductionOrder } from '@/lib/api';

type Tab = 'po' | 'mo';

function NumericInput({ value, onChange, className, ...rest }: { value: number; onChange: (v: number) => void; className?: string; [k: string]: unknown }) {
  const [focused, setFocused] = useState(false);
  const [display, setDisplay] = useState('');

  useEffect(() => {
    if (!focused) setDisplay(value ? value.toLocaleString() : '0');
  }, [value, focused]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      className={className}
      value={display}
      onFocus={() => {
        setFocused(true);
        setDisplay(value ? value.toString() : '');
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseFloat(display.replace(/,/g, '')) || 0;
        const clamped = Math.max(0, parsed);
        onChange(clamped);
        setDisplay(clamped ? clamped.toLocaleString() : '0');
      }}
      onChange={(e) => {
        setDisplay(e.target.value);
        const parsed = parseFloat(e.target.value.replace(/,/g, '')) || 0;
        onChange(Math.max(0, parsed));
      }}
    />
  );
}

export default function OrdersPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('po');

  // PO state
  const [poData, setPoData] = useState<PurchaseOrder[]>([]);
  const [poTotal, setPoTotal] = useState(0);
  const [poPage, setPoPage] = useState(1);
  const [poPageSize, setPoPageSize] = useState(20);
  const [poLoading, setPoLoading] = useState(true);
  const [poFilters, setPoFilters] = useState<Record<string, string>>({ search: '', status: '' });

  // MO state
  const [moData, setMoData] = useState<ProductionOrder[]>([]);
  const [moTotal, setMoTotal] = useState(0);
  const [moPage, setMoPage] = useState(1);
  const [moPageSize, setMoPageSize] = useState(20);
  const [moLoading, setMoLoading] = useState(true);
  const [moFilters, setMoFilters] = useState<Record<string, string>>({ search: '', status: '' });

  const [showPoModal, setShowPoModal] = useState(false);
  const [showMoModal, setShowMoModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editPoId, setEditPoId] = useState<number | null>(null);
  const [editMoId, setEditMoId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<{ id: number; type: Tab } | null>(null);

  const [poForm, setPoForm] = useState({ po_number: '', item_code: '', partner_code: '', quantity: 0, currency: 'VND', unit_price: 0, eta: '', status: 'Confirmed', source: 'Manual' });
  const [moForm, setMoForm] = useState({ mo_number: '', item_code: '', warehouse_code: '', quantity: 0, completed_qty: 0, planned_date: '', status: 'Confirmed', source: 'Manual' });

  const fetchPO = useCallback(async () => {
    setPoLoading(true);
    try {
      const res = await transactionApi.purchaseOrders.list({ page: poPage, page_size: poPageSize, search: poFilters.search || undefined, status: poFilters.status || undefined });
      setPoData(res.items); setPoTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load POs', (e as Error).message); }
    finally { setPoLoading(false); }
  }, [poPage, poPageSize, poFilters, addToast]);

  const fetchMO = useCallback(async () => {
    setMoLoading(true);
    try {
      const res = await transactionApi.productionOrders.list({ page: moPage, page_size: moPageSize, search: moFilters.search || undefined, status: moFilters.status || undefined });
      setMoData(res.items); setMoTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load MOs', (e as Error).message); }
    finally { setMoLoading(false); }
  }, [moPage, moPageSize, moFilters, addToast]);

  useEffect(() => { if (tab === 'po') fetchPO(); }, [tab, fetchPO]);
  useEffect(() => { if (tab === 'mo') fetchMO(); }, [tab, fetchMO]);

  const handleSavePO = async () => {
    // Validate: no negative Quantity, Price, or Amount
    const warnings: string[] = [];
    if (poForm.quantity < 0) warnings.push('Quantity must not be negative');
    if (poForm.unit_price < 0) warnings.push('Unit Price must not be negative');
    if (poForm.quantity * poForm.unit_price < 0) warnings.push('Amount (Qty × Price) must not be negative');
    if (poForm.quantity <= 0) warnings.push('Quantity must be greater than 0');
    if (warnings.length > 0) {
      addToast('warning', 'Cannot save', warnings.join('. '));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...poForm, eta: poForm.eta || null, partner_code: poForm.partner_code || null };
      if (editPoId) {
        await transactionApi.purchaseOrders.update(editPoId, payload as never);
        addToast('success', 'Purchase Order updated');
      } else {
        await transactionApi.purchaseOrders.create(payload as never);
        addToast('success', 'Purchase Order created');
      }
      setShowPoModal(false); fetchPO();
    } catch (e) { addToast('error', 'Failed to save', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleSaveMO = async () => {
    // Validate: no negative or zero Quantity
    const warnings: string[] = [];
    if (moForm.quantity < 0) warnings.push('Quantity must not be negative');
    if (moForm.quantity <= 0) warnings.push('Quantity must be greater than 0');
    if (warnings.length > 0) {
      addToast('warning', 'Cannot save', warnings.join('. '));
      return;
    }
    setSaving(true);
    try {
      const payload = { ...moForm, planned_date: moForm.planned_date || null };
      if (editMoId) {
        await transactionApi.productionOrders.update(editMoId, payload as never);
        addToast('success', 'Production Order updated');
      } else {
        await transactionApi.productionOrders.create(payload as never);
        addToast('success', 'Production Order created');
      }
      setShowMoModal(false); fetchMO();
    } catch (e) { addToast('error', 'Failed to save', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreatePO = () => {
    setEditPoId(null);
    setPoForm({ po_number: '', item_code: '', partner_code: '', quantity: 0, currency: 'VND', unit_price: 0, eta: '', status: 'Confirmed', source: 'Manual' });
    setShowPoModal(true);
  };

  const openEditPO = (r: PurchaseOrder) => {
    setEditPoId(r.id);
    setPoForm({ po_number: r.po_number, item_code: r.item_code, partner_code: r.partner_code || '', quantity: r.quantity, currency: r.currency || 'VND', unit_price: r.unit_price, eta: r.eta || '', status: r.status, source: r.source });
    setShowPoModal(true);
  };

  const openCreateMO = () => {
    setEditMoId(null);
    setMoForm({ mo_number: '', item_code: '', warehouse_code: '', quantity: 0, completed_qty: 0, planned_date: '', status: 'Confirmed', source: 'Manual' });
    setShowMoModal(true);
  };

  const openEditMO = (r: ProductionOrder) => {
    setEditMoId(r.id);
    setMoForm({ mo_number: r.mo_number, item_code: r.item_code, warehouse_code: r.warehouse_code, quantity: r.quantity, completed_qty: r.completed_qty, planned_date: r.planned_date || '', status: r.status, source: r.source });
    setShowMoModal(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      if (deleteId.type === 'po') await transactionApi.purchaseOrders.delete(deleteId.id);
      else await transactionApi.productionOrders.delete(deleteId.id);
      addToast('success', 'Order deleted'); setDeleteId(null);
      if (deleteId.type === 'po') fetchPO(); else fetchMO();
    } catch (e) { addToast('error', 'Failed to delete', (e as Error).message); }
  };

  const statusBadge = (s: string) => {
    return <span>{s}</span>;
  };

  const poFilterCfg: FilterConfig[] = [
    { key: 'status', label: 'Status', options: [
      { value: '', label: 'All Statuses' },
      { value: 'Confirmed', label: 'Confirmed' }, { value: 'In Progress', label: 'In Progress' },
      { value: 'Completed', label: 'Completed' }, { value: 'Cancelled', label: 'Cancelled' },
    ]},
  ];

  const poCols: Column<PurchaseOrder>[] = [
    { key: 'po_number', header: 'PO NUMBER', render: r => <strong style={{ color: 'var(--color-accent-hover)' }}>{r.po_number}</strong> },
    { key: 'item_code', header: 'SKU CODE', render: r => <span>{r.item_code}</span> },
    { key: 'partner_code', header: 'PARTNER CODE', render: r => r.partner_code || '—' },
    { key: 'product_name', header: 'SKU NAME', render: r => <span>{r.product_name || '—'}</span> },
    { key: 'quantity', header: 'ORDER QTY', render: r => r.quantity.toLocaleString() },
    { key: 'currency', header: 'Currency', render: r => r.currency || 'VND' },
    { key: 'unit_price', header: 'UNIT PRICE', render: r => r.unit_price ? r.unit_price.toLocaleString() : '—' },
    { key: 'eta', header: 'ETA', render: r => r.eta || '—' },
    { key: 'status', header: 'STATUS', render: r => statusBadge(r.status) },
    { key: 'source', header: 'SOURCE', render: r => r.source || '—' },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditPO(r)} title="Edit"><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteId({ id: r.id, type: 'po' })} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const moCols: Column<ProductionOrder>[] = [
    { key: 'mo_number', header: 'MO NUMBER', render: r => <strong style={{ color: 'var(--color-accent-hover)' }}>{r.mo_number}</strong> },
    { key: 'item_code', header: 'SKU CODE', render: r => <span>{r.item_code}</span> },
    { key: 'warehouse_code', header: 'WAREHOUSE' },
    { key: 'quantity', header: 'PLANNED QTY', render: r => r.quantity.toLocaleString() },
    { key: 'completed_qty', header: 'COMPLETED', render: r => <span style={{ color: r.completed_qty >= r.quantity ? 'var(--color-success)' : 'var(--color-warning)' }}>{r.completed_qty.toLocaleString()}</span> },
    { key: 'planned_date', header: 'PLANNED DATE', render: r => r.planned_date || '—' },
    { key: 'status', header: 'STATUS', render: r => statusBadge(r.status) },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditMO(r)} title="Edit"><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteId({ id: r.id, type: 'mo' })} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  return (
    <>
      <div className="tabs">
        <button className={`tab-item ${tab === 'po' ? 'tab-active' : ''}`} onClick={() => setTab('po')}>
          <ShoppingCart size={16} style={{ marginRight: 6 }} /> Purchase Orders ({poTotal})
        </button>
        <button className={`tab-item ${tab === 'mo' ? 'tab-active' : ''}`} onClick={() => setTab('mo')}>
          <Factory size={16} style={{ marginRight: 6 }} /> Production Orders ({moTotal})
        </button>
      </div>

      {tab === 'po' && (<>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          <ImportExcel entityKey="purchase-orders" entityLabel="Purchase Orders" onImportComplete={fetchPO} />
          <button className="btn btn-primary" onClick={openCreatePO}><Plus size={16} /> Add PO</button>
        </div>
        <FilterBar searchPlaceholder="Search PO or item..." filters={poFilterCfg} onFilterChange={(f) => { setPoFilters(f); setPoPage(1); }} />
        <DataTable columns={poCols} data={poData} loading={poLoading} emptyIcon={<ShoppingCart size={48} />} emptyTitle="No purchase orders" emptyText="Import POs or create them manually" />
        <Pagination page={poPage} pageSize={poPageSize} total={poTotal} onPageChange={setPoPage} onPageSizeChange={s => { setPoPageSize(s); setPoPage(1); }} />
      </>)}

      {tab === 'mo' && (<>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          <ImportExcel entityKey="production-orders" entityLabel="Production Orders" onImportComplete={fetchMO} />
          <button className="btn btn-primary" onClick={openCreateMO}><Plus size={16} /> Add MO</button>
        </div>
        <FilterBar searchPlaceholder="Search MO or item..." filters={poFilterCfg} onFilterChange={(f) => { setMoFilters(f); setMoPage(1); }} />
        <DataTable columns={moCols} data={moData} loading={moLoading} emptyIcon={<Factory size={48} />} emptyTitle="No production orders" emptyText="Import MOs or create them manually" />
        <Pagination page={moPage} pageSize={moPageSize} total={moTotal} onPageChange={setMoPage} onPageSizeChange={s => { setMoPageSize(s); setMoPage(1); }} />
      </>)}

      {/* PO Modal */}
      <Modal isOpen={showPoModal} onClose={() => setShowPoModal(false)} title={editPoId ? "Edit Purchase Order" : "Create Purchase Order"} size="md">
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">PO Number *</label><input className="form-input" value={poForm.po_number} onChange={e => setPoForm({...poForm, po_number: e.target.value})} placeholder="e.g. PO-2026-001" /></div>
          <div className="form-group"><label className="form-label">SKU Code *</label><input className="form-input" value={poForm.item_code} onChange={e => setPoForm({...poForm, item_code: e.target.value})} placeholder="e.g. RM-001" /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Partner Code</label><input className="form-input" value={poForm.partner_code} onChange={e => setPoForm({...poForm, partner_code: e.target.value})} placeholder="e.g. BP-009" /></div>
          <div className="form-group"><label className="form-label">Order Qty *</label><NumericInput className="form-input" value={poForm.quantity} onChange={v => setPoForm({...poForm, quantity: v})} /></div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Currency</label><input className="form-input" value={poForm.currency} onChange={e => setPoForm({...poForm, currency: e.target.value})} placeholder="VND" /></div>
          <div className="form-group"><label className="form-label">Unit Price</label><NumericInput className="form-input" value={poForm.unit_price} onChange={v => setPoForm({...poForm, unit_price: v})} /></div>
          <div className="form-group"><label className="form-label">ETA</label><input className="form-input" type="date" value={poForm.eta} onChange={e => setPoForm({...poForm, eta: e.target.value})} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Source</label><input className="form-input" value={poForm.source} onChange={e => setPoForm({...poForm, source: e.target.value})} placeholder="e.g. Manual" /></div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input form-select" value={poForm.status} onChange={e => setPoForm({...poForm, status: e.target.value})}>
              <option value="Confirmed">Confirmed</option><option value="In Progress">In Progress</option>
              <option value="Completed">Completed</option><option value="Cancelled">Cancelled</option>
            </select>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowPoModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSavePO} disabled={saving || !poForm.po_number || !poForm.item_code}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : editPoId ? 'Save Changes' : 'Create PO'}
          </button>
        </div>
      </Modal>

      {/* MO Modal */}
      <Modal isOpen={showMoModal} onClose={() => setShowMoModal(false)} title={editMoId ? "Edit Production Order" : "Create Production Order"} size="md">
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">MO Number *</label><input className="form-input" value={moForm.mo_number} onChange={e => setMoForm({...moForm, mo_number: e.target.value})} placeholder="e.g. MO-2026-001" /></div>
          <div className="form-group"><label className="form-label">SKU Code *</label><input className="form-input" value={moForm.item_code} onChange={e => setMoForm({...moForm, item_code: e.target.value})} placeholder="e.g. SKU-001" /></div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Warehouse *</label><input className="form-input" value={moForm.warehouse_code} onChange={e => setMoForm({...moForm, warehouse_code: e.target.value})} placeholder="e.g. WH-BD1" /></div>
          <div className="form-group"><label className="form-label">Planned Qty *</label><NumericInput className="form-input" value={moForm.quantity} onChange={v => setMoForm({...moForm, quantity: v})} /></div>
          <div className="form-group"><label className="form-label">Planned Date</label><input className="form-input" type="date" value={moForm.planned_date} onChange={e => setMoForm({...moForm, planned_date: e.target.value})} /></div>
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input form-select" value={moForm.status} onChange={e => setMoForm({...moForm, status: e.target.value})}>
            <option value="Confirmed">Confirmed</option><option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option><option value="Cancelled">Cancelled</option>
          </select>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowMoModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSaveMO} disabled={saving || !moForm.mo_number || !moForm.item_code || moForm.quantity <= 0}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : editMoId ? 'Save Changes' : 'Create MO'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Order" message="Are you sure you want to delete this order? This action cannot be undone." />
    </>
  );
}
