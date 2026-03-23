import type { MonitorType, MonitorStatusValue, MonitorHttpConfig } from '../../database/types.js';
import type { Severity } from '@logtide/shared';

export type { MonitorType, MonitorStatusValue, MonitorHttpConfig };

export type ErrorCode =
  | 'timeout'
  | 'dns_error'
  | 'connection_refused'
  | 'ssl_error'
  | 'http_error'
  | 'no_heartbeat'
  | 'unexpected';

// Alias for the database JSONB shape — single source of truth in database/types.ts
export type HttpConfig = MonitorHttpConfig;

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
  httpConfig: HttpConfig | null;
  severity: Severity;
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
  httpConfig?: HttpConfig | null;
  severity?: string;
}

export interface UpdateMonitorInput {
  name?: string;
  target?: string | null;
  intervalSeconds?: number;
  timeoutSeconds?: number;
  failureThreshold?: number;
  autoResolve?: boolean;
  enabled?: boolean;
  httpConfig?: HttpConfig | null;
  severity?: string;
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
