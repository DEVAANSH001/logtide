import type { MonitorType, MonitorStatusValue } from '../../database/types.js';

export type { MonitorType, MonitorStatusValue };

export type ErrorCode =
  | 'timeout'
  | 'dns_error'
  | 'connection_refused'
  | 'ssl_error'
  | 'http_error'
  | 'no_heartbeat'
  | 'unexpected';

export interface HttpConfig {
  method?: string;
  expectedStatus?: number;
  headers?: Record<string, string>;
  bodyAssertion?: { type: 'contains'; value: string } | { type: 'regex'; pattern: string };
}

export interface CheckResult {
  status: 'up' | 'down';
  responseTimeMs: number | null;
  statusCode: number | null;
  errorCode: ErrorCode | null;
}

export interface Monitor {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  type: MonitorType;
  target: string | null;
  intervalSeconds: number;
  timeoutSeconds: number;
  failureThreshold: number;
  autoResolve: boolean;
  enabled: boolean;
  status?: MonitorCurrentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonitorCurrentStatus {
  monitorId: string;
  status: MonitorStatusValue;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheckedAt: Date | null;
  lastStatusChangeAt: Date | null;
  responseTimeMs: number | null;
  lastErrorCode: string | null;
  incidentId: string | null;
  updatedAt: Date;
}

export interface MonitorResult {
  time: Date;
  id: string;
  monitorId: string;
  status: 'up' | 'down';
  responseTimeMs: number | null;
  statusCode: number | null;
  errorCode: string | null;
  isHeartbeat: boolean;
}

export interface UptimeBucket {
  bucket: Date;
  monitorId: string;
  totalChecks: number;
  successfulChecks: number;
  uptimePct: number;
}

export interface CreateMonitorInput {
  organizationId: string;
  projectId: string;
  name: string;
  type: MonitorType;
  target?: string | null;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
  autoResolve?: boolean;
  enabled?: boolean;
}

export interface UpdateMonitorInput {
  name?: string;
  target?: string | null;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
  autoResolve?: boolean;
  enabled?: boolean;
}

export interface PublicMonitorStatus {
  name: string;
  type: MonitorType;
  status: MonitorStatusValue;
  uptimeHistory: { bucket: string; uptimePct: number }[];
}

export interface PublicStatusPage {
  projectName: string;
  projectSlug: string;
  overallStatus: 'operational' | 'degraded' | 'outage';
  monitors: PublicMonitorStatus[];
  lastUpdated: string;
}
