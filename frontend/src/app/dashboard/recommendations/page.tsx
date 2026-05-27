'use client';

import { useEffect, useState, useCallback } from 'react';
import { Brain, ShoppingCart, Factory, Package, Loader2, AlertCircle, RefreshCw, Download } from 'lucide-react';
import XLSX from 'xlsx-js-style';
import { forecastApi, RecommendationsSummary, RecommendationItem } from '@/lib/api';
import Modal from '@/components/ui/Modal';

function RiskBadge({ risk }: { risk: string }) {
  if (risk === 'Critical') return <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>Critical</span>;
  if (risk === 'High') return <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>High</span>;
  if (risk === 'Medium') return <span style={{ color: 'var(--color-info)', fontWeight: 600 }}>Medium</span>;
  if (risk === 'Low') return <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Low</span>;
  return <span>{risk}</span>;
}

function exportTableToExcel(
  items: RecommendationItem[],
  sheetName: string,
  fileName: string,
  columns: { header: string; key: keyof RecommendationItem | 'safety_stock'; width: number }[]
) {
  const exportRows = items.map(r => {
    const row: Record<string, string | number | null> = {};
    for (const col of columns) {
      if (col.key === 'safety_stock') {
        row[col.header] = r.safety_stock ?? 0;
      } else {
        row[col.header] = r[col.key] as string | number | null;
      }
    }
    return row;
  });

  const ws = XLSX.utils.json_to_sheet(exportRows);

  // Style header row and data rows
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const colKeys = columns.map(c => c.header);
  
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[addr]) continue;
      
      if (R === 0) {
        // Header
        ws[addr].s = {
          font: { bold: true, color: { rgb: 'FFFFFF' } },
          fill: { fgColor: { rgb: '1e293b' } },
          alignment: { horizontal: 'center' },
        };
      } else {
        const header = colKeys[C];
        const val = ws[addr].v;
        
        // Format numeric columns (qty, stock, incoming, onhand)
        if (typeof val === 'number') {
          ws[addr].t = 'n';
          ws[addr].z = '#,##0';
        }
        
        // Format Risk column colors to match UI
        if (header === 'Risk') {
          let color = '000000';
          let bgColor = 'FFFFFF';
          if (val === 'Critical') {
            color = 'ef4444'; bgColor = 'fef2f2'; // Danger
          } else if (val === 'High') {
            color = 'f59e0b'; bgColor = 'fffbeb'; // Warning
          } else if (val === 'Medium') {
            color = '3b82f6'; bgColor = 'eff6ff'; // Info
          } else if (val === 'Low') {
            color = '22c55e'; bgColor = 'f0fdf4'; // Success
          }
          
          ws[addr].s = {
            font: { color: { rgb: color }, bold: true },
            fill: { fgColor: { rgb: bgColor } },
            alignment: { horizontal: 'center' }
          };
        }
      }
    }
  }

  ws['!cols'] = columns.map(col => ({ wch: col.width }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default function RecommendationsPage() {
  const [data, setData] = useState<RecommendationsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genResult, setGenResult] = useState<string | null>(null);
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const nextMonth = new Date().getMonth() + 2; // 0-indexed, so +2 for next month
  
  const [targetYear, setTargetYear] = useState<number>(nextMonth > 12 ? currentYear + 1 : currentYear);
  const [targetMonth, setTargetMonth] = useState<number>(nextMonth > 12 ? 1 : nextMonth);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await forecastApi.recommendationsSummary();
      setData(result);
    } catch {
      // Any error (404, 500, network, no data) → show empty state
      setData(null);
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
      setIsGenerateModalOpen(false);
      setGenResult(null);
      setError(null);
      const result = await forecastApi.generate({ 
        horizon_months: 6,
        start_year: targetYear,
        start_month: targetMonth
      });
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

  // Export handlers
  const handleExportPO = useCallback(() => {
    exportTableToExcel(poItems, 'Purchase Orders', 'PO_Recommendations', [
      { header: 'SKU', key: 'item_code', width: 14 },
      { header: 'SKU Name', key: 'item_name', width: 30 },
      { header: 'Warehouse', key: 'warehouse_code', width: 14 },
      { header: 'Forecast', key: 'forecast_qty', width: 12 },
      { header: 'Safety Stock', key: 'safety_stock', width: 12 },
      { header: 'On-Hand', key: 'onhand', width: 12 },
      { header: 'Incoming', key: 'incoming', width: 12 },
      { header: 'Suggested PO', key: 'suggested_qty', width: 14 },
      { header: 'Risk', key: 'risk', width: 10 },
      { header: 'Notes', key: 'notes', width: 30 },
    ]);
  }, [poItems]);

  const handleExportMO = useCallback(() => {
    exportTableToExcel(moItems, 'Production Orders', 'MO_Recommendations', [
      { header: 'SKU', key: 'item_code', width: 14 },
      { header: 'SKU Name', key: 'item_name', width: 30 },
      { header: 'Warehouse', key: 'warehouse_code', width: 14 },
      { header: 'Forecast', key: 'forecast_qty', width: 12 },
      { header: 'Safety Stock', key: 'safety_stock', width: 12 },
      { header: 'On-Hand', key: 'onhand', width: 12 },
      { header: 'Incoming', key: 'incoming', width: 12 },
      { header: 'Suggested MO', key: 'suggested_qty', width: 14 },
      { header: 'Risk', key: 'risk', width: 10 },
      { header: 'Notes', key: 'notes', width: 30 },
    ]);
  }, [moItems]);

  const handleExportRM = useCallback(() => {
    exportTableToExcel(rmItems, 'Raw Materials', 'RM_Requirements', [
      { header: 'RM Code', key: 'item_code', width: 14 },
      { header: 'SKU Name', key: 'item_name', width: 30 },
      { header: 'Warehouse', key: 'warehouse_code', width: 14 },
      { header: 'Required Qty', key: 'forecast_qty', width: 14 },
      { header: 'On-Hand', key: 'onhand', width: 12 },
      { header: 'Incoming', key: 'incoming', width: 12 },
      { header: 'To Purchase', key: 'suggested_qty', width: 14 },
      { header: 'Risk', key: 'risk', width: 10 },
      { header: 'Source', key: 'notes', width: 30 },
    ]);
  }, [rmItems]);

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
            onClick={() => setIsGenerateModalOpen(true)}
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
          <button className="btn btn-primary" onClick={() => setIsGenerateModalOpen(true)} disabled={generating}>
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
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">🛒 Purchase Order Recommendations (Goods)</div>
              {poItems.length > 0 && (
                <button className="btn btn-secondary" onClick={handleExportPO} id="export-po-excel" style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}>
                  <Download size={14} /> Export Excel
                </button>
              )}
            </div>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-4)', padding: '0 var(--space-4)' }}>
              Formula: Suggested Qty = Forecast + Safety Stock - On-Hand - Incoming Supply
            </div>
            {poItems.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th><th>SKU Name</th><th>Warehouse</th><th>Forecast</th><th>Safety</th><th>On-Hand</th><th>Incoming</th><th>Suggested PO</th><th>Risk</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {poItems.map((r: RecommendationItem, i: number) => (
                    <tr key={i}>
                      <td>{r.item_code}</td>
                      <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{r.item_name}</td>
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
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                <ShoppingCart size={28} style={{ marginBottom: 'var(--space-2)', opacity: 0.5, display: 'inline-block' }} />
                <p style={{ fontSize: 'var(--font-size-sm)' }}>No purchase order recommendations for Goods-type items. Items with type &quot;Goods&quot; or &quot;Raw Material&quot; will appear here.</p>
              </div>
            )}
          </div>

          {/* Production Order Recommendations */}
          <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">🏭 Production Order Recommendations (Finished Goods)</div>
              {moItems.length > 0 && (
                <button className="btn btn-secondary" onClick={handleExportMO} id="export-mo-excel" style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}>
                  <Download size={14} /> Export Excel
                </button>
              )}
            </div>
            {moItems.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>SKU</th><th>SKU Name</th><th>Warehouse</th><th>Forecast</th><th>Safety</th><th>On-Hand</th><th>Incoming</th><th>Suggested MO</th><th>Risk</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {moItems.map((r: RecommendationItem, i: number) => (
                    <tr key={i}>
                      <td>{r.item_code}</td>
                      <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{r.item_name}</td>
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
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                <Factory size={28} style={{ marginBottom: 'var(--space-2)', opacity: 0.5, display: 'inline-block' }} />
                <p style={{ fontSize: 'var(--font-size-sm)' }}>No production order recommendations. Items with type &quot;Finished Goods&quot; will appear here.</p>
              </div>
            )}
          </div>

          {/* Raw Material Requirements */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="card-title">📦 Raw Material Purchase Requirements (BOM Explosion)</div>
              {rmItems.length > 0 && (
                <button className="btn btn-secondary" onClick={handleExportRM} id="export-rm-excel" style={{ fontSize: 'var(--font-size-xs)', padding: '6px 12px' }}>
                  <Download size={14} /> Export Excel
                </button>
              )}
            </div>
            {rmItems.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>RM Code</th><th>SKU Name</th><th>Warehouse</th><th>Required Qty</th><th>On-Hand</th><th>Incoming</th><th>To Purchase</th><th>Risk</th><th>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {rmItems.map((r: RecommendationItem, i: number) => (
                    <tr key={i}>
                      <td>{r.item_code}</td>
                      <td style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{r.item_name}</td>
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
            ) : (
              <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>
                <Package size={28} style={{ marginBottom: 'var(--space-2)', opacity: 0.5, display: 'inline-block' }} />
                <p style={{ fontSize: 'var(--font-size-sm)' }}>No raw material requirements. BOM explosion results for Finished Goods production will appear here.</p>
              </div>
            )}
          </div>
        </>
      )}

      <Modal isOpen={isGenerateModalOpen} onClose={() => setIsGenerateModalOpen(false)} title="Generate AI Forecast">
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <p style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-secondary)' }}>
            Select the Target Month and Year from which the forecast should begin. The AI engine will compute a 6-month forecast starting from this date.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label">Target Year</label>
              <select className="form-input" value={targetYear} onChange={(e) => setTargetYear(Number(e.target.value))}>
                <option value={currentYear - 1}>{currentYear - 1}</option>
                <option value={currentYear}>{currentYear}</option>
                <option value={currentYear + 1}>{currentYear + 1}</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Target Month</label>
              <select className="form-input" value={targetMonth} onChange={(e) => setTargetMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(2000, m - 1, 1).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
          <button className="btn btn-secondary" onClick={() => setIsGenerateModalOpen(false)}>Cancel</button>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 size={16} className="spin" /> : <Brain size={16} />}
            Run Forecast
          </button>
        </div>
      </Modal>

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
