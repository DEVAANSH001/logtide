// ============================================================================
// Custom Dashboards - Shared Types
// ============================================================================
//
// This file is the canonical schema for dashboard configurations. It is
// imported by both backend (validation, persistence) and frontend (rendering,
// editing). The DashboardDocument JSON shape is stored verbatim in the
// `dashboards.panels` JSONB column.
//
// Versioning: every saved document carries a `schema_version` integer. When we
// add new panel types or change existing config shapes in a backwards-
// incompatible way, we bump CURRENT_SCHEMA_VERSION and add a migration
// function in dashboard-migrations.ts.

export const CURRENT_SCHEMA_VERSION = 1;

export type PanelType =
  | 'time_series'
  | 'single_stat'
  | 'top_n_table'
  | 'live_log_stream'
  | 'alert_status';

// ─── Layout (12-column grid) ────────────────────────────────────────────────

export interface PanelLayout {
  x: number; // 0–11
  y: number; // 0-based row index
  w: number; // 1–12 column span
  h: number; // row units (1 unit ≈ 80px)
}

// ─── Per-type panel configs ─────────────────────────────────────────────────

export type LogLevelKey = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface TimeSeriesConfig {
  type: 'time_series';
  title: string;
  source: 'logs';
  projectId: string | null; // null = org-wide
  interval: '1h' | '6h' | '24h' | '7d' | '30d';
  levels: LogLevelKey[];
  service: string | null;
}

export interface SingleStatConfig {
  type: 'single_stat';
  title: string;
  source: 'logs';
  metric: 'total_logs' | 'error_rate' | 'active_services' | 'throughput';
  projectId: string | null;
  compareWithPrevious: boolean;
}

export interface TopNTableConfig {
  type: 'top_n_table';
  title: string;
  source: 'logs';
  dimension: 'service' | 'error_message';
  limit: number; // 5–20
  projectId: string | null;
  interval: '1h' | '24h' | '7d';
}

export interface LiveLogStreamConfig {
  type: 'live_log_stream';
  title: string;
  source: 'logs';
  projectId: string | null;
  service: string | null;
  levels: LogLevelKey[];
  maxRows: number; // 10–50
}

export interface AlertStatusConfig {
  type: 'alert_status';
  title: string;
  source: 'alerts';
  projectId: string | null;
  ruleIds: string[]; // empty = show all rules in scope
  showHistory: boolean;
  limit: number; // 5–20
}

export type PanelConfig =
  | TimeSeriesConfig
  | SingleStatConfig
  | TopNTableConfig
  | LiveLogStreamConfig
  | AlertStatusConfig;

// ─── Panel instance (layout + config) ───────────────────────────────────────

export interface PanelInstance {
  id: string; // stable uuid generated client-side
  layout: PanelLayout;
  config: PanelConfig;
}

// ─── Dashboard document (the JSON stored in DB) ─────────────────────────────

export interface DashboardDocument {
  schema_version: number;
  panels: PanelInstance[];
}

// ─── Dashboard DTO returned by the API ──────────────────────────────────────

export interface CustomDashboard {
  id: string;
  organizationId: string;
  projectId: string | null;
  name: string;
  description: string | null;
  isDefault: boolean;
  isPersonal: boolean;
  createdBy: string | null;
  schemaVersion: number;
  panels: PanelInstance[];
  createdAt: string;
  updatedAt: string;
}
