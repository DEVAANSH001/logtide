// ============================================================================
// Panel Registry (backend)
// ============================================================================
//
// The backend registry's only job is to validate incoming panel configs at
// the API boundary. Each entry binds a PanelType to a Zod schema and a
// default layout. To add a new panel type:
//
//   1. Add the new type literal + interface to @logtide/shared/types/dashboard
//   2. Add an entry to `panelRegistry` here with its Zod schema
//   3. Add a fetcher in panel-data-service.ts
//   4. (frontend) add the component + config form + registry entry
//
// No other backend file needs to change.

import { z } from 'zod';
import type { PanelType, PanelConfig, PanelLayout } from '@logtide/shared';

const levelEnum = z.enum(['debug', 'info', 'warn', 'error', 'critical']);

const timeSeriesSchema = z.object({
  type: z.literal('time_series'),
  title: z.string().min(1).max(100),
  source: z.literal('logs'),
  projectId: z.string().uuid().nullable(),
  interval: z.enum(['1h', '6h', '24h', '7d', '30d']),
  levels: z.array(levelEnum).min(1),
  service: z.string().max(200).nullable(),
});

const singleStatSchema = z.object({
  type: z.literal('single_stat'),
  title: z.string().min(1).max(100),
  source: z.literal('logs'),
  metric: z.enum(['total_logs', 'error_rate', 'active_services', 'throughput']),
  projectId: z.string().uuid().nullable(),
  compareWithPrevious: z.boolean(),
});

const topNTableSchema = z.object({
  type: z.literal('top_n_table'),
  title: z.string().min(1).max(100),
  source: z.literal('logs'),
  dimension: z.enum(['service', 'error_message']),
  limit: z.number().int().min(3).max(20),
  projectId: z.string().uuid().nullable(),
  interval: z.enum(['1h', '24h', '7d']),
});

const liveLogStreamSchema = z.object({
  type: z.literal('live_log_stream'),
  title: z.string().min(1).max(100),
  source: z.literal('logs'),
  projectId: z.string().uuid().nullable(),
  service: z.string().max(200).nullable(),
  levels: z.array(levelEnum).min(1),
  maxRows: z.number().int().min(10).max(50),
});

const alertStatusSchema = z.object({
  type: z.literal('alert_status'),
  title: z.string().min(1).max(100),
  source: z.literal('alerts'),
  projectId: z.string().uuid().nullable(),
  ruleIds: z.array(z.string().uuid()),
  showHistory: z.boolean(),
  limit: z.number().int().min(3).max(20),
});

export const panelConfigSchema = z.discriminatedUnion('type', [
  timeSeriesSchema,
  singleStatSchema,
  topNTableSchema,
  liveLogStreamSchema,
  alertStatusSchema,
]);

export interface BackendPanelDefinition {
  readonly type: PanelType;
  readonly schema: z.ZodType<PanelConfig>;
  readonly defaultLayout: Pick<PanelLayout, 'w' | 'h'>;
}

export const panelRegistry: Record<PanelType, BackendPanelDefinition> = {
  time_series: {
    type: 'time_series',
    schema: timeSeriesSchema as unknown as z.ZodType<PanelConfig>,
    defaultLayout: { w: 8, h: 3 },
  },
  single_stat: {
    type: 'single_stat',
    schema: singleStatSchema as unknown as z.ZodType<PanelConfig>,
    defaultLayout: { w: 3, h: 2 },
  },
  top_n_table: {
    type: 'top_n_table',
    schema: topNTableSchema as unknown as z.ZodType<PanelConfig>,
    defaultLayout: { w: 6, h: 3 },
  },
  live_log_stream: {
    type: 'live_log_stream',
    schema: liveLogStreamSchema as unknown as z.ZodType<PanelConfig>,
    defaultLayout: { w: 6, h: 4 },
  },
  alert_status: {
    type: 'alert_status',
    schema: alertStatusSchema as unknown as z.ZodType<PanelConfig>,
    defaultLayout: { w: 4, h: 3 },
  },
};

const panelLayoutSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(20),
});

export const panelInstanceSchema = z.object({
  id: z.string().min(1).max(64),
  layout: panelLayoutSchema,
  config: panelConfigSchema,
});

export const dashboardDocumentSchema = z.object({
  schema_version: z.number().int().min(1),
  panels: z.array(panelInstanceSchema),
});
