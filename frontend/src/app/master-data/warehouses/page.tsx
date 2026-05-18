'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
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

  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    const fetchAll = async () => {
      try {
        let all: Warehouse[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.warehouses.list({ page: p, page_size: 50 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllWarehouses(all);
      } catch (e) { console.error("Failed to fetch all warehouses", e); }
    };
    fetchAll();
  }, []);

  const regionsList = useMemo(() => {
    return [...new Set(allWarehouses.map(w => w.warehouse_region))].filter(Boolean).sort();
  }, [allWarehouses]);

  const [searchInput, setSearchInput] = useState(filters.search || '');
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters(prev => {
        if (prev.search !== searchInput) {
          setPage(1);
          return { ...prev, search: searchInput };
        }
        return prev;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

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

  // Replaced FilterBar with inline filters

  const columns: Column<Warehouse>[] = [
    { key: 'warehouse_code', header: 'Code', width: '120px' },
    { key: 'warehouse_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.warehouse_name}</span> },
    { key: 'warehouse_region', header: 'Region', width: '140px' },
    { key: 'warehouse_attribute', header: 'Attribute', width: '160px', render: (r) => r.warehouse_attribute || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'warehouse_status', header: 'Status', width: '100px' },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouses</h1>
          <p className="page-description">Manage warehouse locations and regions</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <ImportExcel entityKey="warehouses" entityLabel="Warehouses" onImportComplete={fetchData} />
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Warehouse</button>
        </div>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)',
        padding: '0 0 var(--space-4)',
        alignItems: 'center',
      }}>
        <select
          id="filter-region"
          className="form-input form-select"
          style={{ width: 170 }}
          value={filters.region || ''}
          onChange={e => {
            setFilters(prev => ({ ...prev, region: e.target.value }));
            setPage(1);
          }}
        >
          <option value="">All Regions</option>
          {regionsList.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <div style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search warehouses..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={{
              padding: '8px 14px 8px 32px',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)',
              outline: 'none',
              width: '250px'
            }}
          />
        </div>

        {(filters.region || searchInput) && (
          <button
            onClick={() => { 
              setFilters({ search: '', region: '' }); 
              setSearchInput('');
              setPage(1); 
            }}
            style={{
              padding: '8px 14px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              color: '#ef4444',
              fontSize: 'var(--font-size-xs)',
              cursor: 'pointer',
              fontWeight: 500,
              transition: 'all 0.15s ease',
            }}
          >
            Clear Filters
          </button>
        )}
      </div>
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
