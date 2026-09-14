'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, Channel, Region, Warehouse, Brand } from '@/lib/api';

type TabKey = 'channel' | 'region' | 'brand' | 'warehouse';

export default function OthersPage() {
  const [tab, setTab] = useState<TabKey>('channel');
  const { addToast } = useToast();

  // ─── CHANNEL state ───
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelTotal, setChannelTotal] = useState(0);
  const [channelPage, setChannelPage] = useState(1);
  const [channelPageSize, setChannelPageSize] = useState(20);
  const [channelLoading, setChannelLoading] = useState(true);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelSearchInput, setChannelSearchInput] = useState('');
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [channelSaving, setChannelSaving] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [channelForm, setChannelForm] = useState({ channel_code: '', channel_name: '', status: 'Active' });
  const [deleteChannelTarget, setDeleteChannelTarget] = useState<Channel | null>(null);
  const [channelDeleting, setChannelDeleting] = useState(false);

  // ─── REGION state ───
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionTotal, setRegionTotal] = useState(0);
  const [regionPage, setRegionPage] = useState(1);
  const [regionPageSize, setRegionPageSize] = useState(20);
  const [regionLoading, setRegionLoading] = useState(true);
  const [regionSearch, setRegionSearch] = useState('');
  const [regionSearchInput, setRegionSearchInput] = useState('');
  const [showRegionModal, setShowRegionModal] = useState(false);
  const [regionSaving, setRegionSaving] = useState(false);
  const [editingRegion, setEditingRegion] = useState<Region | null>(null);
  const [regionForm, setRegionForm] = useState({ region_code: '', region_name: '', status: 'Active' });
  const [deleteRegionTarget, setDeleteRegionTarget] = useState<Region | null>(null);
  const [regionDeleting, setRegionDeleting] = useState(false);

  // ─── BRAND state ───
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandTotal, setBrandTotal] = useState(0);
  const [brandPage, setBrandPage] = useState(1);
  const [brandPageSize, setBrandPageSize] = useState(20);
  const [brandLoading, setBrandLoading] = useState(true);
  const [brandSearch, setBrandSearch] = useState('');
  const [brandSearchInput, setBrandSearchInput] = useState('');
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [brandForm, setBrandForm] = useState({ brand_code: '', brand_name: '', status: 'Active' });
  const [deleteBrandTarget, setDeleteBrandTarget] = useState<Brand | null>(null);
  const [brandDeleting, setBrandDeleting] = useState(false);

  // ─── WAREHOUSE state ───
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseTotal, setWarehouseTotal] = useState(0);
  const [warehousePage, setWarehousePage] = useState(1);
  const [warehousePageSize, setWarehousePageSize] = useState(20);
  const [warehouseLoading, setWarehouseLoading] = useState(true);
  const [warehouseSearch, setWarehouseSearch] = useState('');
  const [warehouseSearchInput, setWarehouseSearchInput] = useState('');
  const [warehouseRegionFilter, setWarehouseRegionFilter] = useState('');
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [warehouseSaving, setWarehouseSaving] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [warehouseForm, setWarehouseForm] = useState({ warehouse_region: '', warehouse_code: '', warehouse_name: '', warehouse_attribute: '', warehouse_status: 'Active' });
  const [deleteWarehouseTarget, setDeleteWarehouseTarget] = useState<Warehouse | null>(null);
  const [warehouseDeleting, setWarehouseDeleting] = useState(false);

  // For region dropdown filter in warehouses tab — derive from actual warehouse data + regions table
  const [regionFilterOptions, setRegionFilterOptions] = useState<string[]>([]);
  useEffect(() => {
    const fetchRegionOptions = async () => {
      try {
        const regionSet = new Set<string>();
        // 1) From regions table
        try {
          const regRes = await masterDataApi.regions.list({ page: 1, page_size: 100 });
          regRes.items.filter(r => r.status === 'Active').forEach(r => regionSet.add(r.region_name));
        } catch { /* ignore */ }
        // 2) From actual warehouse data (warehouse_region values)
        try {
          let p = 1;
          while (true) {
            const whRes = await masterDataApi.warehouses.list({ page: p, page_size: 50 });
            whRes.items.forEach(w => { if (w.warehouse_region) regionSet.add(w.warehouse_region); });
            if (whRes.items.length === 0 || p * 50 >= whRes.total) break;
            p++;
          }
        } catch { /* ignore */ }
        setRegionFilterOptions([...regionSet].sort());
      } catch { /* ignore */ }
    };
    fetchRegionOptions();
  }, []);

  // ─── Debounced search effects ───
  useEffect(() => {
    const t = setTimeout(() => {
      setChannelSearch(prev => { if (prev !== channelSearchInput) { setChannelPage(1); } return channelSearchInput; });
    }, 350);
    return () => clearTimeout(t);
  }, [channelSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setRegionSearch(prev => { if (prev !== regionSearchInput) { setRegionPage(1); } return regionSearchInput; });
    }, 350);
    return () => clearTimeout(t);
  }, [regionSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setBrandSearch(prev => { if (prev !== brandSearchInput) { setBrandPage(1); } return brandSearchInput; });
    }, 350);
    return () => clearTimeout(t);
  }, [brandSearchInput]);

  useEffect(() => {
    const t = setTimeout(() => {
      setWarehouseSearch(prev => { if (prev !== warehouseSearchInput) { setWarehousePage(1); } return warehouseSearchInput; });
    }, 350);
    return () => clearTimeout(t);
  }, [warehouseSearchInput]);

  // ─── Fetch functions ───
  const fetchChannels = useCallback(async () => {
    setChannelLoading(true);
    try {
      const res = await masterDataApi.channels.list({ page: channelPage, page_size: channelPageSize, search: channelSearch || undefined });
      setChannels(res.items); setChannelTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load channels', (e as Error).message); }
    finally { setChannelLoading(false); }
  }, [channelPage, channelPageSize, channelSearch, addToast]);

  const fetchRegions = useCallback(async () => {
    setRegionLoading(true);
    try {
      const res = await masterDataApi.regions.list({ page: regionPage, page_size: regionPageSize, search: regionSearch || undefined });
      setRegions(res.items); setRegionTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load regions', (e as Error).message); }
    finally { setRegionLoading(false); }
  }, [regionPage, regionPageSize, regionSearch, addToast]);

  const fetchBrands = useCallback(async () => {
    setBrandLoading(true);
    try {
      const res = await masterDataApi.brands.list({ page: brandPage, page_size: brandPageSize, search: brandSearch || undefined });
      setBrands(res.items); setBrandTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load brands', (e as Error).message); }
    finally { setBrandLoading(false); }
  }, [brandPage, brandPageSize, brandSearch, addToast]);

  const fetchWarehouses = useCallback(async () => {
    setWarehouseLoading(true);
    try {
      const res = await masterDataApi.warehouses.list({ page: warehousePage, page_size: warehousePageSize, search: warehouseSearch || undefined, region: warehouseRegionFilter || undefined });
      setWarehouses(res.items); setWarehouseTotal(res.total);
    } catch (e) { addToast('error', 'Failed to load warehouses', (e as Error).message); }
    finally { setWarehouseLoading(false); }
  }, [warehousePage, warehousePageSize, warehouseSearch, warehouseRegionFilter, addToast]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);
  useEffect(() => { fetchRegions(); }, [fetchRegions]);
  useEffect(() => { fetchBrands(); }, [fetchBrands]);
  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  // ─── CHANNEL CRUD handlers ───
  const openChannelCreate = () => {
    setEditingChannel(null);
    setChannelForm({ channel_code: '', channel_name: '', status: 'Active' });
    setShowChannelModal(true);
  };
  const openChannelEdit = (ch: Channel) => {
    setEditingChannel(ch);
    setChannelForm({ channel_code: ch.channel_code, channel_name: ch.channel_name, status: ch.status });
    setShowChannelModal(true);
  };
  const handleChannelSave = async () => {
    setChannelSaving(true);
    try {
      if (editingChannel) {
        await masterDataApi.channels.update(String(editingChannel.id), { channel_name: channelForm.channel_name, status: channelForm.status } as any);
        addToast('success', 'Channel updated');
      } else {
        await masterDataApi.channels.create(channelForm as any);
        addToast('success', 'Channel created');
      }
      setShowChannelModal(false); setEditingChannel(null); fetchChannels();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setChannelSaving(false); }
  };
  const handleChannelDelete = async () => {
    if (!deleteChannelTarget) return;
    setChannelDeleting(true);
    try {
      await masterDataApi.channels.delete(String(deleteChannelTarget.id));
      addToast('success', 'Channel deleted'); setDeleteChannelTarget(null); fetchChannels();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setChannelDeleting(false); }
  };

  // ─── REGION CRUD handlers ───
  const openRegionCreate = () => {
    setEditingRegion(null);
    setRegionForm({ region_code: '', region_name: '', status: 'Active' });
    setShowRegionModal(true);
  };
  const openRegionEdit = (r: Region) => {
    setEditingRegion(r);
    setRegionForm({ region_code: r.region_code, region_name: r.region_name, status: r.status });
    setShowRegionModal(true);
  };
  const handleRegionSave = async () => {
    setRegionSaving(true);
    try {
      if (editingRegion) {
        await masterDataApi.regions.update(String(editingRegion.id), { region_name: regionForm.region_name, status: regionForm.status } as any);
        addToast('success', 'Region updated');
      } else {
        await masterDataApi.regions.create(regionForm as any);
        addToast('success', 'Region created');
      }
      setShowRegionModal(false); setEditingRegion(null); fetchRegions();
      // Refresh region filter options for warehouse tab
      try {
        const regionSet = new Set<string>();
        const regRes = await masterDataApi.regions.list({ page: 1, page_size: 100 });
        regRes.items.filter(r => r.status === 'Active').forEach(r => regionSet.add(r.region_name));
        let p = 1;
        while (true) {
          const whRes = await masterDataApi.warehouses.list({ page: p, page_size: 50 });
          whRes.items.forEach(w => { if (w.warehouse_region) regionSet.add(w.warehouse_region); });
          if (whRes.items.length === 0 || p * 50 >= whRes.total) break;
          p++;
        }
        setRegionFilterOptions([...regionSet].sort());
      } catch { /* ignore */ }
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setRegionSaving(false); }
  };
  const handleRegionDelete = async () => {
    if (!deleteRegionTarget) return;
    setRegionDeleting(true);
    try {
      await masterDataApi.regions.delete(String(deleteRegionTarget.id));
      addToast('success', 'Region deleted'); setDeleteRegionTarget(null); fetchRegions();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setRegionDeleting(false); }
  };

  // ─── BRAND CRUD handlers ───
  const openBrandCreate = () => {
    setEditingBrand(null);
    setBrandForm({ brand_code: '', brand_name: '', status: 'Active' });
    setShowBrandModal(true);
  };
  const openBrandEdit = (b: Brand) => {
    setEditingBrand(b);
    setBrandForm({ brand_code: b.brand_code, brand_name: b.brand_name, status: b.status });
    setShowBrandModal(true);
  };
  const handleBrandSave = async () => {
    setBrandSaving(true);
    try {
      if (editingBrand) {
        await masterDataApi.brands.update(String(editingBrand.id), { brand_name: brandForm.brand_name, status: brandForm.status } as any);
        addToast('success', 'Brand updated');
      } else {
        await masterDataApi.brands.create(brandForm as any);
        addToast('success', 'Brand created');
      }
      setShowBrandModal(false); setEditingBrand(null); fetchBrands();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setBrandSaving(false); }
  };
  const handleBrandDelete = async () => {
    if (!deleteBrandTarget) return;
    setBrandDeleting(true);
    try {
      await masterDataApi.brands.delete(String(deleteBrandTarget.id));
      addToast('success', 'Brand deleted'); setDeleteBrandTarget(null); fetchBrands();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setBrandDeleting(false); }
  };

  // ─── WAREHOUSE CRUD handlers ───
  const openWarehouseCreate = () => {
    setEditingWarehouse(null);
    setWarehouseForm({ warehouse_region: '', warehouse_code: '', warehouse_name: '', warehouse_attribute: '', warehouse_status: 'Active' });
    setShowWarehouseModal(true);
  };
  const openWarehouseEdit = (w: Warehouse) => {
    setEditingWarehouse(w);
    setWarehouseForm({
      warehouse_region: w.warehouse_region,
      warehouse_code: w.warehouse_code,
      warehouse_name: w.warehouse_name,
      warehouse_attribute: w.warehouse_attribute || '',
      warehouse_status: w.warehouse_status,
    });
    setShowWarehouseModal(true);
  };
  const handleWarehouseSave = async () => {
    setWarehouseSaving(true);
    try {
      if (editingWarehouse) {
        await masterDataApi.warehouses.update(editingWarehouse.warehouse_code, warehouseForm as any);
        addToast('success', 'Warehouse updated');
      } else {
        await masterDataApi.warehouses.create(warehouseForm as any);
        addToast('success', 'Warehouse created');
      }
      setShowWarehouseModal(false); setEditingWarehouse(null); fetchWarehouses();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setWarehouseSaving(false); }
  };
  const handleWarehouseDelete = async () => {
    if (!deleteWarehouseTarget) return;
    setWarehouseDeleting(true);
    try {
      await masterDataApi.warehouses.delete(deleteWarehouseTarget.warehouse_code);
      addToast('success', 'Warehouse deleted'); setDeleteWarehouseTarget(null); fetchWarehouses();
    } catch (e) { addToast('error', 'Delete failed', (e as Error).message); }
    finally { setWarehouseDeleting(false); }
  };

  // ─── Column definitions ───
  const channelCols: Column<Channel>[] = [
    { key: 'channel_code', header: 'Code', width: '150px' },
    { key: 'channel_name', header: 'Channel Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.channel_name}</span> },
    { key: 'status', header: 'Status', width: '100px' },
    { key: 'actions' as any, header: '', width: '80px', render: (r: Channel) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openChannelEdit(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteChannelTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const regionCols: Column<Region>[] = [
    { key: 'region_code', header: 'Code', width: '150px' },
    { key: 'region_name', header: 'Region Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.region_name}</span> },
    { key: 'status', header: 'Status', width: '100px' },
    { key: 'actions' as any, header: '', width: '80px', render: (r: Region) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openRegionEdit(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteRegionTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const brandCols: Column<Brand>[] = [
    { key: 'brand_code', header: 'Code', width: '150px' },
    { key: 'brand_name', header: 'Brand Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.brand_name}</span> },
    { key: 'status', header: 'Status', width: '100px' },
    { key: 'actions' as any, header: '', width: '80px', render: (r: Brand) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openBrandEdit(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteBrandTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const warehouseCols: Column<Warehouse>[] = [
    { key: 'warehouse_code', header: 'Code', width: '120px' },
    { key: 'warehouse_name', header: 'Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.warehouse_name}</span> },
    { key: 'warehouse_region', header: 'Region', width: '140px' },
    { key: 'warehouse_attribute', header: 'Attribute', width: '160px', render: (r) => r.warehouse_attribute || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'warehouse_status', header: 'Status', width: '100px' },
    { key: 'actions' as any, header: '', width: '80px', render: (r: Warehouse) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openWarehouseEdit(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteWarehouseTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Others</h1>
          <p className="page-description">Manage channels, regions, and warehouse locations</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          {tab === 'channel' && (
            <>
              <ImportExcel entityKey="channels" entityLabel="Channels" onImportComplete={fetchChannels} />
              <button className="btn btn-primary" onClick={openChannelCreate}><Plus size={16} /> Add Channel</button>
            </>
          )}
          {tab === 'region' && (
            <>
              <ImportExcel entityKey="regions" entityLabel="Regions" onImportComplete={fetchRegions} />
              <button className="btn btn-primary" onClick={openRegionCreate}><Plus size={16} /> Add Region</button>
            </>
          )}
          {tab === 'brand' && (
            <>
              <ImportExcel entityKey="brands" entityLabel="Brands" onImportComplete={fetchBrands} />
              <button className="btn btn-primary" onClick={openBrandCreate}><Plus size={16} /> Add Brand</button>
            </>
          )}
          {tab === 'warehouse' && (
            <>
              <ImportExcel entityKey="warehouses" entityLabel="Warehouses" onImportComplete={fetchWarehouses} />
              <button className="btn btn-primary" onClick={openWarehouseCreate}><Plus size={16} /> Add Warehouse</button>
            </>
          )}
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${tab === 'channel' ? 'tab-active' : ''}`} onClick={() => setTab('channel')}>Channel</button>
        <button className={`tab-item ${tab === 'region' ? 'tab-active' : ''}`} onClick={() => setTab('region')}>Region</button>
        <button className={`tab-item ${tab === 'brand' ? 'tab-active' : ''}`} onClick={() => setTab('brand')}>Brand</button>
        <button className={`tab-item ${tab === 'warehouse' ? 'tab-active' : ''}`} onClick={() => setTab('warehouse')}>Warehouse</button>
      </div>

      {/* ─── CHANNEL TAB ─── */}
      {tab === 'channel' && (
        <div style={{ padding: 'var(--space-2) 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', padding: '0 0 var(--space-4)', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search channels..." value={channelSearchInput} onChange={e => setChannelSearchInput(e.target.value)}
                style={{ padding: '8px 14px 8px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none', width: '250px' }} />
            </div>
            {channelSearchInput && (
              <button onClick={() => { setChannelSearchInput(''); setChannelSearch(''); setChannelPage(1); }}
                style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease' }}>
                Clear
              </button>
            )}
          </div>
          <DataTable columns={channelCols} data={channels} loading={channelLoading} rowKey={(r) => r.id} />
          <Pagination page={channelPage} pageSize={channelPageSize} total={channelTotal} onPageChange={setChannelPage} onPageSizeChange={(s) => { setChannelPageSize(s); setChannelPage(1); }} />
        </div>
      )}

      {/* ─── REGION TAB ─── */}
      {tab === 'region' && (
        <div style={{ padding: 'var(--space-2) 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', padding: '0 0 var(--space-4)', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search regions..." value={regionSearchInput} onChange={e => setRegionSearchInput(e.target.value)}
                style={{ padding: '8px 14px 8px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none', width: '250px' }} />
            </div>
            {regionSearchInput && (
              <button onClick={() => { setRegionSearchInput(''); setRegionSearch(''); setRegionPage(1); }}
                style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease' }}>
                Clear
              </button>
            )}
          </div>
          <DataTable columns={regionCols} data={regions} loading={regionLoading} rowKey={(r) => r.id} />
          <Pagination page={regionPage} pageSize={regionPageSize} total={regionTotal} onPageChange={setRegionPage} onPageSizeChange={(s) => { setRegionPageSize(s); setRegionPage(1); }} />
        </div>
      )}

      {/* ─── BRAND TAB ─── */}
      {tab === 'brand' && (
        <div style={{ padding: 'var(--space-2) 0' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', padding: '0 0 var(--space-4)', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search brands..." value={brandSearchInput} onChange={e => setBrandSearchInput(e.target.value)}
                style={{ padding: '8px 14px 8px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none', width: '250px' }} />
            </div>
            {brandSearchInput && (
              <button onClick={() => { setBrandSearchInput(''); setBrandSearch(''); setBrandPage(1); }}
                style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease' }}>
                Clear
              </button>
            )}
          </div>
          <DataTable columns={brandCols} data={brands} loading={brandLoading} rowKey={(r) => r.id} />
          <Pagination page={brandPage} pageSize={brandPageSize} total={brandTotal} onPageChange={setBrandPage} onPageSizeChange={(s) => { setBrandPageSize(s); setBrandPage(1); }} />
        </div>
      )}

      {/* ─── WAREHOUSE TAB ─── */}
      {tab === 'warehouse' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', padding: '0 0 var(--space-4)', alignItems: 'center' }}>
            <select id="filter-region" className="form-input form-select" style={{ width: 170 }}
              value={warehouseRegionFilter} onChange={e => { setWarehouseRegionFilter(e.target.value); setWarehousePage(1); }}>
              <option value="">All Regions</option>
              {regionFilterOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ position: 'relative' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" placeholder="Search warehouses..." value={warehouseSearchInput} onChange={e => setWarehouseSearchInput(e.target.value)}
                style={{ padding: '8px 14px 8px 32px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', fontSize: 'var(--font-size-sm)', outline: 'none', width: '250px' }} />
            </div>
            {(warehouseRegionFilter || warehouseSearchInput) && (
              <button onClick={() => { setWarehouseRegionFilter(''); setWarehouseSearchInput(''); setWarehouseSearch(''); setWarehousePage(1); }}
                style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-md)', color: '#ef4444', fontSize: 'var(--font-size-xs)', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s ease' }}>
                Clear Filters
              </button>
            )}
          </div>
          <DataTable columns={warehouseCols} data={warehouses} loading={warehouseLoading} rowKey={(r) => r.id} />
          <Pagination page={warehousePage} pageSize={warehousePageSize} total={warehouseTotal} onPageChange={setWarehousePage} onPageSizeChange={(s) => { setWarehousePageSize(s); setWarehousePage(1); }} />
        </>
      )}

      {/* ─── CHANNEL MODAL ─── */}
      <Modal isOpen={showChannelModal} onClose={() => { setShowChannelModal(false); setEditingChannel(null); }} title={editingChannel ? 'Edit Channel' : 'New Channel'} size="sm"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowChannelModal(false); setEditingChannel(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleChannelSave} disabled={channelSaving || !channelForm.channel_code || !channelForm.channel_name}>{channelSaving && <span className="loading-spinner" />}{editingChannel ? 'Update' : 'Create'}</button></>}>
        <div className="form-group">
          <label className="form-label">Channel Code *</label>
          <input className="form-input" placeholder="e.g. DOM" value={channelForm.channel_code} disabled={!!editingChannel} onChange={(e) => setChannelForm({ ...channelForm, channel_code: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Channel Name *</label>
          <input className="form-input" placeholder="e.g. Domestic" value={channelForm.channel_name} onChange={(e) => setChannelForm({ ...channelForm, channel_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input form-select" value={channelForm.status} onChange={(e) => setChannelForm({ ...channelForm, status: e.target.value })}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </Modal>

      {/* ─── REGION MODAL ─── */}
      <Modal isOpen={showRegionModal} onClose={() => { setShowRegionModal(false); setEditingRegion(null); }} title={editingRegion ? 'Edit Region' : 'New Region'} size="sm"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowRegionModal(false); setEditingRegion(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleRegionSave} disabled={regionSaving || !regionForm.region_code || !regionForm.region_name}>{regionSaving && <span className="loading-spinner" />}{editingRegion ? 'Update' : 'Create'}</button></>}>
        <div className="form-group">
          <label className="form-label">Region Code *</label>
          <input className="form-input" placeholder="e.g. SOUTH" value={regionForm.region_code} disabled={!!editingRegion} onChange={(e) => setRegionForm({ ...regionForm, region_code: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Region Name *</label>
          <input className="form-input" placeholder="e.g. South" value={regionForm.region_name} onChange={(e) => setRegionForm({ ...regionForm, region_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input form-select" value={regionForm.status} onChange={(e) => setRegionForm({ ...regionForm, status: e.target.value })}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </Modal>

      {/* ─── BRAND MODAL ─── */}
      <Modal isOpen={showBrandModal} onClose={() => { setShowBrandModal(false); setEditingBrand(null); }} title={editingBrand ? 'Edit Brand' : 'New Brand'} size="sm"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowBrandModal(false); setEditingBrand(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleBrandSave} disabled={brandSaving || !brandForm.brand_code || !brandForm.brand_name}>{brandSaving && <span className="loading-spinner" />}{editingBrand ? 'Update' : 'Create'}</button></>}>
        <div className="form-group">
          <label className="form-label">Brand Code *</label>
          <input className="form-input" placeholder="e.g. BR-01" value={brandForm.brand_code} disabled={!!editingBrand} onChange={(e) => setBrandForm({ ...brandForm, brand_code: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Brand Name *</label>
          <input className="form-input" placeholder="e.g. Acme" value={brandForm.brand_name} onChange={(e) => setBrandForm({ ...brandForm, brand_name: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input form-select" value={brandForm.status} onChange={(e) => setBrandForm({ ...brandForm, status: e.target.value })}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </Modal>

      {/* ─── WAREHOUSE MODAL ─── */}
      <Modal isOpen={showWarehouseModal} onClose={() => { setShowWarehouseModal(false); setEditingWarehouse(null); }} title={editingWarehouse ? 'Edit Warehouse' : 'New Warehouse'} size="md"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowWarehouseModal(false); setEditingWarehouse(null); }}>Cancel</button><button className="btn btn-primary" onClick={handleWarehouseSave} disabled={warehouseSaving || !warehouseForm.warehouse_code || !warehouseForm.warehouse_name}>{warehouseSaving && <span className="loading-spinner" />}{editingWarehouse ? 'Update' : 'Create'}</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Warehouse Code *</label>
            <input className="form-input" placeholder="e.g. WH-01" value={warehouseForm.warehouse_code} disabled={!!editingWarehouse} onChange={(e) => setWarehouseForm({ ...warehouseForm, warehouse_code: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Region *</label>
            <select className="form-input form-select" value={warehouseForm.warehouse_region} onChange={(e) => setWarehouseForm({ ...warehouseForm, warehouse_region: e.target.value })}>
              <option value="">Select region...</option>
              {regionFilterOptions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Warehouse Name *</label>
          <input className="form-input" placeholder="Full name" value={warehouseForm.warehouse_name} onChange={(e) => setWarehouseForm({ ...warehouseForm, warehouse_name: e.target.value })} />
        </div>
        <div className="form-row form-row-2">
          <div className="form-group">
            <label className="form-label">Attribute</label>
            <input className="form-input" placeholder="e.g. Cold Storage" value={warehouseForm.warehouse_attribute} onChange={(e) => setWarehouseForm({ ...warehouseForm, warehouse_attribute: e.target.value })} />
          </div>
          <div className="form-group">
            <label className="form-label">Status</label>
            <select className="form-input form-select" value={warehouseForm.warehouse_status} onChange={(e) => setWarehouseForm({ ...warehouseForm, warehouse_status: e.target.value })}>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* ─── DELETE CONFIRMATIONS ─── */}
      <ConfirmDialog isOpen={!!deleteChannelTarget} onClose={() => setDeleteChannelTarget(null)} onConfirm={handleChannelDelete} loading={channelDeleting}
        title="Delete Channel" message={`Are you sure you want to delete "${deleteChannelTarget?.channel_name}"? This action cannot be undone.`} />

      <ConfirmDialog isOpen={!!deleteRegionTarget} onClose={() => setDeleteRegionTarget(null)} onConfirm={handleRegionDelete} loading={regionDeleting}
        title="Delete Region" message={`Are you sure you want to delete "${deleteRegionTarget?.region_name}"? This action cannot be undone.`} />

      <ConfirmDialog isOpen={!!deleteBrandTarget} onClose={() => setDeleteBrandTarget(null)} onConfirm={handleBrandDelete} loading={brandDeleting}
        title="Delete Brand" message={`Are you sure you want to delete "${deleteBrandTarget?.brand_name}"? This action cannot be undone.`} />

      <ConfirmDialog isOpen={!!deleteWarehouseTarget} onClose={() => setDeleteWarehouseTarget(null)} onConfirm={handleWarehouseDelete} loading={warehouseDeleting}
        title="Delete Warehouse" message={`Are you sure you want to delete "${deleteWarehouseTarget?.warehouse_name}"? This action cannot be undone.`} />
    </div>
  );
}
