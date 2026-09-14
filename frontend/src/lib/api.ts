/**
 * API client library for frontend-backend communication.
*/

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/';

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
  item_attribute: string | null;
  status: string;
  import_lead_time_days: number;
  production_lead_time_days?: number;
  shelf_life_days?: number;
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
  created_at?: string;
  updated_at?: string;
}

export interface Channel {
  id: number;
  channel_code: string;
  channel_name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface Brand {
  id: number;
  brand_code: string;
  brand_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Region {
  id: number;
  region_code: string;
  region_name: string;
  status: string;
  created_at?: string;
  updated_at?: string;
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

function buildQuery(params: Record<string, string | number | undefined | null | string[] | number[]>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      if (Array.isArray(v)) {
        return v.map(val => `${encodeURIComponent(k)}=${encodeURIComponent(String(val))}`).join('&');
      }
      return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
    })
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
    update: (code: string, data: Partial<Partner>) =>
      api.put<Partner>(`/api/master-data/partners/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/partners/${code}`),
  },

  // Product Hierarchy
  productHierarchy: {
    list: (params: { page?: number; page_size?: number; search?: string; business?: string; brand?: string } = {}) =>
      api.get<PaginatedResponse<ProductHierarchy>>(`/api/master-data/product-hierarchy${buildQuery(params)}`),
    create: (data: Omit<ProductHierarchy, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<ProductHierarchy>('/api/master-data/product-hierarchy', data),
    update: (code: string, data: Partial<ProductHierarchy>) =>
      api.put<ProductHierarchy>(`/api/master-data/product-hierarchy/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/product-hierarchy/${code}`),
  },

  // Items / SKUs
  items: {
    list: (params: { page?: number; page_size?: number; search?: string; item_type?: string; group_code?: string } = {}) =>
      api.get<PaginatedResponse<Item>>(`/api/master-data/items${buildQuery(params)}`),
    create: (data: Omit<Item, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Item>('/api/master-data/items', data),
    update: (code: string, data: Partial<Item>) =>
      api.put<Item>(`/api/master-data/items/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/items/${code}`),
  },

  // BOM
  bom: {
    list: (fgItemCode: string) =>
      api.get<BOMEntry[]>(`/api/master-data/bom/${fgItemCode}`),
    create: (data: Omit<BOMEntry, 'id' | 'created_at'>) =>
      api.post<BOMEntry>('/api/master-data/bom', data),
    bulkCreate: (data: Omit<BOMEntry, 'id' | 'created_at'>[]) =>
      api.post<BOMEntry[]>('/api/master-data/bom/bulk', data),
  },

  // Warehouses
  warehouses: {
    list: (params: { page?: number; page_size?: number; search?: string; region?: string } = {}) =>
      api.get<PaginatedResponse<Warehouse>>(`/api/master-data/warehouses${buildQuery(params)}`),
    create: (data: Omit<Warehouse, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Warehouse>('/api/master-data/warehouses', data),
    update: (code: string, data: Omit<Warehouse, 'id' | 'created_at' | 'updated_at'>) =>
      api.put<Warehouse>(`/api/master-data/warehouses/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/warehouses/${code}`),
  },

  // Channels
  channels: {
    list: (params: { page?: number; page_size?: number; search?: string } = {}) =>
      api.get<PaginatedResponse<Channel>>(`/api/master-data/channels${buildQuery(params)}`),
    create: (data: Omit<Channel, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Channel>('/api/master-data/channels', data),
    update: (code: string, data: Omit<Channel, 'id' | 'created_at' | 'updated_at'>) =>
      api.put<Channel>(`/api/master-data/channels/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/channels/${code}`),
  },

  // Brands
  brands: {
    list: (params: { page?: number; page_size?: number; search?: string } = {}) =>
      api.get<PaginatedResponse<Brand>>(`/api/master-data/brands${buildQuery(params)}`),
    create: (data: Omit<Brand, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Brand>('/api/master-data/brands', data),
    update: (code: string, data: Omit<Brand, 'id' | 'created_at' | 'updated_at'>) =>
      api.put<Brand>(`/api/master-data/brands/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/brands/${code}`),
  },

  // Regions
  regions: {
    list: (params: { page?: number; page_size?: number; search?: string } = {}) =>
      api.get<PaginatedResponse<Region>>(`/api/master-data/regions${buildQuery(params)}`),
    create: (data: Omit<Region, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<Region>('/api/master-data/regions', data),
    update: (code: string, data: Omit<Region, 'id' | 'created_at' | 'updated_at'>) =>
      api.put<Region>(`/api/master-data/regions/${code}`, data),
    delete: (code: string) =>
      api.delete<MessageResponse>(`/api/master-data/regions/${code}`),
  },

  // Exchange Rates
  exchangeRates: {
    list: (year?: number) =>
      api.get<ExchangeRate[]>(`/api/master-data/exchange-rates${year ? `?year=${year}` : ''}`),
    create: (data: Omit<ExchangeRate, 'id' | 'created_at'>) =>
      api.post<ExchangeRate>('/api/master-data/exchange-rates', data),
  },
};


// ──────────────────────────────────────────────
// Transaction Types
// ──────────────────────────────────────────────

export interface ActualSales {
  id: number;
  item_code: string;
  warehouse_code: string;
  partner_code: string | null;
  year: number;
  month: number;
  quantity: number;
  amount: number;
  source: string;
  created_at: string;
  // Enriched fields from JOINs
  item_name?: string;
  item_uom?: string;
  brand?: string;
  item_group_name?: string;
  partner_name?: string;
  channel?: string;
  region?: string;
}

export interface InventoryOnhand {
  id: number;
  item_code: string;
  warehouse_code: string;
  quantity: number;
  unit_cost: number | null;
  mfg_date: string | null;
  expiry_date: string | null;
  batch_number: string | null;
  lot_status: string | null;
  partner_code: string | null;
  last_updated: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  item_code: string;
  product_name?: string;
  warehouse_code: string | null;
  partner_code: string | null;
  quantity: number;
  currency: string;
  unit_price: number;
  eta: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ProductionOrder {
  id: number;
  mo_number: string;
  item_code: string;
  warehouse_code: string;
  quantity: number;
  completed_qty: number;
  planned_date: string | null;
  status: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface StockInTransaction {
  id: number;
  trans_type: string;
  item_code: string;
  warehouse_code: string;
  quantity: number;
  reference_number: string | null;
  trans_date: string;
  source: string;
  created_at: string;
}

export interface DemandAdhoc {
  id: number;
  item_code: string;
  warehouse_code: string;
  quantity: number;
  demand_source: string | null;
  demand_date: string;
  notes: string | null;
  created_at: string;
}


// ──────────────────────────────────────────────
// Transaction API
// ──────────────────────────────────────────────

export const transactionApi = {
  sales: {
    list: (params: { page?: number; page_size?: number; search?: string; item_code?: string; warehouse_code?: string[]; year?: number; month?: number[]; brand?: string[]; item_group?: string[]; channel?: string[]; region?: string[] } = {}) =>
      api.get<PaginatedResponse<ActualSales>>(`/api/transactions/sales${buildQuery(params)}`),
    create: (data: Omit<ActualSales, 'id' | 'created_at'>) =>
      api.post<ActualSales>('/api/transactions/sales', data),
    bulkCreate: (data: Omit<ActualSales, 'id' | 'created_at'>[]) =>
      api.post<{ message: string; count: number }>('/api/transactions/sales/bulk', data),
    delete: (id: number) =>
      api.delete<MessageResponse>(`/api/transactions/sales/${id}`),
  },

  inventory: {
    list: (params: { page?: number; page_size?: number; search?: string; item_code?: string; warehouse_code?: string } = {}) =>
      api.get<PaginatedResponse<InventoryOnhand>>(`/api/transactions/inventory${buildQuery(params)}`),
    create: (data: Omit<InventoryOnhand, 'id' | 'last_updated'>) =>
      api.post<InventoryOnhand>('/api/transactions/inventory', data),
    update: (id: number, data: Omit<InventoryOnhand, 'id' | 'last_updated'>) =>
      api.put<InventoryOnhand>(`/api/transactions/inventory/${id}`, data),
    delete: (id: number) =>
      api.delete<MessageResponse>(`/api/transactions/inventory/${id}`),
  },

  purchaseOrders: {
    list: (params: { page?: number; page_size?: number; search?: string; item_code?: string; status?: string } = {}) =>
      api.get<PaginatedResponse<PurchaseOrder>>(`/api/transactions/purchase-orders${buildQuery(params)}`),
    create: (data: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<PurchaseOrder>('/api/transactions/purchase-orders', data),
    update: (id: number, data: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at'>) =>
      api.put<PurchaseOrder>(`/api/transactions/purchase-orders/${id}`, data),
    delete: (id: number) =>
      api.delete<MessageResponse>(`/api/transactions/purchase-orders/${id}`),
  },

  productionOrders: {
    list: (params: { page?: number; page_size?: number; search?: string; item_code?: string; status?: string } = {}) =>
      api.get<PaginatedResponse<ProductionOrder>>(`/api/transactions/production-orders${buildQuery(params)}`),
    create: (data: Omit<ProductionOrder, 'id' | 'created_at' | 'updated_at'>) =>
      api.post<ProductionOrder>('/api/transactions/production-orders', data),
    update: (id: number, data: Omit<ProductionOrder, 'id' | 'created_at' | 'updated_at'>) =>
      api.put<ProductionOrder>(`/api/transactions/production-orders/${id}`, data),
    delete: (id: number) =>
      api.delete<MessageResponse>(`/api/transactions/production-orders/${id}`),
  },

  stockIn: {
    list: (params: { page?: number; page_size?: number; search?: string; item_code?: string; trans_type?: string } = {}) =>
      api.get<PaginatedResponse<StockInTransaction>>(`/api/transactions/stock-in${buildQuery(params)}`),
    create: (data: Omit<StockInTransaction, 'id' | 'created_at'>) =>
      api.post<StockInTransaction>('/api/transactions/stock-in', data),
    delete: (id: number) =>
      api.delete<MessageResponse>(`/api/transactions/stock-in/${id}`),
  },

  adhocDemand: {
    list: (params: { page?: number; page_size?: number; search?: string; item_code?: string } = {}) =>
      api.get<PaginatedResponse<DemandAdhoc>>(`/api/transactions/adhoc-demand${buildQuery(params)}`),
    create: (data: Omit<DemandAdhoc, 'id' | 'created_at'>) =>
      api.post<DemandAdhoc>('/api/transactions/adhoc-demand', data),
    update: (id: number, data: Partial<DemandAdhoc>) =>
      api.put<DemandAdhoc>(`/api/transactions/adhoc-demand/${id}`, data),
    delete: (id: number) =>
      api.delete<MessageResponse>(`/api/transactions/adhoc-demand/${id}`),
  },
};


// ──────────────────────────────────────────────
// Forecast Types
// ──────────────────────────────────────────────

export interface ForecastResult {
  id: number;
  item_code: string;
  warehouse_code: string;
  year: number;
  month: number;
  model_type: string;
  forecast_qty: number;
  confidence_lower: number | null;
  confidence_upper: number | null;
  adjusted_qty: number | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  adjustment_reason: string | null;
  created_at: string;
}

export interface RecommendationItem {
  item_code: string;
  item_name: string;
  warehouse_code: string;
  forecast_qty: number;
  safety_stock?: number;
  onhand: number;
  incoming: number;
  suggested_qty: number;
  risk: string;
  notes: string | null;
}

export interface RecommendationsSummary {
  total: number;
  purchase_orders: {
    count: number;
    total_qty: number;
    items: RecommendationItem[];
  };
  production_orders: {
    count: number;
    total_qty: number;
    items: RecommendationItem[];
  };
  rm_purchases: {
    count: number;
    total_qty: number;
    items: RecommendationItem[];
  };
  risk_breakdown: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export interface ForecastGenerateResponse {
  forecast?: {
    message: string;
    combinations: number;
    forecast_count: number;
    model_detail_count: number;
    accuracy_records: number;
    horizon_months: number;
    model_weights: Record<string, Record<string, number>>;
  };
  supply?: {
    message: string;
    count: number;
    purchase_orders: number;
    production_orders: number;
    rm_purchases: number;
  };
  // async mode
  task_id?: string;
  status?: string;
  message?: string;
}

export interface AccuracySummaryItem {
  item_code: string;
  item_name: string;
  brand: string;
  product_group: string;
  uom: string;
  fa_percent: number;
  forecast_qty: number;
  actual_qty: number;
  variance: number;
  zone: string;
  periods: number;
}

export interface AccuracySummary {
  items: AccuracySummaryItem[];
  overall_fa: number;
  total_skus: number;
  critical_count: number;
  watch_count: number;
  good_count: number;
}

export interface MonthlyComparison {
  data: Array<{
    year: number;
    month: number;
    month_name: string;
    forecast: number;
    actual: number;
    fa: number;
  }>;
}


// ──────────────────────────────────────────────
// Forecast Edit Types
// ──────────────────────────────────────────────

export interface ForecastEditRequest {
  forecast_id: number;
  adjusted_qty: number;
  adjustment_reason?: string;
}

export interface ForecastBulkEditRequest {
  edits: ForecastEditRequest[];
}

export interface ForecastAuditLogEntry {
  id: number;
  forecast_id: number;
  item_code: string;
  warehouse_code: string;
  year: number;
  month: number;
  original_qty: number;
  previous_adjusted_qty: number | null;
  new_adjusted_qty: number;
  adjusted_by: string;
  adjustment_reason: string | null;
  created_at: string;
}

export interface ForecastEditSummary {
  total_forecasts: number;
  adjusted_forecasts: number;
  unadjusted_forecasts: number;
  total_audit_entries: number;
  recent_edits: ForecastAuditLogEntry[];
}


// ──────────────────────────────────────────────
// Forecast API
// ──────────────────────────────────────────────

export const forecastApi = {
  generate: (params: { item_codes?: string[]; warehouse_codes?: string[]; horizon_months?: number; start_year?: number; start_month?: number } = {}) =>
    api.post<ForecastGenerateResponse>('/api/forecast/generate', params),

  generateAsync: (params: { item_codes?: string[]; warehouse_codes?: string[]; horizon_months?: number; start_year?: number; start_month?: number } = {}) =>
    api.post<{ message: string; task_id: string; status: string }>('/api/forecast/generate?async_mode=true', params),

  taskStatus: (taskId: string) =>
    api.get<{ task_id: string; status: string; result?: unknown; error?: string }>(`/api/forecast/task/${taskId}`),

  results: (params: { page?: number; page_size?: number; item_code?: string; warehouse_code?: string; model_type?: string; year?: number; month?: number } = {}) =>
    api.get<PaginatedResponse<ForecastResult>>(`/api/forecast/results${buildQuery(params)}`),

  accuracy: (params: { page?: number; page_size?: number; item_code?: string; warehouse_code?: string } = {}) =>
    api.get<PaginatedResponse<unknown>>(`/api/forecast/accuracy${buildQuery(params)}`),

  accuracySummary: (params: { year?: number; month?: number[]; brand?: string[]; product_group?: string[]; search?: string } = {}) =>
    api.get<AccuracySummary>(`/api/forecast/accuracy/summary${buildQuery(params)}`),

  monthly: (year?: number) =>
    api.get<MonthlyComparison>(`/api/forecast/monthly${year ? `?year=${year}` : ''}`),

  recommendations: (params: { page?: number; page_size?: number; recommendation_type?: string; shortage_risk?: string; item_code?: string } = {}) =>
    api.get<PaginatedResponse<unknown>>(`/api/forecast/recommendations${buildQuery(params)}`),

  recommendationsSummary: () =>
    api.get<RecommendationsSummary>('/api/forecast/recommendations/summary'),

  // Forecast Editing
  editForecast: (data: ForecastEditRequest) =>
    api.put<{ message: string; forecast: ForecastResult }>('/api/forecast/edit', data),

  bulkEditForecasts: (data: ForecastBulkEditRequest) =>
    api.put<{ message: string; updated_ids: number[]; count: number }>('/api/forecast/edit/bulk', data),

  revertForecast: (forecast_id: number) =>
    api.put<{ message: string; forecast: ForecastResult }>('/api/forecast/revert', { forecast_id }),

  bulkRevertForecasts: (forecast_ids: number[]) =>
    api.put<{ message: string; reverted_ids: number[]; count: number }>('/api/forecast/revert/bulk', { forecast_ids }),

  auditLog: (params: { page?: number; page_size?: number; item_code?: string; forecast_id?: number } = {}) =>
    api.get<PaginatedResponse<ForecastAuditLogEntry>>(`/api/forecast/audit-log${buildQuery(params)}`),

  editSummary: () =>
    api.get<ForecastEditSummary>('/api/forecast/edit/summary'),

  // Workflow
  workflow: (params: { item_code: string; warehouse_code?: string }) =>
    api.get<WorkflowResponse>(`/api/forecast/workflow${buildQuery(params)}`),

  workflowItems: (search?: string) =>
    api.get<{ items: Array<{ item_code: string; forecast_count: number }> }>(`/api/forecast/workflow/items${buildQuery({ search })}`),
};

// ──────────────────────────────────────────────
// Dashboard Types & API
// ──────────────────────────────────────────────

export interface DashboardKPI {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  color: string;
}

export interface DashboardSalesPlan {
  category: string;
  plan: number;
  actual: number;
}

export interface DashboardInventoryStructure {
  name: string;
  value: number;
  color: string;
}

export interface DashboardSummaryResponse {
  kpis: DashboardKPI[];
  salesPlanData: DashboardSalesPlan[];
  inventoryStructure: DashboardInventoryStructure[];
  topSellingSKUs: string[][];
  topInventorySKUs: string[][];
}

export interface MonthlyComparisonRow {
  brand: string;
  product_group: string;
  item_code: string;
  item_name: string;
  warehouse_code: string;
  warehouse_name: string;
  warehouse_region: string;
  month_name: string;
  forecast: number;
  actual: number;
}

export interface MonthlyComparisonDashboardResponse {
  data: MonthlyComparisonRow[];
  brands: string[];
  product_groups: { code: string; name: string }[];
}

export const dashboardApi = {
  summary: (params: { view_mode: string; year?: number; month?: number | number[]; quarter?: string }) =>
    api.get<DashboardSummaryResponse>(`/api/dashboard/summary${buildQuery(params)}`),
  monthlyComparison: (params: { year?: number }) =>
    api.get<MonthlyComparisonDashboardResponse>(`/api/dashboard/monthly-comparison${buildQuery(params)}`),
};



// ──────────────────────────────────────────────
// Workflow Types
// ──────────────────────────────────────────────

export interface WorkflowTimelineEntry {
  year: number;
  month: number;
  month_name: string;
  period_label: string;
  type: 'historical' | 'forecast';
  actual_qty: number;
  forecast_qty: number | null;
  adjusted_qty: number | null;
  effective_qty: number | null;
  confidence_lower: number | null;
  confidence_upper: number | null;
  adjusted_by: string | null;
  adjusted_at: string | null;
  adjustment_reason: string | null;
  forecast_id: number | null;
  warehouse_code: string | null;
}

export interface WorkflowResponse {
  item_code: string;
  item_name: string;
  item_uom: string;
  warehouse_code: string | null;
  warehouses: string[];
  timeline: WorkflowTimelineEntry[];
  summary: {
    historical_periods: number;
    forecast_periods: number;
    adjusted_periods: number;
    total_actual: number;
    total_forecast: number;
    total_adjusted: number;
  };
}

// ──────────────────────────────────────────────
// SAP B1 Integration API
// ──────────────────────────────────────────────

export const sapApi = {
  syncAll: () => api.post<{ message: string; details?: any }>('/api/sap/sync-all', {}),
};


// ──────────────────────────────────────────────
// Sales Forecast (Planning Spreadsheet) Types & API
// ──────────────────────────────────────────────

export interface SalesForecastRow {
  id: number;
  year: number;
  brand: string;
  product_group: string;
  sku_code: string;
  sku_name: string;
  unit: string;
  channel: string;
  region: string;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
  created_at: string;
  updated_at: string;
}

export interface SalesForecastCreateRow {
  year: number;
  brand: string;
  product_group: string;
  sku_code: string;
  sku_name: string;
  unit: string;
  channel: string;
  region: string;
  jan: number;
  feb: number;
  mar: number;
  apr: number;
  may: number;
  jun: number;
  jul: number;
  aug: number;
  sep: number;
  oct: number;
  nov: number;
  dec: number;
}

export interface BulkUpsertResponse {
  message: string;
  inserted: number;
  updated: number;
  total: number;
}

export const salesForecastApi = {
  list: (params: { page?: number; page_size?: number; year?: number; brand?: string[]; channel?: string[]; region?: string[]; product_group?: string[]; search?: string } = {}) =>
    api.get<PaginatedResponse<SalesForecastRow>>(`/api/sales-forecast${buildQuery(params)}`),

  bulkUpsert: (rows: SalesForecastCreateRow[]) =>
    api.post<BulkUpsertResponse>('/api/sales-forecast/bulk', rows),

  update: (id: number, data: Partial<SalesForecastCreateRow>) =>
    api.put<SalesForecastRow>(`/api/sales-forecast/${id}`, data),

  deleteByYear: (year: number, params: { brand?: string[]; channel?: string[]; region?: string[] } = {}) =>
    api.delete<{ message: string; deleted: number }>(`/api/sales-forecast${buildQuery({ year, ...params })}`),
};

// SalesEntry reuses the same row types as SalesForecast (identical structure)
export type SalesEntryRow = SalesForecastRow;
export type SalesEntryCreateRow = SalesForecastCreateRow;

export const salesEntryApi = {
  list: (params: { page?: number; page_size?: number; year?: number; brand?: string[]; channel?: string[]; region?: string[]; product_group?: string[]; search?: string } = {}) =>
    api.get<PaginatedResponse<SalesEntryRow>>(`/api/sales-entry${buildQuery(params)}`),

  bulkUpsert: (rows: SalesEntryCreateRow[]) =>
    api.post<BulkUpsertResponse>('/api/sales-entry/bulk', rows),

  update: (id: number, data: Partial<SalesEntryCreateRow>) =>
    api.put<SalesEntryRow>(`/api/sales-entry/${id}`, data),

  deleteByYear: (year: number, params: { brand?: string[]; channel?: string[]; region?: string[] } = {}) =>
    api.delete<{ message: string; deleted: number }>(`/api/sales-entry${buildQuery({ year, ...params })}`),
};
