'use client';

import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Package, AlertTriangle, DollarSign, Target } from 'lucide-react';
import { dashboardApi, DashboardSummaryResponse } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#f1f5f9',
};

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function ExecutiveDashboard() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1; // 1-indexed
  const currentQuarter = `Q${Math.ceil(currentMonth / 3)}`;

  const [viewMode, setViewMode] = useState<'monthly' | 'quarterly'>('monthly');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number[]>([currentMonth]);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
  const [showMonthDropdown, setShowMonthDropdown] = useState(false);

  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await dashboardApi.summary({
          view_mode: viewMode,
          year: selectedYear,
          month: viewMode === 'monthly' ? selectedMonth : undefined,
          quarter: viewMode === 'quarterly' ? selectedQuarter : undefined,
        });
        setData(res);
      } catch (err: any) {
        addToast('error', 'Failed to load dashboard data', err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [viewMode, selectedYear, selectedMonth, selectedQuarter, addToast]);

  const getIconForLabel = (label: string) => {
    if (label.includes('Revenue')) return <DollarSign size={20} />;
    if (label.includes('Accuracy')) return <Target size={20} />;
    if (label.includes('Value')) return <Package size={20} />;
    if (label.includes('Stockout')) return <AlertTriangle size={20} />;
    return <Package size={20} />;
  };

  return (
    <div className="animate-in">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Executive Summary</h1>
          <p className="page-description">Overview of demand planning performance and inventory health</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <select
            className="form-input form-select"
            style={{ width: 140 }}
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value as 'monthly' | 'quarterly')}
            id="select-view-mode"
          >
            <option value="monthly">By Month</option>
            <option value="quarterly">By Quarter</option>
          </select>
          <select
            className="form-input form-select"
            style={{ width: 140 }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            id="select-year"
          >
            <option value={currentYear + 1}>{currentYear + 1}</option>
            <option value={currentYear}>{currentYear}</option>
            <option value={currentYear - 1}>{currentYear - 1}</option>
          </select>
          {viewMode === 'monthly' ? (
            <div style={{ position: 'relative' }}>
              <div
                className="form-input form-select"
                style={{ width: 160, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={() => setShowMonthDropdown(!showMonthDropdown)}
              >
                {selectedMonth.length > 0 ? `${selectedMonth.length} Months Selected` : 'All Months'}
              </div>
              {showMonthDropdown && (
                <div style={{ position: 'absolute', top: '100%', left: 0, minWidth: '100%', zIndex: 12, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: 300, overflowY: 'auto', padding: 'var(--space-2)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                  {monthNames.map((name, i) => {
                    const monthVal = i + 1;
                    return (
                      <label key={monthVal} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2)', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
                        <input
                          type="checkbox"
                          checked={selectedMonth.includes(monthVal)}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...selectedMonth, monthVal]
                              : selectedMonth.filter(x => x !== monthVal);
                            setSelectedMonth(next);
                          }}
                        />
                        <span style={{ fontSize: 'var(--font-size-sm)' }}>{name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <select
              className="form-input form-select"
              style={{ width: 140 }}
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              id="select-quarter"
            >
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
          )}
          <button className="btn btn-primary">
            Export Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center', width: '100%', gridColumn: '1 / -1', color: 'var(--color-text-muted)' }}>
            Loading KPIs...
          </div>
        ) : (
          (data?.kpis || []).map((kpi, i) => (
            <div key={i} className="kpi-card" style={{ '--kpi-color': kpi.color } as React.CSSProperties}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="kpi-label">{kpi.label}</div>
                  <div className="kpi-value">{kpi.value}</div>
                  <div className={`kpi-change ${kpi.positive ? 'positive' : 'negative'}`}>
                    {kpi.positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {kpi.change} vs last period
                  </div>
                </div>
                <div style={{
                  width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: `${kpi.color}20`, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: kpi.color,
                }}>
                  {getIconForLabel(kpi.label)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Charts Row */}
      <div className="grid-2">
        {/* Sales Plan vs Actual */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Sales Plan vs Actual Achievement</div>
              <div className="card-subtitle">By product category (units)</div>
            </div>
          </div>
          {loading ? (
            <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>Loading chart...</div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data?.salesPlanData || []} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="category" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="plan" name="Sales Plan" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </div>

        {/* Inventory Structure Pie */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Inventory Structure</div>
              <div className="card-subtitle">Stock health breakdown</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)' }}>
            {loading ? (
              <div style={{ height: 320, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>Loading chart...</div>
            ) : (
              <ResponsiveContainer width="60%" height={320}>
                <PieChart>
                  <Pie
                    data={data?.inventoryStructure || []}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={120}
                    paddingAngle={4}
                    dataKey="value"
                    stroke="none"
                  >
                    {data?.inventoryStructure?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                </Pie>
                </PieChart>
              </ResponsiveContainer>
            )}
            <div style={{ flex: 1 }}>
              {loading ? null : (data?.inventoryStructure || []).map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) 0',
                  borderBottom: i < (data?.inventoryStructure?.length || 0) - 1 ? '1px solid var(--color-border)' : 'none'
                }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 'var(--radius-full)',
                    background: item.color, flexShrink: 0
                  }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>{item.name}</div>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>{item.value}%</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top 10 Tables */}
      <div className="grid-2" style={{ marginTop: 'var(--space-6)' }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Top 10 Best-Selling SKUs</div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU Code</th>
                <th>SKU Name</th>
                <th>Qty Sold</th>
                <th>Revenue (VND)</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)'}}>Loading data...</td></tr>
              ) : (
                data?.topSellingSKUs?.map(([code, name, qty, rev], i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{i + 1}</td>
                    <td>{code}</td>
                    <td style={{ color: 'var(--color-text-primary)' }}>{name}</td>
                    <td>{qty}</td>
                    <td style={{ fontWeight: 600 }}>{rev}</td>
                  </tr>
                ))
              )}
              {!loading && !data?.topSellingSKUs?.length && <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>No data available</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Top 10 Highest Inventory SKUs</div>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>SKU Code</th>
                <th>SKU Name</th>
                <th>On-Hand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)'}}>Loading data...</td></tr>
              ) : (
                data?.topInventorySKUs?.map(([code, name, qty, status], i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{i + 1}</td>
                    <td>{code}</td>
                    <td style={{ color: 'var(--color-text-primary)' }}>{name}</td>
                    <td>{qty}</td>
                    <td>
                      <span>
                        {status === 'success' ? 'Normal' : status === 'warning' ? 'Slow-moving' : 'Near-expiry'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
              {!loading && !data?.topInventorySKUs?.length && <tr><td colSpan={5} style={{textAlign: 'center', padding: '2rem'}}>No data available</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
