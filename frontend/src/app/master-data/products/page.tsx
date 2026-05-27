'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Download } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import FilterBar, { FilterConfig } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, ProductHierarchy, Item, Brand, Partner } from '@/lib/api';

const filterInputStyle: React.CSSProperties = {
  padding: '8px 12px 8px 36px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--color-text)',
  fontSize: 'var(--font-size-sm)',
  minWidth: 220,
  outline: 'none',
};

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
  const [iFilters, setIFilters] = useState<{search: string, item_type: string, item_attribute: string, group_code: string[], brand: string[]}>({ search: '', item_type: '', item_attribute: '', group_code: [], brand: [] });

  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  const [allHierarchy, setAllHierarchy] = useState<ProductHierarchy[]>([]);
  const [activeBrands, setActiveBrands] = useState<Brand[]>([]);
  const [activePartners, setActivePartners] = useState<Partner[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        let all: ProductHierarchy[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.productHierarchy.list({ page: p, page_size: 50 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setAllHierarchy(all);
      } catch (e) {
        console.error("Failed to fetch all hierarchy", e);
      }
    };
    const fetchBrands = async () => {
      try {
        let all: Brand[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.brands.list({ page: p, page_size: 50 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        setActiveBrands(all.filter(b => b.status === 'Active'));
      } catch (e) {
        console.error("Failed to fetch brands", e);
      }
    };
    const fetchPartners = async () => {
      try {
        let all: Partner[] = [];
        let p = 1;
        while (true) {
          const res = await masterDataApi.partners.list({ page: p, page_size: 50 });
          all = [...all, ...res.items];
          if (all.length >= res.total || res.items.length === 0) break;
          p++;
        }
        // Only active partners
        setActivePartners(all.filter(x => x.status === 'Active'));
      } catch (e) {
        console.error("Failed to fetch partners", e);
      }
    };
    fetchAll();
    fetchBrands();
    fetchPartners();
  }, []);

  const brandOptions = useMemo(() => {
    // Collect all active brands from master data + any existing brands in hierarchy (just in case they are missing or inactive)
    const set = new Set(activeBrands.map(b => b.brand_name));
    allHierarchy.forEach(h => { if (h.brand) set.add(h.brand); });
    return [...set].sort();
  }, [allHierarchy, activeBrands]);

  const productGroups = useMemo(() => {
    const filtered = iFilters.brand.length > 0
      ? allHierarchy.filter(h => iFilters.brand.includes(h.brand))
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
  }, [allHierarchy, iFilters.brand]);

  useEffect(() => {
    if (iFilters.group_code.length > 0) {
      const validCodes = iFilters.group_code.filter(c => productGroups.some(pg => pg.code === c));
      if (validCodes.length !== iFilters.group_code.length) {
        setIFilters(prev => ({ ...prev, group_code: validCodes }));
        setIPage(1);
      }
    }
  }, [productGroups, iFilters.group_code]);

  const [searchInput, setSearchInput] = useState(iFilters.search || '');
  useEffect(() => {
    const timer = setTimeout(() => {
      setIFilters(prev => {
        if (prev.search !== searchInput) {
          setIPage(1);
          return { ...prev, search: searchInput };
        }
        return prev;
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const displayedItems = useMemo(() => {
    let filtered = items;
    if (iFilters.brand.length > 0 && iFilters.group_code.length === 0) {
      const validGroupCodes = new Set(productGroups.map(pg => pg.code));
      filtered = filtered.filter(item => validGroupCodes.has(item.item_group_code));
    }
    if (iFilters.item_attribute) {
      filtered = filtered.filter(item => item.item_attribute === iFilters.item_attribute);
    }
    return filtered;
  }, [items, iFilters.brand, iFilters.group_code, iFilters.item_attribute, productGroups]);

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
  const [iForm, setIForm] = useState({ item_group_code: '', item_code: '', item_partner_code: '', item_name: '', item_for_name: '', uom: 'PCS', item_type: 'Finished Goods', item_attribute: '', status: 'Active', import_lead_time_days: 30, production_lead_time_days: 14, shelf_life_days: '' as number | '' });

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
      if (iFilters.brand.length > 0 && iFilters.group_code.length === 0) {
        const validGroupCodes = allHierarchy.filter(h => iFilters.brand.includes(h.brand)).map(h => h.item_group_code);
        if (validGroupCodes.length === 0) {
          setItems([]); setITotal(0);
        } else {
          const promises = validGroupCodes.map(code => 
            masterDataApi.items.list({ page: 1, page_size: 500, search: iFilters.search || undefined, item_type: iFilters.item_type || undefined, group_code: code })
          );
          const results = await Promise.all(promises);
          let allBrandItems: Item[] = [];
          for (const res of results) {
            allBrandItems = [...allBrandItems, ...res.items];
          }
          setITotal(allBrandItems.length);
          const start = (iPage - 1) * iPageSize;
          setItems(allBrandItems.slice(start, start + iPageSize));
        }
      } else if (iFilters.group_code.length > 0) {
        const promises = iFilters.group_code.map(code => 
          masterDataApi.items.list({ page: 1, page_size: 500, search: iFilters.search || undefined, item_type: iFilters.item_type || undefined, group_code: code })
        );
        const results = await Promise.all(promises);
        let allGroupItems: Item[] = [];
        for (const res of results) {
          allGroupItems = [...allGroupItems, ...res.items];
        }
        setITotal(allGroupItems.length);
        const start = (iPage - 1) * iPageSize;
        setItems(allGroupItems.slice(start, start + iPageSize));
      } else {
        const res = await masterDataApi.items.list({ page: iPage, page_size: iPageSize, search: iFilters.search || undefined, item_type: iFilters.item_type || undefined });
        setItems(res.items); setITotal(res.total);
      }
    } catch (e) { addToast('error', 'Failed to load items', (e as Error).message); }
    finally { setILoading(false); }
  }, [iPage, iPageSize, iFilters, allHierarchy, addToast]);

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
      const payload = { ...iForm, shelf_life_days: iForm.shelf_life_days === '' ? null : iForm.shelf_life_days };
      if (editingI) {
        await masterDataApi.items.update(editingI.item_code, payload as Partial<Item>);
        addToast('success', 'Item updated');
      } else {
        await masterDataApi.items.create(payload as unknown as Item);
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
    { key: 'item_group_code', header: 'Group Code', width: '120px' },
    { key: 'item_group_name', header: 'Group Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.item_group_name}</span> },
    { key: 'business', header: 'Business', width: '120px' },
    { key: 'brand', header: 'Brand', width: '120px' },
    { key: 'item_category_code', header: 'Category', width: '100px' },
    { key: 'item_category_name', header: 'Category Name', width: '160px' },
    { key: 'status', header: 'Status', width: '90px' },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditH(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteHTarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const iCols: Column<Item>[] = [
    { key: 'brand', header: 'Brand', width: '120px', render: (r) => {
      const h = allHierarchy.find(x => x.item_group_code === r.item_group_code);
      return <span>{h ? h.brand : '-'}</span>;
    }},
    { key: 'item_group_code', header: 'Product Group', width: '150px', render: (r) => {
      const h = allHierarchy.find(x => x.item_group_code === r.item_group_code);
      return <span>{h ? h.item_group_name : r.item_group_code}</span>;
    }},
    { key: 'item_code', header: 'SKU Code', width: '120px', render: (r) => <span>{r.item_code}</span> },
    { key: 'item_partner_code', header: 'Vendor Code', width: '120px', render: (r) => r.item_partner_code ? <span>{r.item_partner_code}</span> : <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'item_name', header: 'SKU Name', render: (r) => <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.item_name}</span> },
    { key: 'item_type', header: 'Type', width: '150px' },
    { key: 'item_attribute', header: 'Attribute', width: '120px', render: (r) => r.item_attribute || <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'uom', header: 'UoM', width: '70px' },
    { key: 'import_lead_time_days', header: 'Import LT', width: '90px', render: (r) => `${r.import_lead_time_days}d` },
    { key: 'production_lead_time_days', header: 'Prod LT', width: '90px', render: (r) => `${r.production_lead_time_days}d` },
    { key: 'shelf_life_days', header: 'Shelf-Life', width: '90px', render: (r) => r.shelf_life_days ? `${r.shelf_life_days}d` : <span style={{ color: 'var(--color-text-muted)' }}>—</span> },
    { key: 'status', header: 'Status', width: '90px' },
    { key: 'actions', header: '', width: '80px', render: (r) => (
      <div className="table-actions">
        <button className="table-action-btn" onClick={() => openEditI(r)}><Edit2 size={14} /></button>
        <button className="table-action-btn danger" onClick={() => setDeleteITarget(r)}><Trash2 size={14} /></button>
      </div>
    )},
  ];

  const openCreateH = () => { setEditingH(null); setHForm({ business: '', brand: '', item_category_code: '', item_category_name: '', item_group_code: '', item_group_name: '', status: 'Active' }); setShowHModal(true); };
  const openEditH = (h: ProductHierarchy) => { setEditingH(h); setHForm({ business: h.business, brand: h.brand, item_category_code: h.item_category_code, item_category_name: h.item_category_name, item_group_code: h.item_group_code, item_group_name: h.item_group_name, status: h.status }); setShowHModal(true); };

  const openCreateI = () => { setEditingI(null); setIForm({ item_group_code: '', item_code: '', item_partner_code: '', item_name: '', item_for_name: '', uom: 'PCS', item_type: 'Finished Goods', item_attribute: '', status: 'Active', import_lead_time_days: 30, production_lead_time_days: 14, shelf_life_days: '' }); setShowIModal(true); };
  const openEditI = (i: Item) => { setEditingI(i); setIForm({ item_group_code: i.item_group_code, item_code: i.item_code, item_partner_code: i.item_partner_code || '', item_name: i.item_name, item_for_name: i.item_for_name || '', uom: i.uom, item_type: i.item_type, item_attribute: i.item_attribute || '', status: i.status, import_lead_time_days: i.import_lead_time_days, production_lead_time_days: i.production_lead_time_days || 14, shelf_life_days: i.shelf_life_days || '' }); setShowIModal(true); };

  const handleExportExcel = useCallback(() => {
    const dataToExport = displayedItems.length > 0 ? displayedItems : items;
    const exportRows = dataToExport.map(r => {
      const h = allHierarchy.find(x => x.item_group_code === r.item_group_code);
      return {
        'Brand': h ? h.brand : '-',
        'Product Group': h ? h.item_group_name : r.item_group_code,
        'SKU Code': r.item_code,
        'Vendor Code': r.item_partner_code || '',
        'SKU Name': r.item_name,
        'Type': r.item_type,
        'Attribute': r.item_attribute || '',
        'UoM': r.uom,
        'Import LT (days)': r.import_lead_time_days,
        'Prod LT (days)': r.production_lead_time_days || '',
        'Shelf-Life (days)': r.shelf_life_days || '',
        'Status': r.status,
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    ws['!cols'] = [
      { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 14 },
      { wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 8 },
      { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === 'hierarchy' ? 'Product Hierarchy' : 'Items');
    XLSX.writeFile(wb, `Products_SKUs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [displayedItems, items, allHierarchy, tab]);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Group & Products</h1>
          <p className="page-description">Manage product hierarchy and item master data</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={handleExportExcel}>
            <Download size={16} /> Export Excel
          </button>
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
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)',
          padding: '0 0 var(--space-4)',
          alignItems: 'center',
        }}>
          <div style={{ position: 'relative' }}>
            <div 
              className="form-input form-select" 
              style={{ width: 180, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => { setShowBrandDropdown(!showBrandDropdown); setShowGroupDropdown(false); }}
            >
              {iFilters.brand.length > 0 ? `${iFilters.brand.length} Brands Selected` : 'All Brands'}
            </div>
            {showBrandDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {brandOptions.map(b => (
                  <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={iFilters.brand.includes(b)}
                      onChange={e => {
                        const nb = e.target.checked ? [...iFilters.brand, b] : iFilters.brand.filter(x => x !== b);
                        setIFilters(prev => ({ ...prev, brand: nb }));
                        setIPage(1);
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
              onClick={() => { setShowGroupDropdown(!showGroupDropdown); setShowBrandDropdown(false); }}
            >
              {iFilters.group_code.length > 0 ? `${iFilters.group_code.length} Groups Selected` : 'All Product Groups'}
            </div>
            {showGroupDropdown && (
              <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 250, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                {productGroups.map(pg => (
                  <label key={pg.code} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                    <input 
                      type="checkbox" 
                      checked={iFilters.group_code.includes(pg.code)}
                      onChange={e => {
                        const nc = e.target.checked ? [...iFilters.group_code, pg.code] : iFilters.group_code.filter(x => x !== pg.code);
                        setIFilters(prev => ({ ...prev, group_code: nc }));
                        setIPage(1);
                      }}
                    />
                    <span style={{ fontSize: 'var(--font-size-sm)' }}>{pg.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <select
            className="form-input form-select"
            style={{ width: 170 }}
            value={iFilters.item_type || ''}
            onChange={e => {
              setIFilters(prev => ({ ...prev, item_type: e.target.value }));
              setIPage(1);
            }}
          >
            <option value="">All Types</option>
            <option value="Goods">Goods</option>
            <option value="Finished Goods">Finished Goods</option>
            <option value="Semi-Finished Goods">Semi-Finished Goods</option>
            <option value="Raw Material">Raw Material</option>
          </select>

          <select
            className="form-input form-select"
            style={{ width: 170 }}
            value={iFilters.item_attribute || ''}
            onChange={e => {
              setIFilters(prev => ({ ...prev, item_attribute: e.target.value }));
              setIPage(1);
            }}
          >
            <option value="">All Attributes</option>
            <option value="Normal">Normal</option>
            <option value="Fast-Moving">Fast-Moving</option>
            <option value="Slow-Moving">Slow-Moving</option>
          </select>

          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search items..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              style={filterInputStyle}
            />
          </div>

          {(iFilters.brand.length > 0 || iFilters.group_code.length > 0 || iFilters.item_type || iFilters.item_attribute || searchInput) && (
            <button
              onClick={() => { 
                setIFilters({ search: '', item_type: '', item_attribute: '', group_code: [], brand: [] }); 
                setSearchInput('');
                setIPage(1); 
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
        <DataTable columns={iCols} data={displayedItems} loading={iLoading} rowKey={(r) => r.id} minWidth="1400px" />
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
          <div className="form-group">
            <label className="form-label">Brand *</label>
            <select className="form-input form-select" value={hForm.brand} onChange={(e) => setHForm({ ...hForm, brand: e.target.value })}>
              <option value="">Select brand...</option>
              {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
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
              <option value="">Select group...</option>{allHierarchy.map(h => <option key={h.item_group_code} value={h.item_group_code}>{h.item_group_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">SKU Code *</label><input className="form-input" placeholder="e.g. SKU-001" value={iForm.item_code} onChange={(e) => setIForm({ ...iForm, item_code: e.target.value })} disabled={!!editingI} /></div>
        </div>
        <div className="form-group"><label className="form-label">SKU Name *</label><input className="form-input" placeholder="Product name" value={iForm.item_name} onChange={(e) => setIForm({ ...iForm, item_name: e.target.value })} /></div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Type *</label><select className="form-input form-select" value={iForm.item_type} onChange={(e) => setIForm({ ...iForm, item_type: e.target.value })}><option value="Goods">Goods</option><option value="Finished Goods">Finished Goods</option><option value="Semi-Finished Goods">Semi-Finished Goods</option><option value="Raw Material">Raw Material</option></select></div>
          <div className="form-group"><label className="form-label">Attribute</label><select className="form-input form-select" value={iForm.item_attribute} onChange={(e) => setIForm({ ...iForm, item_attribute: e.target.value })}><option value="">None</option><option value="Normal">Normal</option><option value="Fast-Moving">Fast-Moving</option><option value="Slow-Moving">Slow-Moving</option></select></div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">UoM *</label><input className="form-input" placeholder="PCS" value={iForm.uom} onChange={(e) => setIForm({ ...iForm, uom: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">Import Lead Time (days)</label><input className="form-input" type="number" value={iForm.import_lead_time_days} onChange={(e) => setIForm({ ...iForm, import_lead_time_days: Number(e.target.value) })} /></div>
        </div>
        <div className="form-row form-row-3">
          <div className="form-group"><label className="form-label">Production Lead Time (days)</label><input className="form-input" type="number" value={iForm.production_lead_time_days} onChange={(e) => setIForm({ ...iForm, production_lead_time_days: Number(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">Shelf-Life (days)</label><input className="form-input" type="number" placeholder="Optional" value={iForm.shelf_life_days} onChange={(e) => setIForm({ ...iForm, shelf_life_days: e.target.value ? Number(e.target.value) : '' })} /></div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Foreign Name</label><input className="form-input" placeholder="Optional" value={iForm.item_for_name} onChange={(e) => setIForm({ ...iForm, item_for_name: e.target.value })} /></div>
          <div className="form-group">
            <label className="form-label">Partner Code (Vendor)</label>
            <select className="form-input form-select" value={iForm.item_partner_code} onChange={(e) => setIForm({ ...iForm, item_partner_code: e.target.value })}>
              <option value="">Optional</option>
              {activePartners.map(p => <option key={p.partner_code} value={p.partner_code}>{p.partner_code} - {p.partner_name}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteHTarget} onClose={() => setDeleteHTarget(null)} onConfirm={handleDeleteH} loading={deletingH}
        title="Delete Product Group" message={`Delete group "${deleteHTarget?.item_group_name}"?`} />

      <ConfirmDialog isOpen={!!deleteITarget} onClose={() => setDeleteITarget(null)} onConfirm={handleDeleteI} loading={deletingI}
        title="Delete Item" message={`Are you sure you want to delete "${deleteITarget?.item_name}"?`} />
    </div>
  );
}