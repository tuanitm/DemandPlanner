'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Search, Package, Trash2 } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, BOMEntry, Item } from '@/lib/api';

interface BOMLine {
  item_code: string;
  quantity: number;
  uom: string;
}

const ITEM_TYPES = ['Goods', 'Finished Goods', 'Semi-Finished Goods', 'Raw Material'];

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

  // Multi-line BOM form
  const [parentItemCode, setParentItemCode] = useState('');
  const [bomLines, setBomLines] = useState<BOMLine[]>([{ item_code: '', quantity: 1, uom: 'KG' }]);

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
    // Validate
    if (!parentItemCode) {
      addToast('error', 'Validation Error', 'Please select a parent item.');
      return;
    }
    const validLines = bomLines.filter(line => line.item_code && line.quantity > 0);
    if (validLines.length === 0) {
      addToast('error', 'Validation Error', 'Please add at least one BOM line item.');
      return;
    }

    setSaving(true);
    try {
      const entries = validLines.map(line => ({
        finished_goods_item_code: parentItemCode,
        raw_material_item_code: line.item_code,
        quantity: line.quantity,
        uom: line.uom,
      }));

      if (entries.length === 1) {
        await masterDataApi.bom.create(entries[0]);
      } else {
        await masterDataApi.bom.bulkCreate(entries);
      }

      addToast('success', `${validLines.length} BOM ${validLines.length === 1 ? 'entry' : 'entries'} created`);
      setShowModal(false);
      // Refresh if the parent matches the selected FG
      if (selectedFG === parentItemCode || !selectedFG) {
        if (parentItemCode) {
          setSelectedFG(parentItemCode);
          fetchBOM(parentItemCode);
        }
      } else if (selectedFG) {
        fetchBOM(selectedFG);
      }
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setParentItemCode(selectedFG || '');
    setBomLines([{ item_code: '', quantity: 1, uom: 'KG' }]);
    setShowModal(true);
  };

  const addBomLine = () => {
    setBomLines([...bomLines, { item_code: '', quantity: 1, uom: 'KG' }]);
  };

  const removeBomLine = (index: number) => {
    if (bomLines.length <= 1) return;
    setBomLines(bomLines.filter((_, i) => i !== index));
  };

  const updateBomLine = (index: number, field: keyof BOMLine, value: string | number) => {
    const updated = [...bomLines];
    updated[index] = { ...updated[index], [field]: value };
    setBomLines(updated);
  };

  // Parent items: all types except raw material (parent can be Goods, FG, Semi-FG)
  const parentItems = items.filter(i =>
    i.item_type === 'Finished Goods' || i.item_type === 'Semi-Finished Goods' || i.item_type === 'Goods'
  );

  // Child items for BOM lines: all types allowed
  const childItems = items;

  // Already used item codes in current BOM lines (to avoid duplicate selection)
  const usedItemCodes = new Set(bomLines.map(l => l.item_code).filter(Boolean));

  const fgItems = items.filter(i => i.item_type === 'Finished Goods' || i.item_type === 'Semi-Finished Goods' || i.item_type === 'Goods');
  const filteredFG = fgSearch ? fgItems.filter(i => i.item_code.toLowerCase().includes(fgSearch.toLowerCase()) || i.item_name.toLowerCase().includes(fgSearch.toLowerCase())) : fgItems;

  const getItemTypeBadge = (type: string) => {
    switch (type) {
      case 'Finished Goods': return 'badge-success';
      case 'Semi-Finished Goods': return 'badge-info';
      case 'Raw Material': return 'badge-warning';
      default: return 'badge-info';
    }
  };

  const columns: Column<BOMEntry>[] = [
    { key: 'raw_material_item_code', header: 'Component Code', width: '160px', render: (r) => <span className="badge badge-warning">{r.raw_material_item_code}</span> },
    { key: 'rm_name', header: 'Component Name', render: (r) => {
      const rm = items.find(i => i.item_code === r.raw_material_item_code);
      return <span style={{ color: 'var(--color-text-primary)', fontWeight: 500 }}>{rm?.item_name || r.raw_material_item_code}</span>;
    }},
    { key: 'rm_type', header: 'Type', width: '150px', render: (r) => {
      const rm = items.find(i => i.item_code === r.raw_material_item_code);
      return rm ? <span className={`badge ${getItemTypeBadge(rm.item_type)}`}>{rm.item_type}</span> : <span className="badge">—</span>;
    }},
    { key: 'quantity', header: 'Qty per Unit', width: '120px', render: (r) => <span style={{ fontWeight: 600 }}>{r.quantity}</span> },
    { key: 'uom', header: 'UoM', width: '80px' },
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bill of Materials</h1>
          <p className="page-description">Define component breakdown for finished goods and semi-finished goods</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <ImportExcel entityKey="bom" entityLabel="Bill of Materials" onImportComplete={() => selectedFG && fetchBOM(selectedFG)} />
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add BOM Entry
          </button>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--space-6)', alignItems: 'start' }}>
        {/* FG Selector */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Select Parent Item</div>
          </div>
          <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input className="form-input" style={{ paddingLeft: 38 }} placeholder="Search items..." value={fgSearch} onChange={(e) => setFgSearch(e.target.value)} />
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {filteredFG.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>No items found</div>
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{item.item_code}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.item_name}</div>
                </div>
                <span className={`badge ${getItemTypeBadge(item.item_type)}`} style={{ fontSize: '10px', flexShrink: 0 }}>{item.item_type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* BOM Table */}
        <div>
          {selectedFG ? (
            <>
              <div style={{ marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)' }}>BOM for: </span>
                <span className="badge badge-info">{selectedFG}</span>
                <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
                  {items.find(i => i.item_code === selectedFG)?.item_name}
                </span>
                {(() => {
                  const item = items.find(i => i.item_code === selectedFG);
                  return item ? <span className={`badge ${getItemTypeBadge(item.item_type)}`} style={{ fontSize: '10px' }}>{item.item_type}</span> : null;
                })()}
              </div>
              <DataTable columns={columns} data={bomData} loading={loading} rowKey={(r) => r.id} emptyTitle="No BOM entries" emptyText="Add component items for this parent item." />
            </>
          ) : (
            <div className="card">
              <div className="empty-state">
                <Package size={48} className="empty-state-icon" />
                <div className="empty-state-title">Select a Parent Item</div>
                <div className="empty-state-text">Choose an item from the left panel to view its bill of materials breakdown.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add BOM Entry Modal — Multi-line */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add BOM Entry" size="xl"
        footer={<>
          <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving && <span className="loading-spinner" />}
            Create {bomLines.filter(l => l.item_code).length > 1 ? `(${bomLines.filter(l => l.item_code).length} items)` : ''}
          </button>
        </>}>

        {/* Parent item selector */}
        <div className="form-group">
          <label className="form-label">Parent Item *</label>
          <select className="form-input form-select" value={parentItemCode} onChange={(e) => setParentItemCode(e.target.value)}>
            <option value="">Select parent item...</option>
            {parentItems.map(i => (
              <option key={i.item_code} value={i.item_code}>{i.item_code} — {i.item_name} ({i.item_type})</option>
            ))}
          </select>
        </div>

        {/* BOM Lines header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <label className="form-label" style={{ margin: 0, fontWeight: 600 }}>Component Items</label>
          <button className="btn btn-secondary" onClick={addBomLine} style={{ padding: '4px 12px', fontSize: 'var(--font-size-xs)' }}>
            <Plus size={14} /> Add Line
          </button>
        </div>

        {/* Column headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 100px 80px 36px',
          gap: 'var(--space-2)',
          marginBottom: 'var(--space-2)',
          padding: '0 var(--space-1)',
        }}>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>Item</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>Qty</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', fontWeight: 500 }}>UoM</div>
          <div></div>
        </div>

        {/* BOM Lines */}
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {bomLines.map((line, idx) => (
            <div key={idx} style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 80px 36px',
              gap: 'var(--space-2)',
              marginBottom: 'var(--space-2)',
              alignItems: 'center',
            }}>
              <select
                className="form-input form-select"
                value={line.item_code}
                onChange={(e) => updateBomLine(idx, 'item_code', e.target.value)}
                style={{ fontSize: 'var(--font-size-sm)' }}
              >
                <option value="">Select item...</option>
                {ITEM_TYPES.map(type => {
                  const typeItems = childItems.filter(i =>
                    i.item_type === type && (i.item_code === line.item_code || !usedItemCodes.has(i.item_code)) && i.item_code !== parentItemCode
                  );
                  if (typeItems.length === 0) return null;
                  return (
                    <optgroup key={type} label={type}>
                      {typeItems.map(i => (
                        <option key={i.item_code} value={i.item_code}>{i.item_code} — {i.item_name}</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
              <input
                className="form-input"
                type="number"
                step="0.001"
                min="0"
                value={line.quantity}
                onChange={(e) => updateBomLine(idx, 'quantity', Number(e.target.value))}
                style={{ fontSize: 'var(--font-size-sm)' }}
              />
              <input
                className="form-input"
                value={line.uom}
                onChange={(e) => updateBomLine(idx, 'uom', e.target.value)}
                style={{ fontSize: 'var(--font-size-sm)' }}
              />
              <button
                className="btn btn-secondary"
                onClick={() => removeBomLine(idx)}
                disabled={bomLines.length <= 1}
                style={{ padding: '6px', minWidth: 'unset', opacity: bomLines.length <= 1 ? 0.3 : 1 }}
                title="Remove line"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>

        {/* Summary */}
        {bomLines.filter(l => l.item_code).length > 0 && (
          <div style={{
            marginTop: 'var(--space-3)',
            padding: 'var(--space-3)',
            background: 'var(--color-accent-glow)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
          }}>
            <strong>{bomLines.filter(l => l.item_code).length}</strong> component{bomLines.filter(l => l.item_code).length !== 1 ? 's' : ''} will be added
            {parentItemCode && <> to <span className="badge badge-info" style={{ fontSize: '10px' }}>{parentItemCode}</span></>}
          </div>
        )}
      </Modal>
    </div>
  );
}
