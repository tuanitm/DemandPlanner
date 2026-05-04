'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, PackageCheck, Megaphone, Download } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, StockInTransaction, DemandAdhoc } from '@/lib/api';

type Tab = 'stock-in' | 'adhoc';

export default function ImportPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('stock-in');

  // Stock-In state
  const [siData, setSiData] = useState<StockInTransaction[]>([]);
  const [siTotal, setSiTotal] = useState(0);
  const [siPage, setSiPage] = useState(1);
  const [siPageSize, setSiPageSize] = useState(20);
  const [siLoading, setSiLoading] = useState(true);
  const [siFilters, setSiFilters] = useState<Record<string, string>>({ search: '', trans_type: '' });

  // Ad-hoc state
  const [adData, setAdData] = useState<DemandAdhoc[]>([]);
  const [adTotal, setAdTotal] = useState(0);
  const [adPage, setAdPage] = useState(1);
  const [adPageSize, setAdPageSize] = useState(20);
  const [adLoading, setAdLoading] = useState(true);
  const [adFilters, setAdFilters] = useState<Record<string, string>>({ search: '' });

  const [showSiModal, setShowSiModal] = useState(false);
  const [showAdModal, setShowAdModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<{ id: number; type: Tab } | null>(null);

  const [siForm, setSiForm] = useState({ trans_type: 'Supplier Receipt', item_code: '', warehouse_code: '', quantity: 0, reference_number: '', trans_date: '', source: 'Manual' });
  const [adForm, setAdForm] = useState({ item_code: '', warehouse_code: '', quantity: 0, demand_source: '', demand_date: '', notes: '' });

  const fetchSI = useCallback(async () => {
    setSiLoading(true);
    try {
      const res = await transactionApi.stockIn.list({ page: siPage, page_size: siPageSize, search: siFilters.search || undefined, trans_type: siFilters.trans_type || undefined });
      setSiData(res.items); setSiTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load stock-in', (e as Error).message); }
    finally { setSiLoading(false); }
  }, [siPage, siPageSize, siFilters, addToast]);

  const fetchAD = useCallback(async () => {
    setAdLoading(true);
    try {
      const res = await transactionApi.adhocDemand.list({ page: adPage, page_size: adPageSize, search: adFilters.search || undefined });
      setAdData(res.items); setAdTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load ad-hoc demand', (e as Error).message); }
    finally { setAdLoading(false); }
  }, [adPage, adPageSize, adFilters, addToast]);

  useEffect(() => { if (tab === 'stock-in') fetchSI(); }, [tab, fetchSI]);
  useEffect(() => { if (tab === 'adhoc') fetchAD(); }, [tab, fetchAD]);

  const handleCreateSI = async () => {
    setSaving(true);
    try {
      const payload = { ...siForm, reference_number: siForm.reference_number || null };
      await transactionApi.stockIn.create(payload as never);
      addToast('success', 'Stock-in record created'); setShowSiModal(false); fetchSI();
    } catch (e) { addToast('error', 'Failed to create', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleCreateAD = async () => {
    setSaving(true);
    try {
      const payload = { ...adForm, demand_source: adForm.demand_source || null, notes: adForm.notes || null };
      await transactionApi.adhocDemand.create(payload as never);
      addToast('success', 'Ad-hoc demand created'); setShowAdModal(false); fetchAD();
    } catch (e) { addToast('error', 'Failed to create', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      if (deleteId.type === 'stock-in') await transactionApi.stockIn.delete(deleteId.id);
      else await transactionApi.adhocDemand.delete(deleteId.id);
      addToast('success', 'Record deleted'); setDeleteId(null);
      if (deleteId.type === 'stock-in') fetchSI(); else fetchAD();
    } catch (e) { addToast('error', 'Failed to delete', (e as Error).message); }
  };

  const siFilterCfg: FilterConfig[] = [
    { key: 'trans_type', label: 'Type', options: [
      { value: '', label: 'All Types' },
      { value: 'Supplier Receipt', label: 'Supplier Receipt' },
      { value: 'Production Receipt', label: 'Production Receipt' },
      { value: 'Other Receipt', label: 'Other Receipt' },
    ]},
  ];

  const typeBadge = (t: string) => {
    const cls = t.includes('Supplier') ? 'badge-info' : t.includes('Production') ? 'badge-success' : 'badge-warning';
    return <span className={`badge ${cls}`}>{t}</span>;
  };

  const siCols: Column<StockInTransaction>[] = [
    { key: 'trans_type', header: 'TYPE', render: r => typeBadge(r.trans_type) },
    { key: 'item_code', header: 'ITEM CODE', render: r => <span className="badge badge-info">{r.item_code}</span> },
    { key: 'warehouse_code', header: 'WAREHOUSE' },
    { key: 'quantity', header: 'QUANTITY', render: r => r.quantity.toLocaleString() },
    { key: 'reference_number', header: 'REFERENCE #', render: r => r.reference_number || '—' },
    { key: 'trans_date', header: 'DATE', render: r => r.trans_date },
    { key: 'source', header: 'SOURCE', render: r => <span className={`badge ${r.source === 'SAP' ? 'badge-info' : 'badge-warning'}`}>{r.source}</span> },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions"><button className="table-action-btn danger" onClick={() => setDeleteId({ id: r.id, type: 'stock-in' })} title="Delete"><Trash2 size={14} /></button></div>
    )},
  ];

  const adCols: Column<DemandAdhoc>[] = [
    { key: 'item_code', header: 'ITEM CODE', render: r => <span className="badge badge-info">{r.item_code}</span> },
    { key: 'warehouse_code', header: 'WAREHOUSE' },
    { key: 'quantity', header: 'QUANTITY', render: r => <strong>{r.quantity.toLocaleString()}</strong> },
    { key: 'demand_source', header: 'SOURCE', render: r => r.demand_source || '—' },
    { key: 'demand_date', header: 'DATE', render: r => r.demand_date },
    { key: 'notes', header: 'NOTES', render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{r.notes || '—'}</span> },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions"><button className="table-action-btn danger" onClick={() => setDeleteId({ id: r.id, type: 'adhoc' })} title="Delete"><Trash2 size={14} /></button></div>
    )},
  ];

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const downloadTemplate = async (entity: string) => {
    const token = localStorage.getItem('dp_token');
    try {
      const res = await fetch(`${API_BASE}/api/master-data/import/template/${entity}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${entity}_template.xlsx`; a.click();
      URL.revokeObjectURL(url);
    } catch { addToast('error', 'Download failed'); }
  };

  return (
    <>
      {/* Template Downloads Banner */}
      <div className="card" style={{ marginBottom: 'var(--space-6)', background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
        <div style={{ padding: 'var(--space-4)' }}>
          <h3 style={{ marginBottom: 'var(--space-3)', color: 'var(--color-accent)' }}>📥 Excel Templates</h3>
          <p style={{ marginBottom: 'var(--space-3)', opacity: 0.8, fontSize: 'var(--font-size-sm)' }}>Download pre-formatted Excel templates for bulk data import</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {[
              ['actual-sales', 'Sales Data'],
              ['inventory', 'Inventory'],
              ['purchase-orders', 'Purchase Orders'],
              ['production-orders', 'Production Orders'],
              ['stock-in', 'Stock-In'],
              ['adhoc-demand', 'Ad-hoc Demand'],
            ].map(([key, label]) => (
              <button key={key} className="btn btn-secondary" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => downloadTemplate(key)}>
                <Download size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${tab === 'stock-in' ? 'tab-active' : ''}`} onClick={() => setTab('stock-in')}>
          <PackageCheck size={16} style={{ marginRight: 6 }} /> Stock-In ({siTotal})
        </button>
        <button className={`tab-item ${tab === 'adhoc' ? 'tab-active' : ''}`} onClick={() => setTab('adhoc')}>
          <Megaphone size={16} style={{ marginRight: 6 }} /> Ad-hoc Demand ({adTotal})
        </button>
      </div>

      {tab === 'stock-in' && (<>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          <ImportExcel entityKey="stock-in" entityLabel="Import Stock-In" onImportComplete={fetchSI} />
          <button className="btn btn-primary" onClick={() => setShowSiModal(true)}><Plus size={16} /> Add Stock-In</button>
        </div>
        <FilterBar searchPlaceholder="Search by item or reference..." filters={siFilterCfg} onFilterChange={(f) => { setSiFilters(f); setSiPage(1); }} />
        <DataTable columns={siCols} data={siData} loading={siLoading} emptyIcon={<PackageCheck size={48} />} emptyTitle="No stock-in records" emptyText="Import or add stock receipts manually" />
        <Pagination page={siPage} pageSize={siPageSize} total={siTotal} onPageChange={setSiPage} onPageSizeChange={s => { setSiPageSize(s); setSiPage(1); }} />
      </>)}

      {tab === 'adhoc' && (<>
        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
          <ImportExcel entityKey="adhoc-demand" entityLabel="Import Demand" onImportComplete={fetchAD} />
          <button className="btn btn-primary" onClick={() => setShowAdModal(true)}><Plus size={16} /> Add Ad-hoc</button>
        </div>
        <FilterBar searchPlaceholder="Search by item or source..." filters={[]} onFilterChange={(f) => { setAdFilters(f); setAdPage(1); }} />
        <DataTable columns={adCols} data={adData} loading={adLoading} emptyIcon={<Megaphone size={48} />} emptyTitle="No ad-hoc demand" emptyText="Add special orders, promotions, or one-time demand" />
        <Pagination page={adPage} pageSize={adPageSize} total={adTotal} onPageChange={setAdPage} onPageSizeChange={s => { setAdPageSize(s); setAdPage(1); }} />
      </>)}

      {/* Stock-In Modal */}
      <Modal isOpen={showSiModal} onClose={() => setShowSiModal(false)} title="Add Stock-In Transaction" size="md">
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Type *</label>
            <select className="form-input form-select" value={siForm.trans_type} onChange={e => setSiForm({...siForm, trans_type: e.target.value})}>
              <option value="Supplier Receipt">Supplier Receipt</option>
              <option value="Production Receipt">Production Receipt</option>
              <option value="Other Receipt">Other Receipt</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Item Code *</label><input className="form-input" value={siForm.item_code} onChange={e => setSiForm({...siForm, item_code: e.target.value})} placeholder="e.g. RM-001" /></div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Warehouse *</label><input className="form-input" value={siForm.warehouse_code} onChange={e => setSiForm({...siForm, warehouse_code: e.target.value})} placeholder="e.g. WH-BD1" /></div>
          <div className="form-group"><label className="form-label">Quantity *</label><input className="form-input" type="number" value={siForm.quantity} onChange={e => setSiForm({...siForm, quantity: parseFloat(e.target.value) || 0})} /></div>
          <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={siForm.trans_date} onChange={e => setSiForm({...siForm, trans_date: e.target.value})} /></div>
        </div>
        <div className="form-group"><label className="form-label">Reference #</label><input className="form-input" value={siForm.reference_number} onChange={e => setSiForm({...siForm, reference_number: e.target.value})} placeholder="e.g. PO-2026-001" /></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowSiModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreateSI} disabled={saving || !siForm.item_code || !siForm.trans_date}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : 'Create'}
          </button>
        </div>
      </Modal>

      {/* Ad-hoc Modal */}
      <Modal isOpen={showAdModal} onClose={() => setShowAdModal(false)} title="Add Ad-hoc Demand" size="md">
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Item Code *</label><input className="form-input" value={adForm.item_code} onChange={e => setAdForm({...adForm, item_code: e.target.value})} placeholder="e.g. SKU-001" /></div>
          <div className="form-group"><label className="form-label">Warehouse *</label><input className="form-input" value={adForm.warehouse_code} onChange={e => setAdForm({...adForm, warehouse_code: e.target.value})} placeholder="e.g. WH-HCM1" /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Quantity *</label><input className="form-input" type="number" value={adForm.quantity} onChange={e => setAdForm({...adForm, quantity: parseFloat(e.target.value) || 0})} /></div>
          <div className="form-group"><label className="form-label">Date *</label><input className="form-input" type="date" value={adForm.demand_date} onChange={e => setAdForm({...adForm, demand_date: e.target.value})} /></div>
        </div>
        <div className="form-group"><label className="form-label">Demand Source</label><input className="form-input" value={adForm.demand_source} onChange={e => setAdForm({...adForm, demand_source: e.target.value})} placeholder="e.g. Tet Promotion" /></div>
        <div className="form-group"><label className="form-label">Notes</label><textarea className="form-input" rows={3} value={adForm.notes} onChange={e => setAdForm({...adForm, notes: e.target.value})} placeholder="Additional details..." /></div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => setShowAdModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreateAD} disabled={saving || !adForm.item_code || !adForm.demand_date}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Record" message="Are you sure? This action cannot be undone." />
    </>
  );
}
