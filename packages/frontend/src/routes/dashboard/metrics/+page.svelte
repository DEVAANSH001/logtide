<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import * as echarts from "echarts";
  import {
    chartColors,
    getAxisStyle,
    getTooltipStyle,
    getLegendStyle,
  } from "$lib/utils/echarts-theme";
  import { themeStore } from "$lib/stores/theme";
  import { metricsStore } from "$lib/stores/metrics";
  import type { MetricAggregateResult } from "$lib/api/metrics";
  import { currentOrganization } from "$lib/stores/organization";
  import { observeContextStore, selectedProjects as selectedProjectsStore, timeRangeType as ctxTimeRangeType } from "$lib/stores/observe-context";
  import { layoutStore } from "$lib/stores/layout";

  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import * as Select from "$lib/components/ui/select";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import { Badge } from "$lib/components/ui/badge";
  import Button from "$lib/components/ui/button/button.svelte";

  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import Activity from "@lucide/svelte/icons/activity";
  import Filter from "@lucide/svelte/icons/filter";
  import X from "@lucide/svelte/icons/x";
  import ExternalLink from "@lucide/svelte/icons/external-link";

  // Layout state
  let maxWidthClass = $state("max-w-7xl");
  let containerPadding = $state("px-8 py-8");

  $effect(() => {
    const unsubscribe = layoutStore.maxWidthClass.subscribe((value) => {
      maxWidthClass = value;
    });
    return unsubscribe;
  });

  $effect(() => {
    const unsubscribe = layoutStore.containerPadding.subscribe((value) => {
      containerPadding = value;
    });
    return unsubscribe;
  });

  // Derive project from observe context store
  let selectedProject = $derived($selectedProjectsStore.length > 0 ? $selectedProjectsStore[0] : null);

  // Metrics store state
  let storeState = $state({
    metricNames: [] as { name: string; type: string }[],
    metricNamesLoading: false,
    metricNamesError: null as string | null,
    selectedMetric: null as string | null,
    selectedInterval: "1h",
    selectedAggregation: "avg" as string,
    selectedGroupBy: [] as string[],
    activeLabels: {} as Record<string, string>,
    timeseries: null as MetricAggregateResult | null,
    timeseriesLoading: false,
    timeseriesError: null as string | null,
    labelKeys: [] as string[],
    labelValues: {} as Record<string, string[]>,
    dataPoints: null as {
      metrics: {
        id: string;
        time: string;
        metricName: string;
        metricType: string;
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
      }[];
      total: number;
      hasMore: boolean;
      limit: number;
      offset: number;
    } | null,
    dataPointsLoading: false,
  });

  $effect(() => {
    const unsubscribe = metricsStore.subscribe((s) => {
      storeState = s;
    });
    return unsubscribe;
  });

  // Label filter UI
  let selectedLabelKey = $state<string | null>(null);
  let selectedLabelValue = $state<string | null>(null);

  // ECharts
  let chartContainer = $state<HTMLDivElement | undefined>(undefined);
  let chart: echarts.ECharts | null = null;

  // Org tracking
  let lastLoadedOrg = $state<string | null>(null);

  onMount(() => {
    // Initial load if project is already selected
    if (selectedProject) {
      loadMetricNames();
    }

    return () => {
      chart?.dispose();
      metricsStore.reset();
    };
  });

  // Init/dispose chart when chartContainer mounts/unmounts
  let resizeObserver: ResizeObserver | null = null;
  let unsubTheme: (() => void) | null = null;

  $effect(() => {
    if (chartContainer && !chart) {
      chart = echarts.init(chartContainer);

      resizeObserver = new ResizeObserver(() => chart?.resize());
      resizeObserver.observe(chartContainer);

      unsubTheme = themeStore.subscribe(() => {
        if (chart && storeState.timeseries) {
          chart.setOption(getChartOption(storeState.timeseries), true);
        }
      });

      // If timeseries data already loaded, render it
      if (storeState.timeseries) {
        chart.setOption(getChartOption(storeState.timeseries), true);
      }
    } else if (!chartContainer && chart) {
      resizeObserver?.disconnect();
      unsubTheme?.();
      chart.dispose();
      chart = null;
    }
  });

  // React to org change
  $effect(() => {
    if (!$currentOrganization) {
      lastLoadedOrg = null;
      return;
    }

    if ($currentOrganization.id === lastLoadedOrg) return;
    lastLoadedOrg = $currentOrganization.id;
  });

  // React to project or time range changes from observe context store
  let lastContextKey = $state<string | null>(null);
  $effect(() => {
    // Track dependencies
    const _proj = $selectedProjectsStore;
    const _tr = $ctxTimeRangeType;

    if (!$currentOrganization || !selectedProject) {
      return;
    }

    const key = `${$currentOrganization.id}-${selectedProject}-${$ctxTimeRangeType}`;
    if (key === lastContextKey) return;
    lastContextKey = key;

    loadMetricNames();
  });

  // React to timeseries data changes -> update chart
  $effect(() => {
    if (chart && storeState.timeseries) {
      chart.setOption(getChartOption(storeState.timeseries), true);
    } else if (chart && !storeState.timeseries) {
      chart.clear();
    }
  });

  function loadMetricNames() {
    if (!selectedProject) return;
    const { from, to } = observeContextStore.getTimeRange();
    metricsStore.loadMetricNames(
      selectedProject,
      from.toISOString(),
      to.toISOString()
    );
  }

  function handleMetricSelect(metricName: string) {
    metricsStore.selectMetric(metricName);
    if (!selectedProject) return;

    const { from, to } = observeContextStore.getTimeRange();
    const fromISO = from.toISOString();
    const toISO = to.toISOString();

    metricsStore.loadLabelKeys(selectedProject, metricName, fromISO, toISO);
    metricsStore.loadTimeseries(selectedProject, metricName, fromISO, toISO);
    metricsStore.loadDataPoints(
      selectedProject,
      metricName,
      fromISO,
      toISO,
      true
    );
  }

  function handleIntervalChange(interval: string) {
    metricsStore.setInterval(interval);
    reloadTimeseries();
  }

  function handleAggregationChange(agg: string) {
    metricsStore.setAggregation(
      agg as "avg" | "sum" | "min" | "max" | "count" | "last"
    );
    reloadTimeseries();
  }

  function addLabelFilter() {
    if (!selectedLabelKey || !selectedLabelValue) return;
    metricsStore.setLabel(selectedLabelKey, selectedLabelValue);
    selectedLabelKey = null;
    selectedLabelValue = null;
    reloadTimeseries();
    reloadDataPoints();
  }

  function removeLabelFilter(key: string) {
    metricsStore.removeLabel(key);
    reloadTimeseries();
    reloadDataPoints();
  }

  function handleLabelKeyChange(key: string) {
    selectedLabelKey = key;
    selectedLabelValue = null;
    if (selectedProject && storeState.selectedMetric) {
      const { from, to } = observeContextStore.getTimeRange();
      metricsStore.loadLabelValues(
        selectedProject,
        storeState.selectedMetric,
        key,
        from.toISOString(),
        to.toISOString()
      );
    }
  }

  function reloadTimeseries() {
    if (!selectedProject || !storeState.selectedMetric) return;
    const { from, to } = observeContextStore.getTimeRange();
    metricsStore.loadTimeseries(
      selectedProject,
      storeState.selectedMetric,
      from.toISOString(),
      to.toISOString()
    );
  }

  function reloadDataPoints() {
    if (!selectedProject || !storeState.selectedMetric) return;
    const { from, to } = observeContextStore.getTimeRange();
    metricsStore.loadDataPoints(
      selectedProject,
      storeState.selectedMetric,
      from.toISOString(),
      to.toISOString(),
      true
    );
  }

  function getChartOption(data: MetricAggregateResult): echarts.EChartsOption {
    const axisStyle = getAxisStyle();
    const tooltipStyle = getTooltipStyle();
    const legendStyle = getLegendStyle();

    const seriesColors = [
      chartColors.series.blue,
      chartColors.series.green,
      chartColors.series.amber,
      chartColors.series.purple,
      chartColors.series.orange,
      chartColors.series.red,
    ];

    // Group timeseries by labels for groupBy support
    const groups = new Map<string, { bucket: string; value: number }[]>();

    for (const point of data.timeseries) {
      const key = point.labels
        ? Object.entries(point.labels)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")
        : data.metricName;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ bucket: point.bucket, value: point.value });
    }

    // If no groups, use a single series
    if (groups.size === 0) {
      groups.set(data.metricName, []);
    }

    const allBuckets = [
      ...new Set(data.timeseries.map((p) => p.bucket)),
    ].sort();
    const seriesNames = [...groups.keys()];

    const series: echarts.SeriesOption[] = seriesNames.map((name, i) => {
      const points = groups.get(name)!;
      const bucketMap = new Map(points.map((p) => [p.bucket, p.value]));

      return {
        name,
        type: "line",
        smooth: true,
        data: allBuckets.map((b) => bucketMap.get(b) ?? null),
        lineStyle: { color: seriesColors[i % seriesColors.length] },
        itemStyle: { color: seriesColors[i % seriesColors.length] },
        areaStyle: seriesNames.length === 1
          ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: seriesColors[i % seriesColors.length] + "40" },
              { offset: 1, color: seriesColors[i % seriesColors.length] + "05" },
            ]) }
          : undefined,
      };
    });

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        ...tooltipStyle,
      },
      legend: {
        data: seriesNames,
        bottom: 0,
        ...legendStyle,
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "10%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: allBuckets.map((b) => formatBucketLabel(b)),
        ...axisStyle,
      },
      yAxis: {
        type: "value",
        ...axisStyle,
      },
      series,
    };
  }

  function formatBucketLabel(bucket: string): string {
    const d = new Date(bucket);
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function formatDateTime(dateStr: string): string {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  function truncateJson(obj: Record<string, unknown> | null, maxLen = 60): string {
    if (!obj) return "-";
    const str = JSON.stringify(obj);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + "...";
  }

  function goToTrace(traceId: string) {
    if (selectedProject) {
      goto(`/dashboard/traces/${traceId}?projectId=${selectedProject}`);
    }
  }

  const intervals = [
    { value: "1m", label: "1 min" },
    { value: "5m", label: "5 min" },
    { value: "15m", label: "15 min" },
    { value: "1h", label: "1 hour" },
    { value: "6h", label: "6 hours" },
    { value: "1d", label: "1 day" },
  ];

  const aggregations = [
    { value: "avg", label: "Average" },
    { value: "sum", label: "Sum" },
    { value: "min", label: "Min" },
    { value: "max", label: "Max" },
    { value: "count", label: "Count" },
    { value: "last", label: "Last" },
  ];
</script>

<svelte:head>
  <title>Metrics Explorer - LogTide</title>
</svelte:head>

<div class="container mx-auto {containerPadding} {maxWidthClass}">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center gap-3 mb-2">
      <BarChart3 class="w-8 h-8 text-primary" />
      <h1 class="text-3xl font-bold tracking-tight">Metrics Explorer</h1>
    </div>
    <p class="text-muted-foreground">
      Explore and visualize OTLP metrics from your applications
    </p>
  </div>

  <!-- Filters -->
  <Card class="mb-6">
    <CardHeader>
      <CardTitle>Filters</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <!-- Metric name selector -->
        <div class="space-y-2">
          <label class="text-sm font-medium">Metric</label>
          <Select.Root
            type="single"
            value={storeState.selectedMetric || ""}
            onValueChange={(v) => {
              if (v) handleMetricSelect(v);
            }}
          >
            <Select.Trigger class="w-full">
              {#if storeState.metricNamesLoading}
                Loading...
              {:else}
                {storeState.selectedMetric || "Select metric"}
              {/if}
            </Select.Trigger>
            <Select.Content>
              {#each storeState.metricNames as metric}
                <Select.Item value={metric.name}>
                  <span class="flex items-center gap-2">
                    {metric.name}
                    <Badge variant="outline" class="text-xs"
                      >{metric.type}</Badge
                    >
                  </span>
                </Select.Item>
              {/each}
              {#if storeState.metricNames.length === 0 && !storeState.metricNamesLoading}
                <div class="px-3 py-2 text-sm text-muted-foreground">
                  No metrics found
                </div>
              {/if}
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- Controls row -->
  {#if storeState.selectedMetric}
    <Card class="mb-6">
      <CardHeader>
        <div class="flex items-center gap-2">
          <Activity class="w-5 h-5 text-muted-foreground" />
          <CardTitle>Chart Controls</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <!-- Interval -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Interval</label>
            <Select.Root
              type="single"
              value={storeState.selectedInterval}
              onValueChange={(v) => {
                if (v) handleIntervalChange(v);
              }}
            >
              <Select.Trigger class="w-full">
                {intervals.find((i) => i.value === storeState.selectedInterval)
                  ?.label || storeState.selectedInterval}
              </Select.Trigger>
              <Select.Content>
                {#each intervals as interval}
                  <Select.Item value={interval.value}
                    >{interval.label}</Select.Item
                  >
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Aggregation -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Aggregation</label>
            <Select.Root
              type="single"
              value={storeState.selectedAggregation}
              onValueChange={(v) => {
                if (v) handleAggregationChange(v);
              }}
            >
              <Select.Trigger class="w-full">
                {aggregations.find(
                  (a) => a.value === storeState.selectedAggregation
                )?.label || storeState.selectedAggregation}
              </Select.Trigger>
              <Select.Content>
                {#each aggregations as agg}
                  <Select.Item value={agg.value}>{agg.label}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Label key filter -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Filter by label</label>
            <Select.Root
              type="single"
              value={selectedLabelKey || ""}
              onValueChange={(v) => {
                if (v) handleLabelKeyChange(v);
              }}
            >
              <Select.Trigger class="w-full">
                {selectedLabelKey || "Select label key"}
              </Select.Trigger>
              <Select.Content>
                {#each storeState.labelKeys as key}
                  <Select.Item value={key}>{key}</Select.Item>
                {/each}
                {#if storeState.labelKeys.length === 0}
                  <div class="px-3 py-2 text-sm text-muted-foreground">
                    No labels available
                  </div>
                {/if}
              </Select.Content>
            </Select.Root>
          </div>

          <!-- Label value filter -->
          <div class="space-y-2">
            <label class="text-sm font-medium">Label value</label>
            <div class="flex gap-2">
              <Select.Root
                type="single"
                value={selectedLabelValue || ""}
                onValueChange={(v) => {
                  if (v) selectedLabelValue = v;
                }}
              >
                <Select.Trigger class="w-full">
                  {selectedLabelValue || "Select value"}
                </Select.Trigger>
                <Select.Content>
                  {#each storeState.labelValues[selectedLabelKey ?? ""] ?? [] as val}
                    <Select.Item value={val}>{val}</Select.Item>
                  {/each}
                  {#if !selectedLabelKey}
                    <div class="px-3 py-2 text-sm text-muted-foreground">
                      Select a label key first
                    </div>
                  {/if}
                </Select.Content>
              </Select.Root>
              <Button
                variant="outline"
                size="sm"
                onclick={addLabelFilter}
                disabled={!selectedLabelKey || !selectedLabelValue}
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        <!-- Active label filters -->
        {#if Object.keys(storeState.activeLabels).length > 0}
          <div class="flex flex-wrap gap-2 mt-4">
            <Filter class="w-4 h-4 text-muted-foreground mt-1" />
            {#each Object.entries(storeState.activeLabels) as [key, value]}
              <Badge variant="secondary" class="flex items-center gap-1">
                {key}={value}
                <button
                  class="ml-1 hover:text-destructive"
                  onclick={() => removeLabelFilter(key)}
                >
                  <X class="w-3 h-3" />
                </button>
              </Badge>
            {/each}
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}

  <!-- Chart -->
  <Card class="mb-6">
    <CardHeader>
      <CardTitle>
        {#if storeState.selectedMetric}
          {storeState.selectedMetric}
          <Badge variant="outline" class="ml-2 text-xs">
            {storeState.selectedAggregation} / {storeState.selectedInterval}
          </Badge>
        {:else}
          Time Series
        {/if}
      </CardTitle>
    </CardHeader>
    <CardContent>
      {#if storeState.timeseriesLoading}
        <div class="flex items-center justify-center h-[350px]">
          <div
            class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
          ></div>
        </div>
      {:else if storeState.timeseriesError}
        <div
          class="flex items-center justify-center h-[350px] text-destructive"
        >
          <p>Error: {storeState.timeseriesError}</p>
        </div>
      {:else if !storeState.selectedMetric}
        <div
          class="flex flex-col items-center justify-center h-[350px] text-muted-foreground"
        >
          <BarChart3 class="w-12 h-12 mb-3 opacity-50" />
          <p>Select a metric to visualize</p>
        </div>
      {:else}
        <div bind:this={chartContainer} class="h-[350px] w-full"></div>
      {/if}
    </CardContent>
  </Card>

  <!-- Data table -->
  {#if storeState.selectedMetric}
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>
            {#if storeState.dataPoints}
              {storeState.dataPoints.total} data
              {storeState.dataPoints.total === 1 ? "point" : "points"}
            {:else}
              Data Points
            {/if}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {#if storeState.dataPointsLoading}
          <div class="flex items-center justify-center h-32">
            <div
              class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
            ></div>
          </div>
        {:else if storeState.dataPoints && storeState.dataPoints.metrics.length > 0}
          <div class="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[180px]">Time</TableHead>
                  <TableHead class="w-[120px]">Value</TableHead>
                  <TableHead class="w-[100px]">Type</TableHead>
                  <TableHead class="w-[140px]">Service</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead class="w-[100px]">Exemplar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each storeState.dataPoints.metrics as point}
                  <TableRow>
                    <TableCell class="font-mono text-xs">
                      {formatDateTime(point.time)}
                    </TableCell>
                    <TableCell class="font-mono text-sm font-medium">
                      {typeof point.value === "number"
                        ? point.value.toFixed(4)
                        : point.value}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{point.metricType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{point.serviceName}</Badge>
                    </TableCell>
                    <TableCell
                      class="font-mono text-xs max-w-xs truncate"
                      title={point.attributes
                        ? JSON.stringify(point.attributes)
                        : ""}
                    >
                      {truncateJson(point.attributes)}
                    </TableCell>
                    <TableCell>
                      {#if point.hasExemplars && point.exemplars?.length}
                        {#each point.exemplars.filter((e) => e.traceId) as exemplar}
                          <button
                            class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            onclick={() => {
                              if (exemplar.traceId) goToTrace(exemplar.traceId);
                            }}
                          >
                            <ExternalLink class="w-3 h-3" />
                            Trace
                          </button>
                        {/each}
                        {#if !point.exemplars.some((e) => e.traceId)}
                          <span class="text-xs text-muted-foreground">-</span>
                        {/if}
                      {:else}
                        <span class="text-xs text-muted-foreground">-</span>
                      {/if}
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </div>

          {#if storeState.dataPoints.hasMore}
            <div class="mt-4 text-center">
              <p class="text-sm text-muted-foreground">
                Showing {storeState.dataPoints.metrics.length} of {storeState
                  .dataPoints.total} data points
              </p>
            </div>
          {/if}
        {:else}
          <div
            class="flex flex-col items-center justify-center h-32 text-muted-foreground"
          >
            <Activity class="w-8 h-8 mb-2 opacity-50" />
            <p>No data points found for the selected metric and time range</p>
          </div>
        {/if}
      </CardContent>
    </Card>
  {/if}
</div>
