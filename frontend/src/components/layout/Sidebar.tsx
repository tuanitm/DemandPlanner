'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, BarChart3, TrendingUp, Brain,
  Package, Users, Warehouse, Settings, FileSpreadsheet,
  Database, ArrowRightLeft, LogOut, ChevronLeft, Edit3
} from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: 'Dashboards',
    items: [
      { label: 'Executive Summary', href: '/dashboard', icon: <LayoutDashboard size={20} /> },
      { label: 'Forecast Accuracy', href: '/dashboard/accuracy', icon: <BarChart3 size={20} /> },
      { label: 'Monthly Comparison', href: '/dashboard/monthly', icon: <TrendingUp size={20} /> },
      { label: 'AI Recommendations', href: '/dashboard/recommendations', icon: <Brain size={20} /> },
    ],
  },
  {
    title: 'Master Data',
    items: [
      { label: 'Products & SKUs', href: '/master-data/products', icon: <Package size={20} /> },
      { label: 'Business Partners', href: '/master-data/partners', icon: <Users size={20} /> },
      { label: 'Warehouses', href: '/master-data/warehouses', icon: <Warehouse size={20} /> },
      { label: 'Bill of Materials', href: '/master-data/bom', icon: <Database size={20} /> },
      { label: 'Exchange Rates', href: '/master-data/exchange-rates', icon: <ArrowRightLeft size={20} /> },
    ],
  },
  {
    title: 'Data Input',
    items: [
      { label: 'Sales Forecast', href: '/data-input/forecast', icon: <Edit3 size={20} /> },
      { label: 'Sales Entry', href: '/data-input/sales', icon: <TrendingUp size={20} /> },
      { label: 'Inventory', href: '/data-input/inventory', icon: <Package size={20} /> },
      { label: 'Orders (PO/MO)', href: '/data-input/orders', icon: <FileSpreadsheet size={20} /> },
      { label: 'Import Data', href: '/data-input/import', icon: <Database size={20} /> },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('dp_token');
    window.location.href = '/login';
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Brain size={20} /></div>
        {!collapsed && <h1>AI Demand Planner</h1>}
      </div>

      <nav className="sidebar-nav">
        {navigation.map((section) => (
          <div key={section.title} className="nav-section">
            {!collapsed && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item ${pathname === item.href ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--color-border)' }}>
        <button
          className="nav-item"
          onClick={() => setCollapsed(!collapsed)}
          style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer' }}
        >
          <ChevronLeft
            size={20}
            style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
        <button
          className="nav-item"
          onClick={handleLogout}
          style={{ width: '100%', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
        >
          <LogOut size={20} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
