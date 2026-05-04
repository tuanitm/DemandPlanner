'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function DataInputLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = pathname.includes('/sales') ? 'Sales Entry' :
                pathname.includes('/inventory') ? 'Inventory' :
                pathname.includes('/orders') ? 'Orders' :
                pathname.includes('/import') ? 'Import Data' : 'Data Input';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <Header title="Data Input" />
        <main className="app-content">
          <div className="page-header">
            <div>
              <h1 className="page-title">{title}</h1>
              <p className="page-description">Manage transaction data and import records</p>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
