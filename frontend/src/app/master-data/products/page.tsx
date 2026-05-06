'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, ProductHierarchy, Item } from '@/lib/api';

type Tab = 'hierarchy' | 'items';

export default function ProductsPage() {
  const { addToast } = useToast();
  const [tab, setTab] = useState<Tab>('items');

  // Hierarchy state
  const [hierarchy, setHierarchy] = useState<ProductHierarchy[]>([]);
  const [hTotal, setHTotal] = useState(0);
  const [hPage, setHPage] = useState(1);
  const [hPageSize, setHPageSize] = useState(20);
  const [hLoading, setHLoading] = useState(true);
  const [hFilters, setHFilters] = useState<Record<string, string>>({ search: '' });

  // Items state
  const [items, setItems] = useState<Item[]>([]);
  const [iTotal, setITotal] = useState(0);
  const [iPage, setIPage] = useState(1);
  const [iPageSize, setIPageSize] = useState(20);
  const [iLoading, setILoading] = useState(true);
  const [iFilters, setIFilters] = useState<Record<string, string>>({ search: '', item_type: '', group_code: '' });

  // Modals
  const [showHModal, setShowHModal] = useState(false);
  const [showIModal, setShowIModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingH, setEditingH] = useState<ProductHierarchy | null>(null);
  const [deleteHTarget, setDeleteHTarget] = useState<ProductHierarchy | null>(null);
  const [deletingH, setDeletingH] = useState(false);

  const [editingI, setEditingI] = useState<Item | null>(null);
  const [deleteITarget, setDeleteITarget] = useState<Item | null>(null);
  const [deletingI, setDeletingI] = useState(false);

  const [hForm, setHForm] = useState({ business: '', brand: '', item_category_code: '', item_category_name: '', item_group_code: '', item_group_name: '', status: 'Active' });
  const [iForm, setIForm] = useState({ item_group_code: '', item_code: '', item_partner_code: '', item_name: '', item_for_name: '', uom: 'PCS', item_type: 'Finished Goods', status: 'Active', import_lead_time_days: 30, production_lead_time_days: 14 });

  const fetchHierarchy = useCallback(async () => {
    setHLoading(true);
    try {
      const res = await masterDataApi.productHierarchy.list({ page: hPage, page_size: hPageSize, search: hFilters.search || undefined });
      setHierarchy(res.items); setHTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load hierarchy', (e as Error).message); }
    finally { setHLoading(false); }
  }, [hPage, hPageSize, hFilters, addToast]);

  const fetchItems = useCallback(async () => {
    setILoading(true);
    try {
      const res = await masterDataApi.items.list({ page: iPage, page_size: iPageSize, search: iFilters.search || undefined, item_type: iFilters.item_type || undefined, group_code: iFilters.group_code || undefined });
      setItems(res.items); setITotal(res.total);
    } catch (e) { addToast('error', 'Failed to load items', (e as Error).message); }
    finally { setILoading(false); }
  }, [iPage, iPageSize, iFilters, addToast]);

  useEffect(() => { if (tab === 'hierarchy') fetchHierarchy(); }, [tab, fetchHierarchy]);
  useEffect(() => { if (tab === 'items') fetchItems(); }, [tab, fetchItems]);

  const handleSaveH = async () => {
    setSaving(true);
    try {
      if (editingH) {
        await masterDataApi.productHierarchy.update(editingH.item_group_code, hForm as Partial<ProductHierarchy>);
        addToast('success', 'Product hierarchy updated');
      } else {
        await masterDataApi.productHierarchy.create(hForm as unknown as ProductHierarchy);
        addToast('success', 'Product hierarchy created');
      }
      setShowHModal(false); setEditingH(null); fetchHierarchy();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDeleteH = async () => {
    if (!deleteHTarget) return;
    setDeletingH(true);
    try {
      await masterDataApi.productHierarchy.delete(deleteHTarget.item_group_code);
      addToast('success', 'Product hierarchy deleted'); setDeleteHTarget(null); fetchHierarchy();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setDeletingH(false); }
  };

  const handleSaveI = async () => {
    setSaving(true);
    try {
      if (editingI) {
        await masterDataApi.items.update(editingI.item_code, iForm as Partial<Item>);
        addToast('success', 'Item updated');
      } else {
        await masterDataApi.items.create(iForm as unknown as Item);
        addToast('success', 'Item created');
      }
      setShowIModal(false); setEditingI(null); fetchItems();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const handleDeleteI = async () => {
    if (!deleteITarget) return;
    setDeletingI(true);
    try {
      await masterDataApi.items.delete(deleteITarget.item_code);
      addToast('success', 'Item deleted'); setDeleteITarget(null); fetchItems();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setDeletingI(false); }
  };

  const hCols: Column<ProductHierarchy>[] = [
    { key: 'item_group_code', header: 'Group Code', width: '120px', render: (r) => <span className="badge badge-info">{r.item_group_code}</span> },
    { key: 'item_group_name', header: 'Group Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.item_group_name}</span> },
    { key: 'business', header: 'Business', width: '120px' },
    { key: 'brand', header: 'Brand', width: '120px' },
    { key: 'item_category_code', header: 'Category', width: '100px' },
    { key: 'item_category_name', header: 'Category Name', width: '160px' },
    { key: 'status', header: 'Status', width: '90px', render: (r) => <span className={`badge ${r.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{r.status}</span> },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditH(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteHTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const iCols: Column<Item>[] = [
    { key: 'item_code', header: 'SKU Code', width: '120px', render: (r) => <span className="badge badge-info">{r.item_code}</span> },
    { key: 'item_name', header: 'Product Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.item_name}</span> },
    { key: 'item_group_code', header: 'Group', width: '110px' },
    { key: 'item_type', header: 'Type', width: '150px', render: (r) => <span className={`badge ${r.item_type === 'Finished Goods' ? 'badge-success' : r.item_type === 'Semi-Finished Goods' ? 'badge-info' : r.item_type === 'Raw Material' ? 'badge-warning' : 'badge-info'}`}>{r.item_type}</span> },
    { key: 'uom', header: 'UoM', width: '70px' },
    { key: 'import_lead_time_days', header: 'Import LT', width: '90px', render: (r) => `${r.import_lead_time_days}d` },
    { key: 'production_lead_time_days', header: 'Prod LT', width: '90px', render: (r) => `${r.production_lead_time_days}d` },
    { key: 'status', header: 'Status', width: '90px', render: (r) => <span className={`badge ${r.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{r.status}</span> },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditI(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteITarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const itemFilterCfg: FilterConfig[] = [
    { key: 'item_type', label: 'Type', options: [{ value: '', label: 'All Types' }, { value: 'Goods', label: 'Goods' }, { value: 'Finished Goods', label: 'Finished Goods' }, { value: 'Semi-Finished Goods', label: 'Semi-Finished Goods' }, { value: 'Raw Material', label: 'Raw Material' }] },
  ];

  const openCreateH = () => { setEditingH(null); setHForm({ business: '', brand: '', item_category_code: '', item_category_name: '', item_group_code: '', item_group_name: '', status: 'Active' }); setShowHModal(true); };
  const openEditH = (h: ProductHierarchy) => { setEditingH(h); setHForm({ business: h.business, brand: h.brand, item_category_code: h.item_category_code, item_category_name: h.item_category_name, item_group_code: h.item_group_code, item_group_name: h.item_group_name, status: h.status }); setShowHModal(true); };

  const openCreateI = () => { setEditingI(null); setIForm({ item_group_code: '', item_code: '', item_partner_code: '', item_name: '', item_for_name: '', uom: 'PCS', item_type: 'Finished Goods', status: 'Active', import_lead_time_days: 30, production_lead_time_days: 14 }); setShowIModal(true); };
  const openEditI = (i: Item) => { setEditingI(i); setIForm({ item_group_code: i.item_group_code, item_code: i.item_code, item_partner_code: i.item_partner_code || '', item_name: i.item_name, item_for_name: i.item_for_name || '', uom: i.uom, item_type: i.item_type, status: i.status, import_lead_time_days: i.import_lead_time_days, production_lead_time_days: i.production_lead_time_days }); setShowIModal(true); };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Products & SKUs</h1>
          <p className="page-description">Manage product hierarchy and item master data</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <ImportExcel entityKey={tab === 'hierarchy' ? 'product-hierarchy' : 'items'} entityLabel={tab === 'hierarchy' ? 'Product Hierarchy' : 'Items'} onImportComplete={tab === 'hierarchy' ? fetchHierarchy : fetchItems} />
          <button className="btn btn-primary" onClick={tab === 'hierarchy' ? openCreateH : openCreateI}>
            <Plus size={16} /> {tab === 'hierarchy' ? 'Add Group' : 'Add Item'}
          </button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${tab === 'items' ? 'tab-active' : ''}`} onClick={() => setTab('items')}>Items / SKUs</button>
        <button className={`tab-item ${tab === 'hierarchy' ? 'tab-active' : ''}`} onClick={() => setTab('hierarchy')}>Product Hierarchy</button>
      </div>

      {tab === 'items' && (<>
        <FilterBar searchPlaceholder="Search items..." filters={itemFilterCfg} onFilterChange={(f) => { setIFilters(f); setIPage(1); }} />
        <DataTable columns={iCols} data={items} loading={iLoading} rowKey={(r) => r.id} />
        <Pagination page={iPage} pageSize={iPageSize} total={iTotal} onPageChange={setIPage} onPageSizeChange={(s) => { setIPageSize(s); setIPage(1); }} />
      </>)}

      {tab === 'hierarchy' && (<>
        <FilterBar searchPlaceholder="Search groups..." onFilterChange={(f) => { setHFilters(f); setHPage(1); }} />
        <DataTable columns={hCols} data={hierarchy} loading={hLoading} rowKey={(r) => r.id} />
        <Pagination page={hPage} pageSize={hPageSize} total={hTotal} onPageChange={setHPage} onPageSizeChange={(s) => { setHPageSize(s); setHPage(1); }} />
      </>)}

      {/* Create Hierarchy Modal */}
      <Modal isOpen={showHModal} onClose={() => { setShowHModal(false); setEditingH(null); }} title={editingH ? "Edit Product Group" : "New Product Group"} size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowHModal(false); setEditingH(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleSaveH} disabled={saving}>{saving && <span className="loading-spinner" />}{editingH ? 'Update' : 'Create'}</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Business *</label><input className="form-input" placeholder="e.g. FMCG" value={hForm.business} onChange={(e) => setHForm({ ...hForm, business: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Brand *</label><input className="form-input" placeholder="e.g. Unilever" value={hForm.brand} onChange={(e) => setHForm({ ...hForm, brand: e.target.value })} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Category Code *</label><input className="form-input" placeholder="e.g. CAT-01" value={hForm.item_category_code} onChange={(e) => setHForm({ ...hForm, item_category_code: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Category Name *</label><input className="form-input" placeholder="e.g. Skincare" value={hForm.item_category_name} onChange={(e) => setHForm({ ...hForm, item_category_name: e.target.value })} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Group Code *</label><input className="form-input" placeholder="e.g. GRP-01" value={hForm.item_group_code} onChange={(e) => setHForm({ ...hForm, item_group_code: e.target.value })} disabled={!!editingH} /></div>
          <div className="form-group"><label className="form-label">Group Name *</label><input className="form-input" placeholder="e.g. Face Cream" value={hForm.item_group_name} onChange={(e) => setHForm({ ...hForm, item_group_name: e.target.value })} /></div>
        </div>
      </Modal>

      {/* Create Item Modal */}
      <Modal isOpen={showIModal} onClose={() => { setShowIModal(false); setEditingI(null); }} title={editingI ? "Edit Item / SKU" : "New Item / SKU"} size="lg"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowIModal(false); setEditingI(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleSaveI} disabled={saving}>{saving && <span className="loading-spinner" />}{editingI ? 'Update' : 'Create'}</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Product Group *</label>
            <select className="form-input form-select" value={iForm.item_group_code} onChange={(e) => setIForm({ ...iForm, item_group_code: e.target.value })}>
              <option value="">Select group...</option>{hierarchy.map(h => <option key={h.item_group_code} value={h.item_group_code}>{h.item_group_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Item Code *</label><input className="form-input" placeholder="e.g. SKU-001" value={iForm.item_code} onChange={(e) => setIForm({ ...iForm, item_code: e.target.value })} disabled={!!editingI} /></div>
        </div>
        <div className="form-group"><label className="form-label">Item Name *</label><input className="form-input" placeholder="Product name" value={iForm.item_name} onChange={(e) => setIForm({ ...iForm, item_name: e.target.value })} /></div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Type *</label><select className="form-input form-select" value={iForm.item_type} onChange={(e) => setIForm({ ...iForm, item_type: e.target.value })}><option value="Goods">Goods</option><option value="Finished Goods">Finished Goods</option><option value="Semi-Finished Goods">Semi-Finished Goods</option><option value="Raw Material">Raw Material</option></select></div>
          <div className="form-group"><label className="form-label">UoM *</label><input className="form-input" placeholder="PCS" value={iForm.uom} onChange={(e) => setIForm({ ...iForm, uom: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Import Lead Time (days)</label><input className="form-input" type="number" value={iForm.import_lead_time_days} onChange={(e) => setIForm({ ...iForm, import_lead_time_days: Number(e.target.value) })} /></div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Production Lead Time (days)</label><input className="form-input" type="number" value={iForm.production_lead_time_days} onChange={(e) => setIForm({ ...iForm, production_lead_time_days: Number(e.target.value) })} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Foreign Name</label><input className="form-input" placeholder="Optional" value={iForm.item_for_name} onChange={(e) => setIForm({ ...iForm, item_for_name: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Partner Code</label><input className="form-input" placeholder="Optional" value={iForm.item_partner_code} onChange={(e) => setIForm({ ...iForm, item_partner_code: e.target.value })} /></div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteHTarget} onClose={() => setDeleteHTarget(null)} onConfirm={handleDeleteH} loading={deletingH}
        title="Delete Product Group" message={`Delete group "${deleteHTarget?.item_group_name}"?`} />

      <ConfirmDialog isOpen={!!deleteITarget} onClose={() => setDeleteITarget(null)} onConfirm={handleDeleteI} loading={deletingI}
        title="Delete Item" message={`Are you sure you want to delete "${deleteITarget?.item_name}"?`} />
    </div>
  );
}
