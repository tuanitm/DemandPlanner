'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Box, Edit2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { transactionApi, masterDataApi, InventoryOnhand, Item, Warehouse, ProductHierarchy } from '@/lib/api';

export default function InventoryPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<InventoryOnhand[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{search: string, warehouse_code: string[], brand: string[], group_code: string[]}>({ search: '', warehouse_code: [], brand: [], group_code: [] });
  const [showWarehouseDropdown, setShowWarehouseDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const [allWarehouses, setAllWarehouses] = useState<Warehouse[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [allHierarchy, setAllHierarchy] = useState<ProductHierarchy[]>([]);
  const [allInventory, setAllInventory] = useState<InventoryOnhand[]>([]);

  useEffect(() => {
    const fetchMasterData = async () => {
      try {
        let p = 1; let w: Warehouse[] = [];
        while (true) {
          const res = await masterDataApi.warehouses.list({ page: p, page_size: 50 });
          w = [...w, ...res.items];
          if (w.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllWarehouses(w);

        p = 1; let i: Item[] = [];
        while (true) {
          const res = await masterDataApi.items.list({ page: p, page_size: 50 });
          i = [...i, ...res.items];
          if (i.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllItems(i);

        p = 1; let h: ProductHierarchy[] = [];
        while (true) {
          const res = await masterDataApi.productHierarchy.list({ page: p, page_size: 50 });
          h = [...h, ...res.items];
          if (h.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllHierarchy(h);
      } catch (e) { console.error("Failed to fetch master data", e); }
    };
    fetchMasterData();
  }, []);

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

  const brands = useMemo(() => {
    return [...new Set(allHierarchy.map(h => h.brand))].filter(Boolean).sort();
  }, [allHierarchy]);

  const productGroups = useMemo(() => {
    const filtered = filters.brand.length > 0
      ? allHierarchy.filter(h => filters.brand.includes(h.brand))
      : allHierarchy;
    const unique: {code: string, name: string}[] = [];
    const seen = new Set();
    for (const h of filtered) {
      if (h.item_group_code && !seen.has(h.item_group_code)) {
        seen.add(h.item_group_code);
        unique.push({ code: h.item_group_code, name: h.item_group_name });
      }
    }
    return unique.sort((a, b) => a.name.localeCompare(b.name));
  }, [allHierarchy, filters.brand]);

  useEffect(() => {
    if (filters.group_code.length > 0) {
      const validCodes = filters.group_code.filter(c => productGroups.some(pg => pg.code === c));
      if (validCodes.length !== filters.group_code.length) {
        setFilters(prev => ({ ...prev, group_code: validCodes }));
        setPage(1);
      }
    }
  }, [productGroups, filters.group_code]);

  const filteredInventory = useMemo(() => {
    return allInventory.filter(d => {
      const dItemCode = (d.item_code || '').trim().toLowerCase();
      const dWarehouseCode = (d.warehouse_code || '').trim().toLowerCase();

      // Filter by Search
      if (filters.search && !dItemCode.includes(filters.search.toLowerCase())) {
        const item = allItems.find(i => (i.item_code || '').trim().toLowerCase() === dItemCode);
        if (!item || !(item.item_name || '').toLowerCase().includes(filters.search.toLowerCase())) {
          return false;
        }
      }

      // Filter by Warehouse
      if (filters.warehouse_code.length > 0 && !filters.warehouse_code.some(c => c.trim().toLowerCase() === dWarehouseCode)) {
        return false;
      }

      // Filter by Brand / Product Group
      if (filters.brand.length > 0 || filters.group_code.length > 0) {
        const item = allItems.find(i => (i.item_code || '').trim().toLowerCase() === dItemCode);
        if (!item) return false;
        if (filters.group_code.length > 0) {
          if (!filters.group_code.includes(item.item_group_code)) return false;
        } else if (filters.brand.length > 0) {
          const group = allHierarchy.find(h => h.item_group_code === item.item_group_code);
          if (!group || !filters.brand.includes(group.brand)) return false;
        }
      }

      return true;
    });
  }, [allInventory, filters, allItems, allHierarchy]);

  const displayedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    const paged = filteredInventory.slice(start, start + pageSize);
    return paged.map(d => {
      const dItemCode = (d.item_code || '').trim().toLowerCase();
      const dWarehouseCode = (d.warehouse_code || '').trim().toLowerCase();
      const item = allItems.find(i => (i.item_code || '').trim().toLowerCase() === dItemCode);
      const warehouse = allWarehouses.find(w => (w.warehouse_code || '').trim().toLowerCase() === dWarehouseCode);
      return {
        ...d,
        item_name: item ? item.item_name : 'Unknown SKU',
        item_attribute: item?.item_attribute || null,
        warehouse_name: warehouse ? warehouse.warehouse_name : 'Unknown Warehouse'
      };
    });
  }, [filteredInventory, page, pageSize, allItems, allWarehouses]);

  const total = filteredInventory.length;

  const [form, setForm] = useState({
    item_code: '', warehouse_code: '', quantity: 0,
    unit_cost: 0, expiry_date: '', batch_number: ''
  });

  const fetchAllInventory = useCallback(async () => {
    setLoading(true);
    try {
      let all: InventoryOnhand[] = [];
      let p = 1;
      while (true) {
        const res = await transactionApi.inventory.list({ page: p, page_size: 200 });
        all = [...all, ...res.items];
        if (all.length >= res.total || res.items.length === 0) break;
        p++;
      }
      setAllInventory(all);
    } catch (e) { addToast('error', 'Failed to load inventory', (e as Error).message); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { fetchAllInventory(); }, [fetchAllInventory]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        expiry_date: form.expiry_date || null,
        batch_number: form.batch_number || null,
      };
      if (editId) {
        await transactionApi.inventory.update(editId, payload as never);
        addToast('success', 'Inventory record updated');
      } else {
        await transactionApi.inventory.create(payload as never);
        addToast('success', 'Inventory record created');
      }
      setShowModal(false); fetchAllInventory();
      setForm({ item_code: '', warehouse_code: '', quantity: 0, unit_cost: 0, expiry_date: '', batch_number: '' });
    } catch (e) { addToast('error', 'Failed to save', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setEditId(null);
    setForm({ item_code: '', warehouse_code: '', quantity: 0, unit_cost: 0, expiry_date: '', batch_number: '' });
    setShowModal(true);
  };

  const openEdit = (r: any) => {
    setEditId(r.id);
    setForm({
      item_code: r.item_code,
      warehouse_code: r.warehouse_code,
      quantity: r.quantity,
      unit_cost: r.unit_cost || 0,
      expiry_date: r.expiry_date || '',
      batch_number: r.batch_number || ''
    });
    setShowModal(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await transactionApi.inventory.delete(deleteId);
      addToast('success', 'Record deleted'); setDeleteId(null); fetchAllInventory();
    } catch (e) { addToast('error', 'Failed to delete', (e as Error).message); }
  };

  // Removed old filterCfg

  const columns: Column<any>[] = [
    { key: 'item_code', header: 'ITEM CODE', render: r => <span>{r.item_code}</span> },
    { key: 'item_name', header: 'SKU NAME', render: r => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.item_name}</span> },
    { key: 'item_attribute', header: 'ATTRIBUTE', width: '120px', render: r => r.item_attribute || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'warehouse_name', header: 'WAREHOUSE', render: r => r.warehouse_name },
    { key: 'quantity', header: 'ON-HAND QTY', render: r => <strong>{r.quantity.toLocaleString()}</strong> },
    { key: 'unit_cost', header: 'UNIT COST', render: r => r.unit_cost ? r.unit_cost.toLocaleString('vi-VN') : '—' },
    { key: 'value', header: 'VALUE (VND)', render: r => (r.quantity * (r.unit_cost || 0)).toLocaleString('vi-VN') },
    { key: 'batch_number', header: 'BATCH', render: r => r.batch_number || '—' },
    { key: 'expiry_date', header: 'EXPIRY', render: r => {
      if (!r.expiry_date) return '—';
      return <span>{r.expiry_date}</span>;
    }},
    { key: 'last_updated', header: 'UPDATED', render: r => new Date(r.last_updated).toLocaleDateString() },
    { key: 'actions', header: '', render: r => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEdit(r)} title="Edit"><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteId(r.id)} title="Delete"><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const totalValue = filteredInventory.reduce((s, r) => s + r.quantity * (r.unit_cost || 0), 0);
  const totalQty = filteredInventory.reduce((s, r) => s + r.quantity, 0);

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
        <ImportExcel entityKey="inventory" entityLabel="Import Inventory" onImportComplete={fetchAllInventory} />
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} /> Add Inventory
        </button>
      </div>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)',
        padding: '0 0 var(--space-4)',
        alignItems: 'center',
      }}>
        <div style={{ position: 'relative' }}>
          <div 
            className="form-input form-select" 
            style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => { setShowBrandDropdown(!showBrandDropdown); setShowGroupDropdown(false); setShowWarehouseDropdown(false); }}
          >
            {filters.brand.length > 0 ? `${filters.brand.length} Brands Selected` : 'All Brands'}
          </div>
          {showBrandDropdown && (
            <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              {brands.map(b => (
                <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                  <input 
                    type="checkbox" 
                    checked={filters.brand.includes(b)}
                    onChange={e => {
                      const newBrands = e.target.checked 
                        ? [...filters.brand, b]
                        : filters.brand.filter(x => x !== b);
                      setFilters(prev => ({ ...prev, brand: newBrands }));
                      setPage(1);
                    }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{b}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <div 
            className="form-input form-select" 
            style={{ width: 200, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => { setShowGroupDropdown(!showGroupDropdown); setShowBrandDropdown(false); setShowWarehouseDropdown(false); }}
          >
            {filters.group_code.length > 0 ? `${filters.group_code.length} Groups Selected` : 'All Product Groups'}
          </div>
          {showGroupDropdown && (
            <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              {productGroups.map(pg => (
                <label key={pg.code} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                  <input 
                    type="checkbox" 
                    checked={filters.group_code.includes(pg.code)}
                    onChange={e => {
                      const newCodes = e.target.checked 
                        ? [...filters.group_code, pg.code]
                        : filters.group_code.filter(x => x !== pg.code);
                      setFilters(prev => ({ ...prev, group_code: newCodes }));
                      setPage(1);
                    }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{pg.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <div 
            className="form-input form-select" 
            style={{ width: 220, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onClick={() => { setShowWarehouseDropdown(!showWarehouseDropdown); setShowBrandDropdown(false); setShowGroupDropdown(false); }}
          >
            {filters.warehouse_code.length > 0 ? `${filters.warehouse_code.length} Warehouses Selected` : 'All Warehouses'}
          </div>
          {showWarehouseDropdown && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
              {allWarehouses.map(w => (
                <label key={w.warehouse_code} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                  <input 
                    type="checkbox" 
                    checked={filters.warehouse_code.includes(w.warehouse_code)}
                    onChange={e => {
                      const newCodes = e.target.checked 
                        ? [...filters.warehouse_code, w.warehouse_code]
                        : filters.warehouse_code.filter(c => c !== w.warehouse_code);
                      setFilters(prev => ({ ...prev, warehouse_code: newCodes }));
                      setPage(1);
                    }}
                  />
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{w.warehouse_name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search by item code..."
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

        {(filters.warehouse_code.length > 0 || searchInput || filters.brand.length > 0 || filters.group_code.length > 0) && (
          <button
            onClick={() => { 
              setFilters({ search: '', warehouse_code: [], brand: [], group_code: [] }); 
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

      <DataTable columns={columns} data={displayedData} loading={loading} emptyIcon={<Box size={48} />} emptyTitle="No inventory records" emptyText="Import inventory snapshots or add records manually" />
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editId ? "Edit Inventory Record" : "Add Inventory Record"} size="md">
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
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !form.item_code || !form.warehouse_code}>
            {saving ? <><span className="loading-spinner" /> Saving...</> : editId ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleDelete} title="Delete Inventory Record" message="Are you sure? This action cannot be undone." />
    </>
  );
}
