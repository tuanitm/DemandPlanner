'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, Warehouse } from '@/lib/api';

export default function WarehousesPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<Warehouse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({ search: '', region: '' });

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ warehouse_region: '', warehouse_code: '', warehouse_name: '', warehouse_attribute: '', warehouse_status: 'Active' });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await masterDataApi.warehouses.list({ page, page_size: pageSize, search: filters.search || undefined, region: filters.region || undefined });
      setData(res.items); setTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load warehouses', (e as Error).message); }
    finally { setLoading(false); }
  }, [page, pageSize, filters, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await masterDataApi.warehouses.create(form as unknown as Warehouse);
      addToast('success', 'Warehouse created'); setShowModal(false); fetchData();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setForm({ warehouse_region: '', warehouse_code: '', warehouse_name: '', warehouse_attribute: '', warehouse_status: 'Active' });
    setShowModal(true);
  };

  // Extract unique regions for filter
  const regions = [...new Set(data.map(w => w.warehouse_region))].sort();
  const filterCfg: FilterConfig[] = [
    { key: 'region', label: 'Region', options: [{ value: '', label: 'All Regions' }, ...regions.map(r => ({ value: r, label: r }))] },
  ];

  const columns: Column<Warehouse>[] = [
    { key: 'warehouse_code', header: 'Code', width: '120px', render: (r) => <span className="badge badge-info">{r.warehouse_code}</span> },
    { key: 'warehouse_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.warehouse_name}</span> },
    { key: 'warehouse_region', header: 'Region', width: '140px' },
    { key: 'warehouse_attribute', header: 'Attribute', width: '160px', render: (r) => r.warehouse_attribute || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'warehouse_status', header: 'Status', width: '100px', render: (r) => <span className={`badge ${r.warehouse_status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{r.warehouse_status}</span> },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouses</h1>
          <p className="page-description">Manage warehouse locations and regions</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Warehouse</button>
      </div>

      <FilterBar searchPlaceholder="Search warehouses..." filters={filterCfg} onFilterChange={(f) => { setFilters(f); setPage(1); }} />
      <DataTable columns={columns} data={data} loading={loading} rowKey={(r) => r.id} />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Warehouse" size="md"
        footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving && <span className="loading-spinner" />}Create</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Warehouse Code *</label><input className="form-input" placeholder="e.g. WH-01" value={form.warehouse_code} onChange={(e) => setForm({ ...form, warehouse_code: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Region *</label><input className="form-input" placeholder="e.g. South" value={form.warehouse_region} onChange={(e) => setForm({ ...form, warehouse_region: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Warehouse Name *</label><input className="form-input" placeholder="Full name" value={form.warehouse_name} onChange={(e) => setForm({ ...form, warehouse_name: e.target.value })} /></div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Attribute</label><input className="form-input" placeholder="e.g. Cold Storage" value={form.warehouse_attribute} onChange={(e) => setForm({ ...form, warehouse_attribute: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Status</label><select className="form-input form-select" value={form.warehouse_status} onChange={(e) => setForm({ ...form, warehouse_status: e.target.value })}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
        </div>
      </Modal>
    </div>
  );
}
