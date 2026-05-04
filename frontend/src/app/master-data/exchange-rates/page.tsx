'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, Calendar } from 'lucide-react';
import ImportExcel from '@/components/ui/ImportExcel';
import DataTable, { Column } from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { masterDataApi, ExchangeRate } from '@/lib/api';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function ExchangeRatesPage() {
  const { addToast } = useToast();
  const [data, setData] = useState<ExchangeRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ year: new Date().getFullYear(), month: 1, from_currency: 'VND', to_currency: 'USD', rate: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await masterDataApi.exchangeRates.list(year);
      setData(res);
    } catch (e) { addToast('error', 'Failed to load rates', (e as Error).message); }
    finally { setLoading(false); }
  }, [year, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await masterDataApi.exchangeRates.create(form);
      addToast('success', 'Exchange rate saved'); setShowModal(false); fetchData();
    } catch (e) { addToast('error', 'Save failed', (e as Error).message); }
    finally { setSaving(false); }
  };

  const openCreate = () => {
    setForm({ year, month: new Date().getMonth() + 1, from_currency: 'VND', to_currency: 'USD', rate: 0 });
    setShowModal(true);
  };

  const columns: Column<ExchangeRate>[] = [
    { key: 'period', header: 'Period', width: '120px', render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Calendar size={14} style={{ color: 'var(--color-accent)' }} />
        <span style={{ fontWeight: 500 }}>{MONTHS[r.month - 1]} {r.year}</span>
      </div>
    )},
    { key: 'from_currency', header: 'From', width: '80px', render: (r) => <span className="badge badge-info">{r.from_currency}</span> },
    { key: 'to_currency', header: 'To', width: '80px', render: (r) => <span className="badge badge-success">{r.to_currency}</span> },
    { key: 'rate', header: 'Rate', width: '150px', render: (r) => <span style={{ fontWeight: 700, fontSize: 'var(--font-size-md)', color: 'var(--color-text-primary)' }}>{r.rate.toLocaleString()}</span> },
    { key: 'created_at', header: 'Updated', width: '140px', render: (r) => new Date(r.created_at).toLocaleDateString() },
  ];

  const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Exchange Rates</h1>
          <p className="page-description">Monthly currency exchange rates for multi-currency reporting</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <select className="form-input form-select" style={{ width: 120 }} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <ImportExcel entityKey="exchange-rates" entityLabel="Exchange Rates" onImportComplete={fetchData} />
          <button className="btn btn-primary" onClick={openCreate}><Plus size={16} /> Add Rate</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="kpi-card" style={{ '--kpi-color': '#6366f1' } as React.CSSProperties}>
          <div className="kpi-label">Total Entries</div>
          <div className="kpi-value">{data.length}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#22c55e' } as React.CSSProperties}>
          <div className="kpi-label">Currencies</div>
          <div className="kpi-value">{new Set(data.map(d => d.to_currency)).size}</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
          <div className="kpi-label">Months Covered</div>
          <div className="kpi-value">{new Set(data.map(d => d.month)).size}/12</div>
        </div>
      </div>

      <DataTable columns={columns} data={data} loading={loading} rowKey={(r) => r.id} emptyTitle="No exchange rates" emptyText={`No rates found for ${year}. Add monthly exchange rates to support multi-currency reporting.`} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Add Exchange Rate" size="sm"
        footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button><button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving && <span className="loading-spinner" />}Save</button></>}>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">Year *</label><input className="form-input" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} /></div>
          <div className="form-group"><label className="form-label">Month *</label>
            <select className="form-input form-select" value={form.month} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="form-row form-row-2">
          <div className="form-group"><label className="form-label">From Currency</label><input className="form-input" value={form.from_currency} onChange={(e) => setForm({ ...form, from_currency: e.target.value })} /></div>
          <div className="form-group"><label className="form-label">To Currency *</label><input className="form-input" placeholder="USD" value={form.to_currency} onChange={(e) => setForm({ ...form, to_currency: e.target.value })} /></div>
        </div>
        <div className="form-group"><label className="form-label">Rate *</label><input className="form-input" type="number" step="0.0001" placeholder="e.g. 25385" value={form.rate || ''} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} /></div>
      </Modal>
    </div>
  );
}
