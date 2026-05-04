'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Search, Package } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, BOMEntry, Item } from '@/lib/api';

export default function BOMPage() {
  const { addToast } = useToast();
  const [fgSearch, setFgSearch] = useState('');
  const [selectedFG, setSelectedFG] = useState('');
  const [bomData, setBomData] = useState<BOMEntry[]>([]);
  const [loading, setLoading] = useState(false);

  // Items list for picker
  const [items, setItems] = useState<Item[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ finished_goods_item_code: '', raw_material_item_code: '', quantity: 1, uom: 'KG' });

  // Fetch items for pickers
  useEffect(() => {
    masterDataApi.items.list({ page: 1, page_size: 200 }).then(res => setItems(res.items)).catch(() => {});
  }, []);

  const fetchBOM = useCallback(async (code: string) => {
    if (!code) { setBomData([]); return; }
    setLoading(true);
    try {
      const res = await masterDataApi.bom.list(code);
      setBomData(res);
    } catch (e) { addToast('error', 'Failed to load BOM', (e as Error).message); }
    finally { setLoading(false); }
  }, [addToast]);

  const handleSelectFG = (code: string) => {
    setSelectedFG(code);
    fetchBOM(code);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await masterDataApi.bom.create(form);
      addToast('success', 'BOM entry created');
      setShowModal(false);
      if (selectedFG) fetchBOM(selectedFG);
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setForm({ finished_goods_item_code: selectedFG || '', raw_material_item_code: '', quantity: 1, uom: 'KG' });
    setShowModal(true);
  };

  const fgItems = items.filter(i => i.item_type === 'Finished Goods' || i.item_type === 'Goods');
  const rmItems = items.filter(i => i.item_type === 'Raw Material');
  const filteredFG = fgSearch ? fgItems.filter(i => i.item_code.toLowerCase().includes(fgSearch.toLowerCase()) || i.item_name.toLowerCase().includes(fgSearch.toLowerCase())) : fgItems;

  const columns: Column<BOMEntry>[] = [
    { key: 'raw_material_item_code', header: 'Raw Material Code', width: '180px', render: (r) => <span className="badge badge-warning">{r.raw_material_item_code}</span> },
    { key: 'rm_name', header: 'Raw Material Name', render: (r) => {
      const rm = items.find(i => i.item_code === r.raw_material_item_code);
      return <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{rm?.item_name || r.raw_material_item_code}</span>;
    }},
    { key: 'quantity', header: 'Qty per Unit', width: '120px', render: (r) => <span style={{ fontWeight: 600 }}>{r.quantity}</span> },
    { key: 'uom', header: 'UoM', width: '80px' },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bill of Materials</h1>
          <p className="page-description">Define raw material breakdown for finished goods</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <ImportExcel entityKey="bom" entityLabel="Bill of Materials" onImportComplete={() => selectedFG && fetchBOM(selectedFG)} />
          <button className="btn btn-primary" onClick={openCreate} disabled={!selectedFG}>
            <Plus size={16} /> Add BOM Entry
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        {/* FG Selector */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Select Finished Goods</div>
          </div>
          <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 38 }} placeholder="Search FG items..." value={fgSearch} onChange={(e) => setFgSearch(e.target.value)} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filteredFG.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>No finished goods found</div>
            ) : filteredFG.map(item => (
              <div key={item.item_code} onClick={() => handleSelectFG(item.item_code)}
                style={{
                  padding: 'var(--space-3) var(--space-4)', cursor: 'pointer', borderRadius: 'var(--radius-md)',
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 2,
                  background: selectedFG === item.item_code ? 'var(--color-accent-glow)' : 'transparent',
                  color: selectedFG === item.item_code ? 'var(--color-accent-hover)' : 'var(--color-text-secondary)',
                  transition: 'all 0.15s ease',
                }}>
                <Package size={16} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{item.item_code}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{item.item_name}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* BOM Table */}
        <div>
          {selectedFG ? (
            <>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>BOM for: </span>
                <span className="badge badge-info">{selectedFG}</span>
                <span style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                  {items.find(i => i.item_code === selectedFG)?.item_name}
                </span>
              </div>
              <DataTable columns={columns} data={bomData} loading={loading} rowKey={(r) => r.id} emptyTitle="No BOM entries" emptyText="Add raw materials for this finished goods item." />
            </>
          ) : (
            <div className="card">
              <div className="empty-state">
                <Package size={48} className="empty-state-icon" />
                <div className="empty-state-title">Select a Finished Goods item</div>
                <div className="empty-state-text">Choose an item from the left panel to view its bill of materials breakdown.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add BOM Entry" size="md"
        footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving && <span className="loading-spinner" />}Create</button></>}>
        <div className="form-group">
          <label className="form-label">Finished Goods *</label>
          <select className="form-input form-select" value={form.finished_goods_item_code} onChange={(e) => setForm({ ...form, finished_goods_item_code: e.target.value })}>
            <option value="">Select FG...</option>{fgItems.map(i => <option key={i.item_code} value={i.item_code}>{i.item_code} — {i.item_name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Raw Material *</label>
          <select className="form-input form-select" value={form.raw_material_item_code} onChange={(e) => setForm({ ...form, raw_material_item_code: e.target.value })}>
            <option value="">Select RM...</option>{rmItems.map(i => <option key={i.item_code} value={i.item_code}>{i.item_code} — {i.item_name}</option>)}
          </select>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Quantity per Unit *</label><input className="form-input" type="number" step="0.001" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">UoM *</label><input className="form-input" value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
