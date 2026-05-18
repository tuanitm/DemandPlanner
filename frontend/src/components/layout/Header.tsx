'use client';

import { Bell, User } from 'lucide-react';
import { useEffect, useState } from 'react';

interface HeaderProps {
  title?: string;
}

export default function Header({ title = 'Dashboard' }: HeaderProps) {
  const [user, setUser] = useState<{ full_name: string; role: string } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('dp_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  return (
    <header className="header">
      <h2 className="header-title">{title}</h2>
      <div className="header-actions">
        <button className="btn btn-secondary btn-sm" title="Notifications">
          <Bell size={16} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 32, height: 32, borderRadius: 'var(--radius-full)',
            background: 'var(--color-accent-glow)', display: 'flex',
            alignItems: 'center', justifyContent: 'center'
          }}>
            <User size={16} />
          </div>
          {user && (
            <div>
              <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>{user.full_name}</div>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)' }}>{user.role}</div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
