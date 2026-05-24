'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const API_BASE = typeof window !== 'undefined' && (!process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_URL.includes('localhost')) ? `${window.location.protocol}//${window.location.hostname}:8000` : (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000');
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Login failed' }));
        throw new Error(data.detail || 'Invalid credentials');
      }

      const data = await res.json();
      localStorage.setItem('dp_token', data.access_token);
      localStorage.setItem('dp_user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card animate-in">
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
          <div style={{
            width: 56, height: 56, margin: '0 auto var(--space-4)',
            background: 'linear-gradient(135deg, var(--color-accent), #a855f7)',
            borderRadius: 'var(--radius-lg)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 'var(--font-size-2xl)', fontWeight: 800,
            color: 'white'
          }}>
            <Brain size={32} />
          </div>
          <h2>AI Demand Planner</h2>
          <p className="subtitle">AI-Powered Demand Forecasting System</p>
        </div>

        <form onSubmit={handleLogin}>
          {error && (
            <div style={{
              padding: 'var(--space-3) var(--space-4)',
              background: 'var(--color-danger-bg)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--space-5)'
            }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="username">Username</label>
            <input
              id="username"
              className="form-input"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              className="form-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 'var(--space-4)' }}
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <p style={{
            textAlign: 'center', marginTop: 'var(--space-6)',
            fontSize: 'var(--font-size-xs)', color: 'var(--color-text-muted)'
          }}>
            Default: admin / admin123
          </p>
        </form>
      </div>
    </div>
  );
}
