'use client';

import { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyTitle?: string;
  emptyText?: string;
  rowKey?: (item: T) => string | number;
}

export default function DataTable<T extends object>({
  columns,
  data,
  loading = false,
  emptyTitle = 'No data found',
  emptyText = 'Try adjusting your filters or add new records.',
  rowKey,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ width: col.width }}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map(col => (
                  <td key={col.key}>
                    <div className="skeleton" style={{ height: 16, width: '70%', borderRadius: 4 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ width: col.width }}>{col.header}</th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="empty-state">
          <Inbox size={48} className="empty-state-icon" />
          <div className="empty-state-title">{emptyTitle}</div>
          <div className="empty-state-text">{emptyText}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ width: col.width }}>{col.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr key={rowKey ? rowKey(item) : index}>
                {columns.map(col => (
                  <td key={col.key}>
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? '')
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
