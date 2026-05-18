import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <Header title="Dashboard" />
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}
