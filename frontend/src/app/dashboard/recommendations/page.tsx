'use client';

import { useEffect, useState, useCallback } from 'react';
import { Brain, ShoppingCart, Factory, Package, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { forecastApi, RecommendationsSummary, RecommendationItem } from '@/lib/api';

function RiskBadge({ risk }: { risk: string }) {
  const cls =
    risk === 'Critical' ? 'badge-danger' :
    risk === 'High' ? 'badge-warning' :
    risk === 'Medium' ? 'badge-info' :
    'badge-success';
  return <span className={`badge ${cls}`}>{risk}</span>;
}

export default function RecommendationsPage() {
  const [data, setData] = useState<RecommendationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await forecastApi.recommendationsSummary();
      setData(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load recommendations';
      // If no data yet, show a friendly message
      if (msg.includes('404') || msg.includes('500')) {
        setData(null);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setGenResult(null);
      setError(null);
      const result = await forecastApi.generate({ horizon_months: 6 });
      const fc = result.forecast;
      const sp = result.supply;
      setGenResult(
        `✅ ${fc?.combinations ?? 0} SKU-warehouse combinations processed. ` +
        `${fc?.forecast_count ?? 0} forecasts, ${sp?.count ?? 0} recommendations generated.`
      );
      // Refresh data
      await fetchData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Forecast generation failed';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  const poItems = data?.purchase_orders?.items ?? [];
  const moItems = data?.production_orders?.items ?? [];
  const rmItems = data?.rm_purchases?.items ?? [];
  const risk = data?.risk_breakdown ?? { critical: 0, high: 0, medium: 0, low: 0 };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Forecast Recommendations</h1>
          <p className="page-description">System-generated purchase, production, and raw material requirements</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating}
            id="btn-generate-forecast"
          >
            {generating ? (
              <><Loader2 size={16} className="spin" /> Generating...</>
            ) : (
              <><Brain size={16} /> Generate Forecast</>
            )}
          </button>
          <button className="btn btn-secondary" onClick={fetchData} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 'var(--radius-md)', color: '#ef4444',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        }}>
          <AlertCircle size={16} /> {error}
        </div>
      )}
      {genResult && (
        <div style={{
          padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)',
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 'var(--radius-md)', color: '#22c55e',
        }}>
          {genResult}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--space-16)', color: 'var(--color-text-muted)' }}>
          <Loader2 size={32} className="spin" />
        </div>
      ) : !data || data.total === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <Brain size={48} style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', display: 'inline-block' }} />
          <h3 style={{ color: 'var(--color-text-primary)', marginBottom: 'var(--space-2)' }}>No Recommendations Yet</h3>
          <p style={{ color: 'var(--color-text-muted)', marginBottom: 'var(--space-6)' }}>
            Click &quot;Generate Forecast&quot; to run the AI engine and produce supply recommendations.
          </p>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            <Brain size={16} /> Generate Forecast Now
          </button>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 'var(--space-8)' }}>
            <div className="kpi-card" style={{ '--kpi-color': '#3b82f6' } as React.CSSProperties}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <ShoppingCart size={20} style={{ color: '#3b82f6' }} />
                <div className="kpi-label" style={{ margin: 0 }}>Purchase Orders</div>
              </div>
              <div className="kpi-value">{data.purchase_orders.count}</div>
              <div className="card-subtitle">Total qty: {data.purchase_orders.total_qty.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': '#a855f7' } as React.CSSProperties}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <Factory size={20} style={{ color: '#a855f7' }} />
                <div className="kpi-label" style={{ margin: 0 }}>Production Orders</div>
              </div>
              <div className="kpi-value">{data.production_orders.count}</div>
              <div className="card-subtitle">Total qty: {data.production_orders.total_qty.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': '#f59e0b' } as React.CSSProperties}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <Package size={20} style={{ color: '#f59e0b' }} />
                <div className="kpi-label" style={{ margin: 0 }}>Raw Materials</div>
              </div>
              <div className="kpi-value">{data.rm_purchases.count}</div>
              <div className="card-subtitle">Total qty: {data.rm_purchases.total_qty.toLocaleString()}</div>
            </div>
            <div className="kpi-card" style={{ '--kpi-color': '#ef4444' } as React.CSSProperties}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <AlertCircle size={20} style={{ color: '#ef4444' }} />
                <div className="kpi-label" style={{ margin: 0 }}>Risk Breakdown</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <span className="badge badge-danger">{risk.critical} Critical</span>
                <span className="badge badge-warning">{risk.high} High</span>
                <span className="badge badge-info">{risk.medium} Medium</span>
                <span className="badge badge-success">{risk.low} Low</span>
              </div>
            </div>
          </div>

          {/* Purchase Order Recommendations */}
          {poItems.length > 0 && (
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
                    <th>SKU</th><th>Warehouse</th><th>Forecast</th><th>Safety</th><th>On-Hand</th><th>Incoming</th><th>Suggested PO</th><th>Risk</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((r: RecommendationItem, i: number) => (
                    <tr key={i}>
                      <td><span className="badge badge-info">{r.item_code}</span></td>
                      <td>{r.warehouse_code}</td>
                      <td>{r.forecast_qty.toLocaleString()}</td>
                      <td>{(r.safety_stock ?? 0).toLocaleString()}</td>
                      <td>{r.onhand.toLocaleString()}</td>
                      <td>{r.incoming.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--color-accent-hover)' }}>{r.suggested_qty.toLocaleString()}</td>
                      <td><RiskBadge risk={r.risk} /></td>
                      <td style={{ fontSize: 'var(--font-size-xs)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Production Order Recommendations */}
          {moItems.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
              <div className="card-header">
                <div className="card-title">🏭 Production Order Recommendations (Finished Goods)</div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th><th>Warehouse</th><th>Forecast</th><th>Safety</th><th>On-Hand</th><th>Incoming</th><th>Suggested MO</th><th>Risk</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {moItems.map((r: RecommendationItem, i: number) => (
                    <tr key={i}>
                      <td><span className="badge badge-info">{r.item_code}</span></td>
                      <td>{r.warehouse_code}</td>
                      <td>{r.forecast_qty.toLocaleString()}</td>
                      <td>{(r.safety_stock ?? 0).toLocaleString()}</td>
                      <td>{r.onhand.toLocaleString()}</td>
                      <td>{r.incoming.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--color-accent-hover)' }}>{r.suggested_qty.toLocaleString()}</td>
                      <td><RiskBadge risk={r.risk} /></td>
                      <td style={{ fontSize: 'var(--font-size-xs)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Raw Material Requirements */}
          {rmItems.length > 0 && (
            <div className="card">
              <div className="card-header">
                <div className="card-title">📦 Raw Material Purchase Requirements (BOM Explosion)</div>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>RM Code</th><th>Warehouse</th><th>Required Qty</th><th>On-Hand</th><th>Incoming</th><th>To Purchase</th><th>Risk</th><th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rmItems.map((r: RecommendationItem, i: number) => (
                    <tr key={i}>
                      <td><span className="badge badge-warning">{r.item_code}</span></td>
                      <td>{r.warehouse_code}</td>
                      <td>{r.forecast_qty.toLocaleString()}</td>
                      <td>{r.onhand.toLocaleString()}</td>
                      <td>{r.incoming.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: 'var(--color-accent-hover)' }}>{r.suggested_qty.toLocaleString()}</td>
                      <td><RiskBadge risk={r.risk} /></td>
                      <td style={{ fontSize: 'var(--font-size-xs)', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <style jsx>{`
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
