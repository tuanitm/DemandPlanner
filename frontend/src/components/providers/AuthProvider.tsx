'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface AuthContextType {
  token: string | null;
  ready: boolean;
}

const AuthContext = createContext<AuthContextType>({ token: null, ready: false });

export function useAuth() {
  return useContext(AuthContext);
}
const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/';

async function loginAsAdmin(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' }),
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem('dp_token', data.access_token);
      localStorage.setItem('dp_user', JSON.stringify(data.user));
      return data.access_token;
    }
  } catch {
    // Backend may not be running
  }
  return null;
}

async function validateToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Check for existing token and validate it
      const existing = localStorage.getItem('dp_token');
      if (existing) {
        const valid = await validateToken(existing);
        if (valid) {
          setToken(existing);
          setReady(true);
          return;
        }
        // Token expired/invalid, clear it and re-login
        localStorage.removeItem('dp_token');
        localStorage.removeItem('dp_user');
      }

      // Auto-login with default admin credentials
      const newToken = await loginAsAdmin();
      if (newToken) {
        setToken(newToken);
      }

      setReady(true);
    };

    init();
  }, []);

  if (!ready) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', background: 'var(--color-bg-primary)',
      }}>
        <div className="loading-spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ token, ready }}>
      {children}
    </AuthContext.Provider>
  );
}
