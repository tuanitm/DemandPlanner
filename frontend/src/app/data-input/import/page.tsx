'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Trash2, Megaphone, Download, Edit2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, DemandAdhoc } from '@/lib/api';

export default function ImportPage() {
  const { addToast } = useToast();

  // Ad-hoc state
  const [adData, setAdData] = useState<DemandAdhoc[]>([]);
  const [adTotal, setAdTotal] = useState(0);
  const [adPage, setAdPage] = useState(1);
  const [adPageSize, setAdPageSize] = useState(20);
  const [adLoading, setAdLoading] = useState(true);
  const [adFilters, setAdFilters] = useState<Record<string, string>>({ search: '' });

  const [showAdModal, setShowAdModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [adForm, setAdForm] = useState({ item_code: '', warehouse_code: '', quantity: 0, demand_source: '', demand_date: '', notes: '' });

  const fetchAD = useCallback(async () => {
    setAdLoading(true);
    try {
      const res = await transactionApi.adhocDemand.list({ page: adPage, page_size: adPageSize, search: adFilters.search || undefined });
      setAdData(res.items); setAdTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load ad-hoc demand', (e as Error).message); }
    finally { setAdLoading(false); }
  }, [adPage, adPageSize, adFilters, addToast]);

  useEffect(() => { fetchAD(); }, [fetchAD]);

  const handleSaveAD = async () => {
    setSaving(true);
    try {
      const payload = { ...adForm, demand_source: adForm.demand_source || null, notes: adForm.notes || null };
      if (editId) {
        await transactionApi.adhocDemand.update(editId, payload as never);
        addToast('success', 'Ad-hoc demand updated');
      } else {
        await transactionApi.adhocDemand.create(payload as never);
        addToast('success', 'Ad-hoc demand created');
      }
      setShowAdModal(false); fetchAD();
    } catch (e) { addToast('error', 'Failed to save', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreateAD = () => {
    setEditId(null);
    setAdForm({ item_code: '', warehouse_code: '', quantity: 0, demand_source: '', demand_date: '', notes: '' });
    setShowAdModal(true);
  };

  const openEditAD = (r: DemandAdhoc) => {
    setEditId(r.id);
    setAdForm({ item_code: r.item_code, warehouse_code: r.warehouse_code, quantity: r.quantity, demand_source: r.demand_source || '', demand_date: r.demand_date, notes: r.notes || '' });
    setShowAdModal(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await transactionApi.adhocDemand.delete(deleteId);
      addToast('success', 'Record deleted'); setDeleteId(null);
      fetchAD();
    } catch (e) { addToast('error', 'Failed to delete', (e as Error).message); }
  };

  const adCols: Column<DemandAdhoc>[] = [
    { key: 'item_code', header: 'SKU CODE', render: r => <span>{r.item_code}</span> },
    { key: 'warehouse_code', header: 'WAREHOUSE' },
    { key: 'quantity', header: 'QUANTITY', render: r => <strong>{r.quantity.toLocaleString()}</strong> },
    { key: 'demand_source', header: 'SOURCE', render: r => r.demand_source || '—' },
    { key: 'demand_date', header: 'DATE', render: r => r.demand_date },
    { key: 'notes', header: 'NOTES', render: r => <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block' }}>{r.notes || '—'}</span> },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditAD(r)} title="Edit"><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const API_BASE = typeof window !== 'undefined' && (!process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL.includes('localhost')) ? `${window.location.protocol}//${window.location.hostname}:8000` : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');

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
              ['sales-forecast', 'Sales Forecast'],
              ['actual-sales', 'Sales Data'],
              ['inventory', 'Inventory'],
              ['purchase-orders', 'Purchase Orders'],
              ['production-orders', 'Production Orders'],
              ['adhoc-demand', 'Ad-hoc Demand'],
            ].map(([key, label]) => (
              <button key={key} className="btn btn-secondary" style={{ fontSize: 'var(--font-size-xs)' }} onClick={() => downloadTemplate(key)}>
                <Download size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Ad-hoc Demand Section */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
        <ImportExcel entityKey="adhoc-demand" entityLabel="Import Demand" onImportComplete={fetchAD} />
        <button className="btn btn-primary" onClick={openCreateAD}><Plus size={16} /> Add Ad-hoc</button>
      </div>
      <FilterBar searchPlaceholder="Search by item or source..." filters={[]} onFilterChange={(f) => { setAdFilters(f); setAdPage(1); }} />
      <DataTable columns={adCols} data={adData} loading={adLoading} emptyIcon={<Megaphone size={48} />} emptyTitle="No ad-hoc demand" emptyText="Add special orders, promotions, or one-time demand" />
      <Pagination page={adPage} pageSize={adPageSize} total={adTotal} onPageChange={setAdPage} onPageSizeChange={s => { setAdPageSize(s); setAdPage(1); }} />

      {/* Ad-hoc Modal */}
      <Modal isOpen={showAdModal} onClose={() => setShowAdModal(false)} title={editId ? "Edit Ad-hoc Demand" : "Add Ad-hoc Demand"} size="md">
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">SKU Code *</label><input className="form-input" value={adForm.item_code} onChange={e => setAdForm({...adForm, item_code: e.target.value})} placeholder="e.g. SKU-001" /></div>
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
          <button className="btn btn-primary" onClick={handleSaveAD} disabled={saving || !adForm.item_code || !adForm.demand_date}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : editId ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Record" message="Are you sure? This action cannot be undone." />
    </>
  );
}
