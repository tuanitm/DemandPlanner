'use client';

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const monthlyData = [
  { month: 'Jan', forecast: 38000, actual: 35200, fa: 92.6 },
  { month: 'Feb', forecast: 42000, actual: 40100, fa: 95.5 },
  { month: 'Mar', forecast: 45000, actual: 48200, fa: 93.4 },
  { month: 'Apr', forecast: 39000, actual: 36800, fa: 94.4 },
  { month: 'May', forecast: 51000, actual: 43500, fa: 85.3 },
  { month: 'Jun', forecast: 55000, actual: 52100, fa: 94.7 },
  { month: 'Jul', forecast: 48000, actual: 42300, fa: 88.1 },
  { month: 'Aug', forecast: 53000, actual: 56800, fa: 93.3 },
  { month: 'Sep', forecast: 47000, actual: 44200, fa: 94.0 },
  { month: 'Oct', forecast: 58000, actual: 52100, fa: 89.8 },
  { month: 'Nov', forecast: 62000, actual: 59800, fa: 96.5 },
  { month: 'Dec', forecast: 70000, actual: 68200, fa: 97.4 },
];

const tooltipStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  fontSize: '13px',
  color: '#f1f5f9',
};

export default function MonthlyComparisonPage() {
  const avgFA = (monthlyData.reduce((s, d) => s + d.fa, 0) / monthlyData.length).toFixed(1);
  const totalForecast = monthlyData.reduce((s, d) => s + d.forecast, 0);
  const totalActual = monthlyData.reduce((s, d) => s + d.actual, 0);
  const bias = (((totalForecast - totalActual) / totalActual) * 100).toFixed(1);

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Monthly Forecast vs Actual</h1>
          <p className="page-description">Year-over-year comparison to detect seasonality and forecast gaps</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="kpi-card" style={{ '--kpi-color': '#6366f1' } as React.CSSProperties}>
          <div className="kpi-label">Average FA%</div>
          <div className="kpi-value">{avgFA}%</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': '#22c55e' } as React.CSSProperties}>
          <div className="kpi-label">Total Actual Sales</div>
          <div className="kpi-value">{(totalActual / 1000).toFixed(0)}K</div>
        </div>
        <div className="kpi-card" style={{ '--kpi-color': parseFloat(bias) > 0 ? '#f59e0b' : '#22c55e' } as React.CSSProperties}>
          <div className="kpi-label">Forecast Bias</div>
          <div className="kpi-value">{bias}%</div>
          <div className="card-subtitle" style={{ marginTop: 4 }}>
            {parseFloat(bias) > 0 ? 'Over-forecasting' : 'Under-forecasting'}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <div>
            <div className="card-title">Forecast vs Actual by Month</div>
            <div className="card-subtitle">Bar: quantities | Line: Forecast Accuracy %</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={420}>
          <ComposedChart data={monthlyData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#94a3b8' }} />
            <YAxis yAxisId="right" orientation="right" domain={[70, 100]} tick={{ fontSize: 12, fill: '#94a3b8' }} unit="%" />
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="left" dataKey="forecast" name="Forecast" fill="#6366f1" radius={[4, 4, 0, 0]} fillOpacity={0.7} />
            <Bar yAxisId="left" dataKey="actual" name="Actual" fill="#22c55e" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="fa" name="FA%" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: '#f59e0b' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly Detail Table */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">Monthly Detail</div>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Forecast</th>
              <th>Actual</th>
              <th>Variance</th>
              <th>FA%</th>
              <th>Trend</th>
            </tr>
          </thead>
          <tbody>
            {monthlyData.map((d, i) => {
              const variance = d.actual - d.forecast;
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{d.month}</td>
                  <td>{d.forecast.toLocaleString()}</td>
                  <td>{d.actual.toLocaleString()}</td>
                  <td style={{ color: variance >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {variance >= 0 ? '+' : ''}{variance.toLocaleString()}
                  </td>
                  <td>
                    <span className={`badge ${d.fa >= 90 ? 'badge-success' : d.fa >= 80 ? 'badge-warning' : 'badge-danger'}`}>
                      {d.fa}%
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>
                    {variance > 0 ? 'Under-forecast' : variance < 0 ? 'Over-forecast' : 'Exact'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
