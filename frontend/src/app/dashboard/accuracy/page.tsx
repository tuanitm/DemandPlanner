'use client';

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceArea
} from 'recharts';
import { AlertTriangle } from 'lucide-react';

const accuracyData = [
  { name: 'SKU-001', fa: 92, revenue: 1870, zone: 'good' },
  { name: 'SKU-034', fa: 88, revenue: 1470, zone: 'good' },
  { name: 'SKU-012', fa: 45, revenue: 1040, zone: 'critical' },
  { name: 'SKU-078', fa: 72, revenue: 576, zone: 'watch' },
  { name: 'SKU-055', fa: 35, revenue: 952, zone: 'critical' },
  { name: 'SKU-089', fa: 95, revenue: 320, zone: 'good' },
  { name: 'SKU-023', fa: 60, revenue: 780, zone: 'watch' },
  { name: 'SKU-067', fa: 28, revenue: 650, zone: 'critical' },
  { name: 'SKU-045', fa: 85, revenue: 410, zone: 'good' },
  { name: 'SKU-091', fa: 78, revenue: 560, zone: 'watch' },
  { name: 'SKU-102', fa: 55, revenue: 1200, zone: 'critical' },
  { name: 'SKU-118', fa: 90, revenue: 290, zone: 'good' },
  { name: 'SKU-133', fa: 42, revenue: 380, zone: 'watch' },
  { name: 'SKU-145', fa: 68, revenue: 890, zone: 'watch' },
  { name: 'SKU-156', fa: 82, revenue: 720, zone: 'good' },
];

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#f1f5f9',
};

interface ScatterPayload {
  name: string;
  fa: number;
  revenue: number;
  zone: string;
}

const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ScatterPayload }> }) => {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div style={{ ...tooltipStyle, padding: '12px' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.name}</div>
        <div>FA%: <strong>{d.fa}%</strong></div>
        <div>Revenue: <strong>₫{d.revenue}M</strong></div>
      </div>
    );
  }
  return null;
};

export default function ForecastAccuracyPage() {
  const criticalItems = accuracyData.filter(d => d.fa < 50 && d.revenue > 500);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Forecast Accuracy Analysis</h1>
          <p className="page-description">FA% vs Revenue scatter analysis — identify high-impact, low-accuracy SKUs</p>
        </div>
      </div>

      {/* Alert for critical items */}
      {criticalItems.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          background: 'var(--color-danger-bg)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-6)',
          color: 'var(--color-danger)', fontSize: 'var(--font-size-sm)'
        }}>
          <AlertTriangle size={18} />
          <strong>{criticalItems.length} SKUs</strong> with high revenue but low forecast accuracy require immediate attention.
        </div>
      )}

      {/* Scatter Plot */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">FA% vs Revenue Priority Matrix</div>
            <div className="card-subtitle">Red zone: High Revenue + Low FA% — needs immediate action</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={450}>
          <ScatterChart margin={{ top: 20, right: 40, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              type="number" dataKey="fa" name="FA%" unit="%"
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              label={{ value: 'Forecast Accuracy (%)', position: 'insideBottom', offset: -10, style: { fill: '#64748b', fontSize: 12 } }}
            />
            <YAxis
              type="number" dataKey="revenue" name="Revenue" unit="M"
              tick={{ fontSize: 12, fill: '#94a3b8' }}
              label={{ value: 'Revenue (₫M)', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontSize: 12 } }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceArea x1={0} x2={50} y1={500} y2={2000} fill="rgba(239,68,68,0.08)" />
            <ReferenceLine x={50} stroke="rgba(239,68,68,0.4)" strokeDasharray="5 5" label={{ value: 'FA% Threshold', fill: '#ef4444', fontSize: 11 }} />
            <ReferenceLine y={500} stroke="rgba(245,158,11,0.4)" strokeDasharray="5 5" />
            <Scatter
              data={accuracyData}
              fill="#6366f1"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shape={(props: any) => {
                const color = props.payload.zone === 'critical' ? '#ef4444' :
                              props.payload.zone === 'watch' ? '#f59e0b' : '#22c55e';
                return <circle cx={props.cx} cy={props.cy} r={8} fill={color} fillOpacity={0.8} stroke={color} strokeWidth={2} strokeOpacity={0.3} />;
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Detail Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">SKU Forecast Accuracy Detail</div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>FA%</th>
              <th>Revenue (VND)</th>
              <th>Priority</th>
              <th>Action Needed</th>
            </tr>
          </thead>
          <tbody>
            {[...accuracyData]
              .sort((a, b) => a.fa - b.fa)
              .map((item, i) => (
                <tr key={i}>
                  <td><span className="badge badge-info">{item.name}</span></td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <div style={{
                        width: 60, height: 6, borderRadius: 3,
                        background: 'rgba(255,255,255,0.06)', overflow: 'hidden'
                      }}>
                        <div style={{
                          width: `${item.fa}%`, height: '100%', borderRadius: 3,
                          background: item.fa >= 70 ? '#22c55e' : item.fa >= 50 ? '#f59e0b' : '#ef4444'
                        }} />
                      </div>
                      <span style={{ fontWeight: 600 }}>{item.fa}%</span>
                    </div>
                  </td>
                  <td>₫ {item.revenue}M</td>
                  <td>
                    <span className={`badge ${item.zone === 'critical' ? 'badge-danger' : item.zone === 'watch' ? 'badge-warning' : 'badge-success'}`}>
                      {item.zone === 'critical' ? 'Critical' : item.zone === 'watch' ? 'Watch' : 'Good'}
                    </span>
                  </td>
                  <td style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>
                    {item.zone === 'critical' ? 'Review model & input data' : item.zone === 'watch' ? 'Monitor next cycle' : '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
