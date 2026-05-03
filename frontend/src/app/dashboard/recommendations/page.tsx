'use client';

import { Brain, ShoppingCart, Factory, Package } from 'lucide-react';

const purchaseRecommendations = [
  { item: 'SKU-001', name: 'Premium Face Cream 50ml', type: 'Goods', forecast: 12450, safety: 2000, onhand: 3200, incoming: 5000, suggested: 6250, risk: 'Medium', eta: '2026-06-15' },
  { item: 'SKU-034', name: 'Anti-Aging Serum 30ml', type: 'Goods', forecast: 9820, safety: 1500, onhand: 1200, incoming: 2000, suggested: 8120, risk: 'High', eta: '2026-06-10' },
  { item: 'SKU-078', name: 'Hair Growth Shampoo 300ml', type: 'Goods', forecast: 7200, safety: 1000, onhand: 4500, incoming: 1500, suggested: 2200, risk: 'Low', eta: '2026-06-20' },
];

const productionRecommendations = [
  { item: 'SKU-012', name: 'Vitamin C Moisturizer', type: 'FG', forecast: 8650, safety: 1200, onhand: 2800, incoming: 1000, suggested: 6050, risk: 'High', planned: '2026-06-08' },
  { item: 'SKU-055', name: 'Collagen Supplement 60ct', type: 'FG', forecast: 6800, safety: 800, onhand: 5200, incoming: 0, suggested: 2400, risk: 'Medium', planned: '2026-06-12' },
];

const rmRequirements = [
  { item: 'RM-101', name: 'Vitamin C Powder', fg: 'SKU-012', moQty: 6050, bomQty: 0.05, required: 302.5, onhand: 100, toPurchase: 202.5, unit: 'kg' },
  { item: 'RM-102', name: 'Shea Butter', fg: 'SKU-012', moQty: 6050, bomQty: 0.08, required: 484, onhand: 200, toPurchase: 284, unit: 'kg' },
  { item: 'RM-203', name: 'Collagen Hydrolysate', fg: 'SKU-055', moQty: 2400, bomQty: 0.15, required: 360, onhand: 150, toPurchase: 210, unit: 'kg' },
  { item: 'RM-204', name: 'Gelatin Capsule Shell', fg: 'SKU-055', moQty: 2400, bomQty: 60, required: 144000, onhand: 50000, toPurchase: 94000, unit: 'pcs' },
];

function RiskBadge({ risk }: { risk: string }) {
  const cls = risk === 'Critical' ? 'badge-danger' : risk === 'High' ? 'badge-warning' : risk === 'Medium' ? 'badge-info' : 'badge-success';
  return <span className={`badge ${cls}`}>{risk}</span>;
}

export default function RecommendationsPage() {
  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Forecast Recommendations</h1>
          <p className="page-description">System-generated purchase, production, and raw material requirements</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-primary">
            <Brain size={16} /> Generate Forecast
          </button>
          <button className="btn btn-secondary">Export Excel</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 'var(--space-8)' }}>
        <div className="kpi-card" style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <ShoppingCart size={20} style={{ color: '#3b82f6' }} />
            <div className="kpi-label" style={{ margin: 0 }}>Purchase Orders</div>
          </div>
          <div className="kpi-value">{purchaseRecommendations.length}</div>
          <div className="card-subtitle">Suggested PO items</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#a855f7' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <Factory size={20} style={{ color: '#a855f7' }} />
            <div className="kpi-label" style={{ margin: 0 }}>Production Orders</div>
          </div>
          <div className="kpi-value">{productionRecommendations.length}</div>
          <div className="card-subtitle">Suggested MO items</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#f59e0b' } as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <Package size={20} style={{ color: '#f59e0b' }} />
            <div className="kpi-label" style={{ margin: 0 }}>Raw Materials</div>
          </div>
          <div className="kpi-value">{rmRequirements.length}</div>
          <div className="card-subtitle">RM purchase items</div>
        </div>
      </div>

      {/* Purchase Recommendations */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div className="card-title">🛒 Purchase Order Recommendations (Goods)</div>
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', padding: '0 var(--space-4)' }}>
          Formula: Suggested Qty = Forecast + Safety Stock - On-Hand - Incoming Supply
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Product</th><th>Forecast</th><th>Safety</th><th>On-Hand</th><th>Incoming</th><th>Suggested PO</th><th>Risk</th><th>ETA</th>
            </tr>
          </thead>
          <tbody>
            {purchaseRecommendations.map((r, i) => (
              <tr key={i}>
                <td><span className="badge badge-info">{r.item}</span></td>
                <td style={{ color: 'var(--color-text-primary)' }}>{r.name}</td>
                <td>{r.forecast.toLocaleString()}</td>
                <td>{r.safety.toLocaleString()}</td>
                <td>{r.onhand.toLocaleString()}</td>
                <td>{r.incoming.toLocaleString()}</td>
                <td style={{ fontWeight: 700, color: 'var(--color-accent-hover)' }}>{r.suggested.toLocaleString()}</td>
                <td><RiskBadge risk={r.risk} /></td>
                <td style={{ fontSize: 'var(--font-size-xs)' }}>{r.eta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Production Recommendations */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div className="card-title">🏭 Production Order Recommendations (Finished Goods)</div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th><th>Product</th><th>Forecast</th><th>Safety</th><th>On-Hand</th><th>Incoming</th><th>Suggested MO</th><th>Risk</th><th>Planned</th>
            </tr>
          </thead>
          <tbody>
            {productionRecommendations.map((r, i) => (
              <tr key={i}>
                <td><span className="badge badge-info">{r.item}</span></td>
                <td style={{ color: 'var(--color-text-primary)' }}>{r.name}</td>
                <td>{r.forecast.toLocaleString()}</td>
                <td>{r.safety.toLocaleString()}</td>
                <td>{r.onhand.toLocaleString()}</td>
                <td>{r.incoming.toLocaleString()}</td>
                <td style={{ fontWeight: 700, color: 'var(--color-accent-hover)' }}>{r.suggested.toLocaleString()}</td>
                <td><RiskBadge risk={r.risk} /></td>
                <td style={{ fontSize: 'var(--font-size-xs)' }}>{r.planned}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Raw Material Requirements */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">📦 Raw Material Purchase Requirements (BOM Explosion)</div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>RM Code</th><th>Material</th><th>For FG</th><th>MO Qty</th><th>BOM Ratio</th><th>Required</th><th>On-Hand</th><th>To Purchase</th><th>Unit</th>
            </tr>
          </thead>
          <tbody>
            {rmRequirements.map((r, i) => (
              <tr key={i}>
                <td><span className="badge badge-warning">{r.item}</span></td>
                <td style={{ color: 'var(--color-text-primary)' }}>{r.name}</td>
                <td><span className="badge badge-info">{r.fg}</span></td>
                <td>{r.moQty.toLocaleString()}</td>
                <td>{r.bomQty}</td>
                <td>{r.required.toLocaleString()}</td>
                <td>{r.onhand.toLocaleString()}</td>
                <td style={{ fontWeight: 700, color: 'var(--color-accent-hover)' }}>{r.toPurchase.toLocaleString()}</td>
                <td>{r.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
