// ============================================================================
// Custom Dashboards - Frontend Panel Registry
// ============================================================================
//
// THE central file for adding a new panel type. Each entry binds:
//   - the panel's display name + icon
//   - its default layout & config
//   - the Svelte component that renders the panel
//   - the Svelte component that edits the panel's config
//
// To add a new panel type:
//   1. Add the type literal + interface to @logtide/shared/types/dashboard
//   2. Add a Zod schema in backend panel-registry.ts
//   3. Add a fetcher in backend panel-data-service.ts
//   4. Create panels/<NewType>Panel.svelte
//   5. Create config-forms/<NewType>ConfigForm.svelte
//   6. Add an entry below
//
// No other frontend file (renderer, container, store, route) needs to change.

import type { Component } from 'svelte';
import LineChart from '@lucide/svelte/icons/line-chart';
import Hash from '@lucide/svelte/icons/hash';
import List from '@lucide/svelte/icons/list';
import Radio from '@lucide/svelte/icons/radio';
import Bell from '@lucide/svelte/icons/bell';
import type {
  PanelType,
  PanelConfig,
  PanelLayout,
  PanelInstance,
  TimeSeriesConfig,
  SingleStatConfig,
  TopNTableConfig,
  LiveLogStreamConfig,
  AlertStatusConfig,
} from '@logtide/shared';

import TimeSeriesPanel from './panels/TimeSeriesPanel.svelte';
import SingleStatPanel from './panels/SingleStatPanel.svelte';
import TopNTablePanel from './panels/TopNTablePanel.svelte';
import LiveLogStreamPanel from './panels/LiveLogStreamPanel.svelte';
import AlertStatusPanel from './panels/AlertStatusPanel.svelte';

import TimeSeriesConfigForm from './config-forms/TimeSeriesConfigForm.svelte';
import SingleStatConfigForm from './config-forms/SingleStatConfigForm.svelte';
import TopNTableConfigForm from './config-forms/TopNTableConfigForm.svelte';
import LiveLogStreamConfigForm from './config-forms/LiveLogStreamConfigForm.svelte';
import AlertStatusConfigForm from './config-forms/AlertStatusConfigForm.svelte';

export interface PanelComponentProps<TConfig extends PanelConfig = PanelConfig> {
  config: TConfig;
  data: unknown;
  loading: boolean;
  error: string | null;
}

export interface ConfigFormProps<TConfig extends PanelConfig = PanelConfig> {
  config: TConfig;
  onChange: (updated: TConfig) => void;
}

export interface FrontendPanelDefinition<
  TConfig extends PanelConfig = PanelConfig,
> {
  readonly type: PanelType;
  readonly label: string;
  readonly description: string;
  readonly icon: Component<{ class?: string }>;
  readonly defaultLayout: PanelLayout;
  readonly defaultConfig: TConfig;
  readonly component: Component<PanelComponentProps<TConfig>>;
  readonly configForm: Component<ConfigFormProps<TConfig>>;
  readonly minW: number;
  readonly minH: number;
}

const registry: Record<PanelType, FrontendPanelDefinition> = {
  time_series: {
    type: 'time_series',
    label: 'Time Series',
    description: 'Log volume over time, broken down by level.',
    icon: LineChart,
    defaultLayout: { x: 0, y: 0, w: 8, h: 3 },
    defaultConfig: {
      type: 'time_series',
      title: 'Log Volume',
      source: 'logs',
      projectId: null,
      interval: '24h',
      levels: ['info', 'warn', 'error', 'critical'],
      service: null,
    } as TimeSeriesConfig,
    component: TimeSeriesPanel as Component<PanelComponentProps>,
    configForm: TimeSeriesConfigForm as Component<ConfigFormProps>,
    minW: 4,
    minH: 2,
  },
  single_stat: {
    type: 'single_stat',
    label: 'Single Stat',
    description: 'A headline number with trend (e.g. error rate, throughput).',
    icon: Hash,
    defaultLayout: { x: 0, y: 0, w: 3, h: 2 },
    defaultConfig: {
      type: 'single_stat',
      title: 'Total Logs',
      source: 'logs',
      metric: 'total_logs',
      projectId: null,
      compareWithPrevious: true,
    } as SingleStatConfig,
    component: SingleStatPanel as Component<PanelComponentProps>,
    configForm: SingleStatConfigForm as Component<ConfigFormProps>,
    minW: 2,
    minH: 2,
  },
  top_n_table: {
    type: 'top_n_table',
    label: 'Top N Table',
    description: 'Ranked list (top services, top error messages, …).',
    icon: List,
    defaultLayout: { x: 0, y: 0, w: 6, h: 3 },
    defaultConfig: {
      type: 'top_n_table',
      title: 'Top Services',
      source: 'logs',
      dimension: 'service',
      limit: 5,
      projectId: null,
      interval: '24h',
    } as TopNTableConfig,
    component: TopNTablePanel as Component<PanelComponentProps>,
    configForm: TopNTableConfigForm as Component<ConfigFormProps>,
    minW: 3,
    minH: 2,
  },
  live_log_stream: {
    type: 'live_log_stream',
    label: 'Live Log Stream',
    description: 'A scrolling feed of recent logs.',
    icon: Radio,
    defaultLayout: { x: 0, y: 0, w: 6, h: 4 },
    defaultConfig: {
      type: 'live_log_stream',
      title: 'Recent Logs',
      source: 'logs',
      projectId: null,
      service: null,
      levels: ['info', 'warn', 'error', 'critical'],
      maxRows: 25,
    } as LiveLogStreamConfig,
    component: LiveLogStreamPanel as Component<PanelComponentProps>,
    configForm: LiveLogStreamConfigForm as Component<ConfigFormProps>,
    minW: 4,
    minH: 3,
  },
  alert_status: {
    type: 'alert_status',
    label: 'Alert Status',
    description: 'Status indicators for selected alert rules.',
    icon: Bell,
    defaultLayout: { x: 0, y: 0, w: 4, h: 3 },
    defaultConfig: {
      type: 'alert_status',
      title: 'Alerts',
      source: 'alerts',
      projectId: null,
      ruleIds: [],
      showHistory: true,
      limit: 5,
    } as AlertStatusConfig,
    component: AlertStatusPanel as Component<PanelComponentProps>,
    configForm: AlertStatusConfigForm as Component<ConfigFormProps>,
    minW: 3,
    minH: 2,
  },
};

export function getPanelDefinition(type: PanelType): FrontendPanelDefinition {
  const def = registry[type];
  if (!def) throw new Error(`Unknown panel type: ${type}`);
  return def;
}

export function getAllPanelDefinitions(): FrontendPanelDefinition[] {
  return Object.values(registry);
}

/**
 * Build a fresh PanelInstance for a given panel type, with its default config
 * and a generated id. The caller assigns the layout slot.
 */
export function createPanelInstance(type: PanelType): PanelInstance {
  const def = getPanelDefinition(type);
  return {
    id: `panel-${crypto.randomUUID()}`,
    layout: { ...def.defaultLayout },
    config: { ...def.defaultConfig },
  };
}
