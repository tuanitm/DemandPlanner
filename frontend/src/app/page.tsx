'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('dp_token');
      if (token) {
        router.push('/dashboard');
        return;
      }

      // Auto-login with default admin credentials for seamless dev experience
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'admin123' }),
        });

        if (res.ok) {
          const data = await res.json();
          localStorage.setItem('dp_token', data.access_token);
          localStorage.setItem('dp_user', JSON.stringify(data.user));
        }
      } catch {
        // Backend may not be running, continue anyway
      }

      router.push('/dashboard');
    };

    init();
  }, [router]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--color-bg-primary)'
    }}>
      <div className="skeleton" style={{ width: 200, height: 40 }} />
    </div>
  );
}
