import { writable, derived } from 'svelte/store';
import { metricsAPI, type MetricName, type MetricAggregateResult, type MetricDataResponse, type MetricAggregationFn, type MetricsOverviewResult } from '$lib/api/metrics';

interface MetricsState {
  metricNames: MetricName[];
  metricNamesLoading: boolean;
  metricNamesError: string | null;
  selectedMetric: string | null;
  selectedInterval: string;
  selectedAggregation: MetricAggregationFn;
  selectedGroupBy: string[];
  activeLabels: Record<string, string>;
  timeseries: MetricAggregateResult | null;
  timeseriesLoading: boolean;
  timeseriesError: string | null;
  labelKeys: string[];
  labelValues: Record<string, string[]>;
  dataPoints: MetricDataResponse | null;
  dataPointsLoading: boolean;
  activeTab: 'overview' | 'explorer' | 'golden';
  overview: MetricsOverviewResult | null;
  overviewLoading: boolean;
  overviewError: string | null;
  selectedService: string | null;
}

const initialState: MetricsState = {
  metricNames: [],
  metricNamesLoading: false,
  metricNamesError: null,
  selectedMetric: null,
  selectedInterval: '1h',
  selectedAggregation: 'avg',
  selectedGroupBy: [],
  activeLabels: {},
  timeseries: null,
  timeseriesLoading: false,
  timeseriesError: null,
  labelKeys: [],
  labelValues: {},
  dataPoints: null,
  dataPointsLoading: false,
  activeTab: 'overview',
  overview: null,
  overviewLoading: false,
  overviewError: null,
  selectedService: null,
};

function createMetricsStore() {
  const { subscribe, set, update } = writable<MetricsState>(initialState);

  return {
    subscribe,

    async loadMetricNames(projectId: string, from?: string, to?: string) {
      update(s => ({ ...s, metricNamesLoading: true, metricNamesError: null }));
      try {
        const names = await metricsAPI.getMetricNames(projectId, from, to);
        update(s => ({ ...s, metricNames: names, metricNamesLoading: false }));
      } catch (error) {
        update(s => ({ ...s, metricNamesError: (error as Error).message, metricNamesLoading: false }));
      }
    },

    async loadTimeseries(projectId: string, metricName: string, from: string, to: string) {
      update(s => ({ ...s, timeseriesLoading: true, timeseriesError: null }));
      try {
        let currentState: MetricsState;
        const unsub = subscribe(s => currentState = s);
        unsub();

        const result = await metricsAPI.aggregateMetrics({
          projectId,
          metricName,
          from,
          to,
          interval: currentState!.selectedInterval,
          aggregation: currentState!.selectedAggregation,
          groupBy: currentState!.selectedGroupBy.length > 0 ? currentState!.selectedGroupBy : undefined,
          attributes: Object.keys(currentState!.activeLabels).length > 0 ? currentState!.activeLabels : undefined,
        });
        update(s => ({ ...s, timeseries: result, timeseriesLoading: false }));
      } catch (error) {
        update(s => ({ ...s, timeseriesError: (error as Error).message, timeseriesLoading: false }));
      }
    },

    async loadLabelKeys(projectId: string, metricName: string, from?: string, to?: string) {
      try {
        const keys = await metricsAPI.getLabelKeys(projectId, metricName, from, to);
        update(s => ({ ...s, labelKeys: keys }));
      } catch {
        update(s => ({ ...s, labelKeys: [] }));
      }
    },

    async loadLabelValues(projectId: string, metricName: string, labelKey: string, from?: string, to?: string) {
      try {
        const values = await metricsAPI.getLabelValues(projectId, metricName, labelKey, from, to);
        update(s => ({ ...s, labelValues: { ...s.labelValues, [labelKey]: values } }));
      } catch {
        // ignore
      }
    },

    async loadDataPoints(projectId: string, metricName: string, from: string, to: string, includeExemplars = false) {
      update(s => ({ ...s, dataPointsLoading: true }));
      try {
        let currentState: MetricsState;
        const unsub = subscribe(s => currentState = s);
        unsub();

        const result = await metricsAPI.getMetricData({
          projectId,
          metricName,
          from,
          to,
          includeExemplars,
          attributes: Object.keys(currentState!.activeLabels).length > 0 ? currentState!.activeLabels : undefined,
          limit: 100,
        });
        update(s => ({ ...s, dataPoints: result, dataPointsLoading: false }));
      } catch {
        update(s => ({ ...s, dataPointsLoading: false }));
      }
    },

    selectMetric(name: string | null) {
      update(s => ({ ...s, selectedMetric: name, timeseries: null, dataPoints: null, labelKeys: [], labelValues: {}, activeLabels: {} }));
    },

    setInterval(interval: string) {
      update(s => ({ ...s, selectedInterval: interval }));
    },

    setAggregation(agg: MetricAggregationFn) {
      update(s => ({ ...s, selectedAggregation: agg }));
    },

    setGroupBy(keys: string[]) {
      update(s => ({ ...s, selectedGroupBy: keys }));
    },

    setLabel(key: string, value: string) {
      update(s => ({ ...s, activeLabels: { ...s.activeLabels, [key]: value } }));
    },

    removeLabel(key: string) {
      update(s => {
        const labels = { ...s.activeLabels };
        delete labels[key];
        return { ...s, activeLabels: labels };
      });
    },

    async loadOverview(projectId: string, from: string, to: string, serviceName?: string) {
      update(s => ({ ...s, overviewLoading: true, overviewError: null }));
      try {
        const result = await metricsAPI.getOverview({ projectId, from, to, serviceName });
        update(s => ({ ...s, overview: result, overviewLoading: false }));
      } catch (error) {
        update(s => ({ ...s, overviewError: (error as Error).message, overviewLoading: false }));
      }
    },

    setActiveTab(tab: 'overview' | 'explorer' | 'golden') {
      update(s => ({ ...s, activeTab: tab }));
    },

    setSelectedService(service: string | null) {
      update(s => ({ ...s, selectedService: service }));
    },

    reset() {
      set(initialState);
    },
  };
}

export const metricsStore = createMetricsStore();
export const metricNames = derived({ subscribe: metricsStore.subscribe }, $s => $s.metricNames);
export const selectedMetric = derived({ subscribe: metricsStore.subscribe }, $s => $s.selectedMetric);
export const timeseries = derived({ subscribe: metricsStore.subscribe }, $s => $s.timeseries);
export const timeseriesLoading = derived({ subscribe: metricsStore.subscribe }, $s => $s.timeseriesLoading);
export const overview = derived({ subscribe: metricsStore.subscribe }, $s => $s.overview);
export const overviewLoading = derived({ subscribe: metricsStore.subscribe }, $s => $s.overviewLoading);
export const activeTab = derived({ subscribe: metricsStore.subscribe }, $s => $s.activeTab);
