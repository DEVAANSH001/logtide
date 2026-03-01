import { getApiBaseUrl } from '$lib/config';
import { getAuthToken } from '$lib/utils/auth';

export type MetricType = 'gauge' | 'sum' | 'histogram' | 'exp_histogram' | 'summary';
export type MetricAggregationFn = 'avg' | 'sum' | 'min' | 'max' | 'count' | 'last';

export interface MetricName {
  name: string;
  type: MetricType;
}

export interface MetricTimeBucket {
  bucket: string;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricAggregateResult {
  metricName: string;
  metricType: MetricType;
  timeseries: MetricTimeBucket[];
}

export interface MetricDataPoint {
  id: string;
  time: string;
  metricName: string;
  metricType: MetricType;
  value: number;
  serviceName: string;
  attributes: Record<string, unknown> | null;
  resourceAttributes: Record<string, unknown> | null;
  histogramData: Record<string, unknown> | null;
  hasExemplars: boolean;
  exemplars?: Array<{
    exemplarValue: number;
    exemplarTime?: string;
    traceId?: string;
    spanId?: string;
    attributes?: Record<string, unknown>;
  }>;
}

export interface MetricDataResponse {
  metrics: MetricDataPoint[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export class MetricsAPI {
  constructor(private getToken: () => string | null) {}

  private getHeaders(): HeadersInit {
    const token = this.getToken();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  async getMetricNames(projectId: string, from?: string, to?: string): Promise<MetricName[]> {
    const params = new URLSearchParams({ projectId });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const res = await fetch(`${getApiBaseUrl()}/metrics/names?${params}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch metric names: ${res.statusText}`);
    const data = await res.json();
    return data.names;
  }

  async getLabelKeys(projectId: string, metricName: string, from?: string, to?: string): Promise<string[]> {
    const params = new URLSearchParams({ projectId, metricName });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const res = await fetch(`${getApiBaseUrl()}/metrics/labels/keys?${params}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch label keys: ${res.statusText}`);
    const data = await res.json();
    return data.keys ?? [];
  }

  async getLabelValues(projectId: string, metricName: string, labelKey: string, from?: string, to?: string): Promise<string[]> {
    const params = new URLSearchParams({ projectId, metricName, labelKey });
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    const res = await fetch(`${getApiBaseUrl()}/metrics/labels/values?${params}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch label values: ${res.statusText}`);
    const data = await res.json();
    return data.values ?? [];
  }

  async getMetricData(params: {
    projectId: string;
    metricName: string;
    from: string;
    to: string;
    attributes?: Record<string, string>;
    limit?: number;
    offset?: number;
    includeExemplars?: boolean;
  }): Promise<MetricDataResponse> {
    const searchParams = new URLSearchParams({
      projectId: params.projectId,
      metricName: params.metricName,
      from: params.from,
      to: params.to,
    });
    if (params.limit) searchParams.append('limit', String(params.limit));
    if (params.offset) searchParams.append('offset', String(params.offset));
    if (params.includeExemplars) searchParams.append('includeExemplars', 'true');
    if (params.attributes) {
      for (const [k, v] of Object.entries(params.attributes)) {
        searchParams.append(`attributes[${k}]`, v);
      }
    }
    const res = await fetch(`${getApiBaseUrl()}/metrics/data?${searchParams}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch metric data: ${res.statusText}`);
    return res.json();
  }

  async aggregateMetrics(params: {
    projectId: string;
    metricName: string;
    from: string;
    to: string;
    interval?: string;
    aggregation?: MetricAggregationFn;
    groupBy?: string[];
    attributes?: Record<string, string>;
  }): Promise<MetricAggregateResult> {
    const searchParams = new URLSearchParams({
      projectId: params.projectId,
      metricName: params.metricName,
      from: params.from,
      to: params.to,
      interval: params.interval ?? '1h',
      aggregation: params.aggregation ?? 'avg',
    });
    if (params.groupBy) params.groupBy.forEach(g => searchParams.append('groupBy', g));
    if (params.attributes) {
      for (const [k, v] of Object.entries(params.attributes)) {
        searchParams.append(`attributes[${k}]`, v);
      }
    }
    const res = await fetch(`${getApiBaseUrl()}/metrics/aggregate?${searchParams}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error(`Failed to aggregate metrics: ${res.statusText}`);
    return res.json();
  }
}

export const metricsAPI = new MetricsAPI(getAuthToken);
