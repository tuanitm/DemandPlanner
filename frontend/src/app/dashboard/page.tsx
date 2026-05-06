'use client';

import { useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer
} from 'recharts';
import { TrendingUp, TrendingDown, Package, AlertTriangle, DollarSign, Target } from 'lucide-react';

/* ── Demo data ── */
const salesPlanData = [
  { category: 'Skincare', plan: 45000, actual: 42300 },
  { category: 'Haircare', plan: 32000, actual: 35100 },
  { category: 'Oral Care', plan: 28000, actual: 26800 },
  { category: 'Body Care', plan: 22000, actual: 23500 },
  { category: 'Fragrance', plan: 18000, actual: 16200 },
  { category: 'Supplements', plan: 15000, actual: 14800 },
];

const inventoryStructure = [
  { name: 'Normal Stock', value: 68, color: '#22c55e' },
  { name: 'Slow-moving', value: 22, color: '#f59e0b' },
  { name: 'Near-expiry', value: 10, color: '#ef4444' },
];

const kpis = [
  { label: 'Total Revenue (VND)', value: '₫ 12.8B', change: '+12.3%', positive: true, icon: <DollarSign size={20} />, color: '#6366f1' },
  { label: 'Forecast Accuracy', value: '82.4%', change: '+5.2%', positive: true, icon: <Target size={20} />, color: '#22c55e' },
  { label: 'Inventory Value', value: '₫ 3.2B', change: '-8.1%', positive: true, icon: <Package size={20} />, color: '#3b82f6' },
  { label: 'Stockout SKUs', value: '14', change: '+3', positive: false, icon: <AlertTriangle size={20} />, color: '#ef4444' },
];

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
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);

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
            <select
              className="form-input form-select"
              style={{ width: 160 }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              id="select-month"
            >
              {monthNames.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
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
        {kpis.map((kpi, i) => (
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
                {kpi.icon}
              </div>
            </div>
          </div>
        ))}
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
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={salesPlanData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="category" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
              <Bar dataKey="plan" name="Sales Plan" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
            <ResponsiveContainer width="60%" height={320}>
              <PieChart>
                <Pie
                  data={inventoryStructure}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  paddingAngle={4}
                  dataKey="value"
                  stroke="none"
                >
                  {inventoryStructure.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {inventoryStructure.map((item, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
                  padding: 'var(--space-3) 0',
                  borderBottom: i < inventoryStructure.length - 1 ? '1px solid var(--color-border)' : 'none'
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
                <th>Product Name</th>
                <th>Qty Sold</th>
                <th>Revenue (VND)</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['SKU-001', 'Premium Face Cream 50ml', '12,450', '₫ 1.87B'],
                ['SKU-034', 'Anti-Aging Serum 30ml', '9,820', '₫ 1.47B'],
                ['SKU-012', 'Vitamin C Moisturizer', '8,650', '₫ 1.04B'],
                ['SKU-078', 'Hair Growth Shampoo 300ml', '7,200', '₫ 576M'],
                ['SKU-055', 'Collagen Supplement 60ct', '6,800', '₫ 952M'],
              ].map(([code, name, qty, rev], i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{i + 1}</td>
                  <td><span className="badge badge-info">{code}</span></td>
                  <td style={{ color: 'var(--color-text-primary)' }}>{name}</td>
                  <td>{qty}</td>
                  <td style={{ fontWeight: 600 }}>{rev}</td>
                </tr>
              ))}
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
                <th>Product Name</th>
                <th>On-Hand</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['SKU-089', 'Body Lotion Lavender 500ml', '45,200', 'warning'],
                ['SKU-023', 'Whitening Toothpaste 150g', '38,400', 'success'],
                ['SKU-067', 'Rose Hip Oil 50ml', '32,100', 'danger'],
                ['SKU-045', 'Keratin Hair Mask 250ml', '28,900', 'warning'],
                ['SKU-091', 'Sunscreen SPF50 60ml', '25,600', 'success'],
              ].map(([code, name, qty, status], i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{i + 1}</td>
                  <td><span className="badge badge-info">{code}</span></td>
                  <td style={{ color: 'var(--color-text-primary)' }}>{name}</td>
                  <td>{qty}</td>
                  <td>
                    <span className={`badge badge-${status}`}>
                      {status === 'success' ? 'Normal' : status === 'warning' ? 'Slow-moving' : 'Near-expiry'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
