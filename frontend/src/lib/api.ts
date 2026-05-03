/**
 * API client library for frontend-backend communication.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('dp_token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => apiRequest<T>(endpoint),
  post: <T>(endpoint: string, body: unknown) => apiRequest<T>(endpoint, { method: 'POST', body }),
  put: <T>(endpoint: string, body: unknown) => apiRequest<T>(endpoint, { method: 'PUT', body }),
  delete: <T>(endpoint: string) => apiRequest<T>(endpoint, { method: 'DELETE' }),
};


// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: 'Admin' | 'Planner';
  is_active: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface MessageResponse {
  message: string;
  detail?: string;
}

// Master Data types
export interface PartnerGroup {
  id: number;
  channel: string;
  partner_grp_type: string;
  partner_grp_code: string;
  partner_grp_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Partner {
  id: number;
  partner_grp_code: string;
  partner_code: string;
  partner_name: string;
  partner_mst_code: string | null;
  partner_address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ProductHierarchy {
  id: number;
  business: string;
  brand: string;
  item_category_code: string;
  item_category_name: string;
  item_group_code: string;
  item_group_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Item {
  id: number;
  item_group_code: string;
  item_code: string;
  item_partner_code: string | null;
  item_name: string;
  item_for_name: string | null;
  uom: string;
  item_type: string;
  status: string;
  lead_time_days: number;
  created_at: string;
  updated_at: string;
}

export interface BOMEntry {
  id: number;
  finished_goods_item_code: string;
  raw_material_item_code: string;
  quantity: number;
  uom: string;
  created_at: string;
}

export interface Warehouse {
  id: number;
  warehouse_region: string;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_attribute: string | null;
  warehouse_status: string;
  created_at: string;
  updated_at: string;
}

export interface ExchangeRate {
  id: number;
  year: number;
  month: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  created_at: string;
}


// ──────────────────────────────────────────────
// Auth API
// ──────────────────────────────────────────────

export const authApi = {
  login: (username: string, password: string) =>
    api.post<{ access_token: string; user: User }>('/api/auth/login', { username, password }),
  me: () => api.get<User>('/api/auth/me'),
};


// ──────────────────────────────────────────────
// Master Data API
// ──────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `?${qs}` : '';
}

export const masterDataApi = {
  // Partner Groups
  partnerGroups: {
    list: (params: { page?: number; page_size?: number; search?: string } = {}) =>
      api.get<PaginatedResponse<PartnerGroup>>(`/api/master-data/partner-groups${buildQuery(params)}`),
    create: (data: Omit<PartnerGroup, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<PartnerGroup>('/api/master-data/partner-groups', data),
    update: (code: string, data: Partial<PartnerGroup>) =>
      api.put<PartnerGroup>(`/api/master-data/partner-groups/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/partner-groups/${code}`),
  },

  // Partners
  partners: {
    list: (params: { page?: number; page_size?: number; search?: string; group_code?: string } = {}) =>
      api.get<PaginatedResponse<Partner>>(`/api/master-data/partners${buildQuery(params)}`),
    create: (data: Omit<Partner, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Partner>('/api/master-data/partners', data),
  },

  // Product Hierarchy
  productHierarchy: {
    list: (params: { page?: number; page_size?: number; search?: string; business?: string; brand?: string } = {}) =>
      api.get<PaginatedResponse<ProductHierarchy>>(`/api/master-data/product-hierarchy${buildQuery(params)}`),
    create: (data: Omit<ProductHierarchy, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<ProductHierarchy>('/api/master-data/product-hierarchy', data),
  },

  // Items / SKUs
  items: {
    list: (params: { page?: number; page_size?: number; search?: string; item_type?: string; group_code?: string } = {}) =>
      api.get<PaginatedResponse<Item>>(`/api/master-data/items${buildQuery(params)}`),
    create: (data: Omit<Item, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Item>('/api/master-data/items', data),
  },

  // BOM
  bom: {
    list: (fgItemCode: string) =>
      api.get<BOMEntry[]>(`/api/master-data/bom/${fgItemCode}`),
    create: (data: Omit<BOMEntry, 'id' | 'created_at'>) =>
      api.post<BOMEntry>('/api/master-data/bom', data),
  },

  // Warehouses
  warehouses: {
    list: (params: { page?: number; page_size?: number; search?: string; region?: string } = {}) =>
      api.get<PaginatedResponse<Warehouse>>(`/api/master-data/warehouses${buildQuery(params)}`),
    create: (data: Omit<Warehouse, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Warehouse>('/api/master-data/warehouses', data),
  },

  // Exchange Rates
  exchangeRates: {
    list: (year?: number) =>
      api.get<ExchangeRate[]>(`/api/master-data/exchange-rates${year ? `?year=${year}` : ''}`),
    create: (data: Omit<ExchangeRate, 'id' | 'created_at'>) =>
      api.post<ExchangeRate>('/api/master-data/exchange-rates', data),
  },
};
