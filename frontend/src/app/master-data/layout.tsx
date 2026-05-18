import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

export default function MasterDataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <Header title="Master Data" />
        <main className="app-content">
          {children}
        </main>
      </div>
    </div>
  );
}
