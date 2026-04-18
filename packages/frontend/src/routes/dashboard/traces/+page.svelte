<script lang="ts">
  import { onMount, onDestroy, untrack } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { currentOrganization } from "$lib/stores/organization";
  import { authStore } from "$lib/stores/auth";
  import { ProjectsAPI } from "$lib/api/projects";
  import type { Project } from "@logtide/shared";
  import {
    tracesAPI,
    type TraceRecord,
    type TraceStats,
    type EnrichedServiceDependencies,
    type EnrichedServiceDependencyNode,
  } from "$lib/api/traces";
  import ServiceMap from "$lib/components/ServiceMap.svelte";
  import Button from "$lib/components/ui/button/button.svelte";
  import Label from "$lib/components/ui/label/label.svelte";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
  } from "$lib/components/ui/table";
  import * as Select from "$lib/components/ui/select";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import AlertCircle from "@lucide/svelte/icons/alert-circle";
  import Timer from "@lucide/svelte/icons/timer";
  import Layers from "@lucide/svelte/icons/layers";
  import Network from "@lucide/svelte/icons/network";
  import List from "@lucide/svelte/icons/list";
  import Download from "@lucide/svelte/icons/download";
  import X from "@lucide/svelte/icons/x";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import EmptyTraces from "$lib/components/EmptyTraces.svelte";
  import Spinner from "$lib/components/Spinner.svelte";
  import { SkeletonTable, TableLoadingOverlay } from "$lib/components/ui/skeleton";
  import { layoutStore } from "$lib/stores/layout";
  import { toastStore } from "$lib/stores/toast";

  let token = $state<string | null>(null);
  let maxWidthClass = $state("max-w-7xl");
  let containerPadding = $state("px-6 py-8");

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

  let traces = $state<TraceRecord[]>([]);
  let stats = $state<TraceStats | null>(null);
  let totalTraces = $state(0);
  let isLoading = $state(false);
  let availableServices = $state<string[]>([]);

  // View toggle: list or map
  let activeView = $state<'list' | 'map'>('list');

  // List view filters
  let selectedService = $state<string | null>(null);
  let errorOnly = $state(false);

  // Map view state
  let mapData = $state<EnrichedServiceDependencies | null>(null);
  let isLoadingMap = $state(false);
  let mapLoadError = $state<string | null>(null);
  let selectedNode = $state<EnrichedServiceDependencyNode | null>(null);

  const unsubAuthStore = authStore.subscribe((state) => {
    token = state.token;
  });

  onDestroy(() => {
    unsubAuthStore();
  });

  // Local project and time range state
  let projects = $state<Project[]>([]);
  let selectedProject = $state<string | null>(null);
  let timeRangeType = $state<'last_hour' | 'last_24h' | 'last_7d' | 'custom'>('last_24h');
  let customFrom = $state<string | null>(null);
  let customTo = $state<string | null>(null);

  let projectsAPI = $derived(new ProjectsAPI(() => token));

  async function loadProjects() {
    if (!$currentOrganization) return;
    try {
      const [res, availability] = await Promise.all([
        projectsAPI.getProjects($currentOrganization.id),
        projectsAPI.getProjectDataAvailability($currentOrganization.id).catch(() => null),
      ]);
      const tracesProjectIds = availability?.traces;
      projects = tracesProjectIds
        ? res.projects.filter((p) => tracesProjectIds.includes(p.id))
        : res.projects;
      if (projects.length > 0 && !selectedProject) {
        selectedProject = projects[0].id;
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
    }
  }

  function getTimeRange(): { from: Date; to: Date } {
    const now = new Date();
    switch (timeRangeType) {
      case 'last_hour':
        return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now };
      case 'last_24h':
        return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
      case 'last_7d':
        return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now };
      case 'custom':
        return {
          from: customFrom ? new Date(customFrom) : new Date(now.getTime() - 24 * 60 * 60 * 1000),
          to: customTo ? new Date(customTo) : now,
        };
      default:
        return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
    }
  }

  // Pagination
  let pageSize = $state(25);
  let currentPage = $state(1);
  let totalPages = $derived(Math.ceil(totalTraces / pageSize));

  let lastLoadedOrg = $state<string | null>(null);

  onMount(() => {
    // Read URL params for cross-page links
    const urlService = page.url.searchParams.get('service');
    const urlProjectId = page.url.searchParams.get('projectId');
    const urlFrom = page.url.searchParams.get('from');
    const urlTo = page.url.searchParams.get('to');

    if (urlService) {
      selectedService = urlService;
    }

    if (urlProjectId) {
      selectedProject = urlProjectId;
    }

    if (urlFrom && urlTo) {
      timeRangeType = 'custom';
      customFrom = urlFrom;
      customTo = urlTo;
    }

    loadProjects();
  });

  // React to organization changes
  $effect(() => {
    if (!$currentOrganization) {
      traces = [];
      lastLoadedOrg = null;
      return;
    }

    if ($currentOrganization.id === lastLoadedOrg) return;
    lastLoadedOrg = $currentOrganization.id;
    selectedProject = null;
    loadProjects();
  });

  // React to project or time range changes
  $effect(() => {
    // track
    selectedProject;
    timeRangeType;

    untrack(() => {
      if (!selectedProject) {
        traces = [];
        totalTraces = 0;
        stats = null;
        availableServices = [];
        mapData = null;
        return;
      }

      currentPage = 1;
      loadTraces();
      loadServices();

      if (activeView === 'map') {
        loadMap();
      }
    });
  });

  async function loadTraces() {
    if (!selectedProject) {
      traces = [];
      totalTraces = 0;
      return;
    }

    isLoading = true;

    try {
      const timeRange = getTimeRange();
      const offset = (currentPage - 1) * pageSize;

      const response = await tracesAPI.getTraces({
        projectId: selectedProject,
        service: selectedService || undefined,
        error: errorOnly || undefined,
        from: timeRange.from.toISOString(),
        to: timeRange.to.toISOString(),
        limit: pageSize,
        offset: offset,
      });

      traces = response.traces;
      totalTraces = response.total;

      const statsResponse = await tracesAPI.getStats(
        selectedProject,
        timeRange.from.toISOString(),
        timeRange.to.toISOString()
      );
      stats = statsResponse;
    } catch (e) {
      console.error("Failed to load traces:", e);
      toastStore.error('Failed to load traces');
      traces = [];
    } finally {
      isLoading = false;
    }
  }

  async function loadServices() {
    if (!selectedProject) {
      availableServices = [];
      return;
    }

    try {
      availableServices = await tracesAPI.getServices(selectedProject);
    } catch (e) {
      console.error("Failed to load services:", e);
      availableServices = [];
    }
  }

  async function loadMap() {
    if (!selectedProject) {
      mapData = null;
      return;
    }

    isLoadingMap = true;
    mapLoadError = null;

    try {
      const { from, to } = getTimeRange();
      mapData = await tracesAPI.getServiceMap(
        selectedProject,
        from.toISOString(),
        to.toISOString(),
      );
    } catch (e) {
      console.error("Failed to load service map:", e);
      mapLoadError = "Failed to load service map data.";
      mapData = null;
    } finally {
      isLoadingMap = false;
    }
  }

  // Map view helpers
  function handleNodeClick(nodeName: string) {
    if (!mapData) return;
    selectedNode = mapData.nodes.find((n) => n.name === nodeName) ?? null;
  }

  function closeSidePanel() {
    selectedNode = null;
  }

  function getHealthLabel(errorRate: number): {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  } {
    if (errorRate >= 0.1) return { label: "Unhealthy", variant: "destructive" };
    if (errorRate >= 0.01) return { label: "Degraded", variant: "default" };
    return { label: "Healthy", variant: "secondary" };
  }

  function exportMapPng() {
    const canvas = document.querySelector(
      ".service-map canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `service-map-${selectedProject}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function viewTracesForService(serviceName: string) {
    selectedService = serviceName;
    selectedNode = null;
    activeView = 'list';
    currentPage = 1;
    loadTraces();
  }

  let downstreamEdges = $derived(
    mapData && selectedNode
      ? mapData.edges.filter((e) => e.source === selectedNode!.name)
      : [],
  );

  let upstreamEdges = $derived(
    mapData && selectedNode
      ? mapData.edges.filter((e) => e.target === selectedNode!.name)
      : [],
  );

  // Switch view handler
  function switchView(view: 'list' | 'map') {
    activeView = view;
    if (view === 'map' && !mapData && selectedProject) {
      loadMap();
    }
  }

  // List view helpers
  function goToPage(pg: number) {
    if (pg >= 1 && pg <= totalPages && pg !== currentPage) {
      currentPage = pg;
      loadTraces();
    }
  }

  function nextPage() {
    if (currentPage < totalPages) {
      currentPage++;
      loadTraces();
    }
  }

  function previousPage() {
    if (currentPage > 1) {
      currentPage--;
      loadTraces();
    }
  }

  function applyFilters() {
    currentPage = 1;
    loadTraces();
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

  function formatDuration(ms: number): string {
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  function formatLatency(ms: number): string {
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function viewTrace(traceId: string) {
    if (selectedProject) {
      goto(`/dashboard/traces/${traceId}?projectId=${selectedProject}`);
    }
  }
</script>

<svelte:head>
  <title>Traces - LogTide</title>
</svelte:head>

<div class="container mx-auto {containerPadding} {maxWidthClass}">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center gap-3 mb-2">
      <GitBranch class="w-8 h-8 text-primary" />
      <h1 class="text-3xl font-bold tracking-tight">Distributed Traces</h1>
    </div>
    <p class="text-muted-foreground">
      View and analyze distributed traces from your applications
    </p>
  </div>

  <!-- Stats cards -->
  {#if stats}
    <div class="grid gap-4 md:grid-cols-4 mb-6">
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <GitBranch class="w-5 h-5 text-muted-foreground" />
            <div>
              <p class="text-sm text-muted-foreground">Total Traces</p>
              <p class="text-2xl font-bold">{stats.total_traces}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <Layers class="w-5 h-5 text-muted-foreground" />
            <div>
              <p class="text-sm text-muted-foreground">Total Spans</p>
              <p class="text-2xl font-bold">{stats.total_spans}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <Timer class="w-5 h-5 text-muted-foreground" />
            <div>
              <p class="text-sm text-muted-foreground">Avg Duration</p>
              <p class="text-2xl font-bold">{formatDuration(stats.avg_duration_ms)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <div class="flex items-center gap-3">
            <AlertCircle class="w-5 h-5 text-red-500" />
            <div>
              <p class="text-sm text-muted-foreground">Error Rate</p>
              <p class="text-2xl font-bold">{(stats.error_rate * 100).toFixed(1)}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  {/if}

  <!-- View switcher -->
  <div class="flex items-center gap-2 mb-6">
    <div class="inline-flex items-center rounded-lg border bg-card p-1">
      <Button
        variant={activeView === 'list' ? 'default' : 'ghost'}
        size="sm"
        onclick={() => switchView('list')}
        class="gap-2"
      >
        <List class="w-4 h-4" />
        List
      </Button>
      <Button
        variant={activeView === 'map' ? 'default' : 'ghost'}
        size="sm"
        onclick={() => switchView('map')}
        class="gap-2"
      >
        <Network class="w-4 h-4" />
        Map
      </Button>
    </div>
  </div>

  <!-- Filters (visible in both list and map views) -->
  <Card class="mb-6">
    <CardHeader>
      <CardTitle>Filters</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div class="space-y-2">
          <Label>Project</Label>
          <Select.Root
            type="single"
            value={selectedProject || ""}
            onValueChange={(v) => {
              selectedProject = v || null;
            }}
          >
            <Select.Trigger class="w-full">
              {projects.find(p => p.id === selectedProject)?.name || "Select project"}
            </Select.Trigger>
            <Select.Content>
              {#each projects as project}
                <Select.Item value={project.id}>{project.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2">
          <Label>Time Range</Label>
          <Select.Root
            type="single"
            value={timeRangeType}
            onValueChange={(v) => {
              if (v) timeRangeType = v as typeof timeRangeType;
            }}
          >
            <Select.Trigger class="w-full">
              {timeRangeType === 'last_hour' ? 'Last Hour' : timeRangeType === 'last_24h' ? 'Last 24 Hours' : timeRangeType === 'last_7d' ? 'Last 7 Days' : 'Custom'}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="last_hour">Last Hour</Select.Item>
              <Select.Item value="last_24h">Last 24 Hours</Select.Item>
              <Select.Item value="last_7d">Last 7 Days</Select.Item>
              {#if timeRangeType === 'custom'}
                <Select.Item value="custom">Custom</Select.Item>
              {/if}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2">
          <Label>Service</Label>
          <Select.Root
            type="single"
            value={selectedService || ""}
            onValueChange={(v) => {
              selectedService = v || null;
              applyFilters();
            }}
          >
            <Select.Trigger class="w-full">
              {selectedService || "All services"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="">All services</Select.Item>
              {#each availableServices as service}
                <Select.Item value={service}>{service}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2">
          <Label>Status</Label>
          <Select.Root
            type="single"
            value={errorOnly ? "error" : "all"}
            onValueChange={(v) => {
              errorOnly = v === "error";
              applyFilters();
            }}
          >
            <Select.Trigger class="w-full">
              {errorOnly ? "Errors only" : "All traces"}
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="all">All traces</Select.Item>
              <Select.Item value="error">Errors only</Select.Item>
            </Select.Content>
          </Select.Root>
        </div>
      </div>
    </CardContent>
  </Card>

  <!-- LIST VIEW -->
  {#if activeView === 'list'}
    <!-- Traces table -->
    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <CardTitle>
            {#if totalTraces > 0}
              {totalTraces.toLocaleString()}
              {totalTraces === 1 ? "trace" : "traces"}
            {:else}
              No traces
            {/if}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {#if isLoading && traces.length === 0}
          <SkeletonTable rows={7} columns={7} />
        {:else if traces.length === 0}
          <EmptyTraces />
        {:else}
          <TableLoadingOverlay loading={isLoading}>
          <div class="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[180px]">Time</TableHead>
                  <TableHead class="w-[150px]">Service</TableHead>
                  <TableHead>Operation</TableHead>
                  <TableHead class="w-[100px]">Duration</TableHead>
                  <TableHead class="w-[80px]">Spans</TableHead>
                  <TableHead class="w-[80px]">Status</TableHead>
                  <TableHead class="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {#each traces as trace}
                  <TableRow
                    class="cursor-pointer hover:bg-muted/50"
                    onclick={() => viewTrace(trace.trace_id)}
                  >
                    <TableCell class="font-mono text-xs">
                      {formatDateTime(trace.start_time)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {trace.root_service_name || trace.service_name}
                      </Badge>
                    </TableCell>
                    <TableCell class="max-w-md truncate">
                      {trace.root_operation_name || "-"}
                    </TableCell>
                    <TableCell class="font-mono text-sm">
                      {formatDuration(trace.duration_ms)}
                    </TableCell>
                    <TableCell class="text-center">
                      {trace.span_count}
                    </TableCell>
                    <TableCell>
                      {#if trace.error}
                        <Badge variant="destructive">Error</Badge>
                      {:else}
                        <Badge variant="secondary">OK</Badge>
                      {/if}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onclick={(e) => {
                          e.stopPropagation();
                          viewTrace(trace.trace_id);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                {/each}
              </TableBody>
            </Table>
          </div>

          {#if traces.length > 0}
            <div class="flex items-center justify-between mt-6 px-2">
              <div class="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * pageSize + 1).toLocaleString()} to {Math.min(
                  currentPage * pageSize,
                  totalTraces,
                ).toLocaleString()} of {totalTraces.toLocaleString()} traces
              </div>
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={previousPage}
                  disabled={currentPage === 1 || isLoading}
                >
                  <ChevronLeft class="w-4 h-4" />
                  Previous
                </Button>
                <div class="flex items-center gap-1">
                  {#if totalPages <= 7}
                    {#each Array.from({ length: totalPages }, (_, i) => i + 1) as pg}
                      <Button
                        variant={currentPage === pg ? "default" : "outline"}
                        size="sm"
                        onclick={() => goToPage(pg)}
                        disabled={isLoading}
                        class="w-10"
                      >
                        {pg}
                      </Button>
                    {/each}
                  {:else if currentPage <= 3}
                    {#each [1, 2, 3, 4] as pg}
                      <Button
                        variant={currentPage === pg ? "default" : "outline"}
                        size="sm"
                        onclick={() => goToPage(pg)}
                        disabled={isLoading}
                        class="w-10"
                      >
                        {pg}
                      </Button>
                    {/each}
                    <span class="px-2">...</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => goToPage(totalPages)}
                      disabled={isLoading}
                      class="w-10"
                    >
                      {totalPages}
                    </Button>
                  {:else if currentPage >= totalPages - 2}
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => goToPage(1)}
                      disabled={isLoading}
                      class="w-10"
                    >
                      1
                    </Button>
                    <span class="px-2">...</span>
                    {#each [totalPages - 3, totalPages - 2, totalPages - 1, totalPages] as pg}
                      <Button
                        variant={currentPage === pg ? "default" : "outline"}
                        size="sm"
                        onclick={() => goToPage(pg)}
                        disabled={isLoading}
                        class="w-10"
                      >
                        {pg}
                      </Button>
                    {/each}
                  {:else}
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => goToPage(1)}
                      disabled={isLoading}
                      class="w-10"
                    >
                      1
                    </Button>
                    <span class="px-2">...</span>
                    {#each [currentPage - 1, currentPage, currentPage + 1] as pg}
                      <Button
                        variant={currentPage === pg ? "default" : "outline"}
                        size="sm"
                        onclick={() => goToPage(pg)}
                        disabled={isLoading}
                        class="w-10"
                      >
                        {pg}
                      </Button>
                    {/each}
                    <span class="px-2">...</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => goToPage(totalPages)}
                      disabled={isLoading}
                      class="w-10"
                    >
                      {totalPages}
                    </Button>
                  {/if}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={nextPage}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  Next
                  <ChevronRight class="w-4 h-4" />
                </Button>
              </div>
            </div>
          {/if}
          </TableLoadingOverlay>
        {/if}
      </CardContent>
    </Card>

  <!-- MAP VIEW -->
  {:else}
    <!-- Legend + Export -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-4 text-sm text-muted-foreground">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
          <span>Healthy (&lt;1%)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
          <span>Degraded (1-10%)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
          <span>Unhealthy (&gt;10%)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="border-t-2 border-dashed border-muted-foreground w-6 inline-block"></span>
          <span>Log correlation</span>
        </div>
      </div>
      <Button variant="outline" size="sm" onclick={exportMapPng}>
        <Download class="w-4 h-4 mr-2" />
        Export PNG
      </Button>
    </div>

    <!-- Graph + side panel -->
    <div class="flex gap-4">
      <!-- Graph -->
      <div class="flex-1 min-w-0">
        <Card>
          <CardContent class="pt-6">
            {#if isLoadingMap}
              <div class="flex items-center justify-center h-[500px]">
                <Spinner size="lg" />
              </div>
            {:else if mapLoadError}
              <div class="flex items-center justify-center h-[500px] text-destructive">
                <p>{mapLoadError}</p>
              </div>
            {:else if mapData && mapData.nodes.length > 0}
              <ServiceMap
                dependencies={mapData}
                height="600px"
                onNodeClick={handleNodeClick}
              />
            {:else if mapData}
              <div class="flex items-center justify-center h-[500px] text-muted-foreground">
                <div class="text-center">
                  <Network class="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p class="font-medium">No service dependencies found</p>
                  <p class="text-sm mt-1">
                    Send traces with parent-child spans or logs with trace_id to see service relationships
                  </p>
                </div>
              </div>
            {:else}
              <div class="flex items-center justify-center h-[500px] text-muted-foreground">
                <p>Select a project to view the service map</p>
              </div>
            {/if}
          </CardContent>
        </Card>
      </div>

      <!-- Side panel -->
      {#if selectedNode}
        {@const health = getHealthLabel(selectedNode.errorRate)}
        <div class="w-80 flex-shrink-0">
          <Card>
            <CardHeader class="flex flex-row items-start justify-between pb-3">
              <div>
                <CardTitle class="text-base">{selectedNode.name}</CardTitle>
                <Badge variant={health.variant} class="mt-1.5">
                  {health.label}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                onclick={closeSidePanel}
              >
                <X class="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent class="space-y-4">
              <!-- Stats grid -->
              <div class="grid grid-cols-2 gap-3">
                <div class="p-3 rounded-lg bg-muted/50">
                  <p class="text-xs text-muted-foreground">Error Rate</p>
                  <p
                    class="text-lg font-bold {selectedNode.errorRate >= 0.1
                      ? 'text-red-500'
                      : selectedNode.errorRate >= 0.01
                        ? 'text-amber-500'
                        : 'text-emerald-500'}"
                  >
                    {(selectedNode.errorRate * 100).toFixed(1)}%
                  </p>
                </div>
                <div class="p-3 rounded-lg bg-muted/50">
                  <p class="text-xs text-muted-foreground">Avg Latency</p>
                  <p class="text-lg font-bold">
                    {formatLatency(selectedNode.avgLatencyMs)}
                  </p>
                </div>
                <div class="p-3 rounded-lg bg-muted/50">
                  <p class="text-xs text-muted-foreground">P95 Latency</p>
                  <p class="text-lg font-bold">
                    {selectedNode.p95LatencyMs != null
                      ? formatLatency(selectedNode.p95LatencyMs)
                      : "N/A"}
                  </p>
                </div>
                <div class="p-3 rounded-lg bg-muted/50">
                  <p class="text-xs text-muted-foreground">Total Calls</p>
                  <p class="text-lg font-bold">
                    {selectedNode.totalCalls.toLocaleString()}
                  </p>
                </div>
              </div>

              <!-- Downstream services -->
              {#if downstreamEdges.length > 0}
                <div>
                  <p class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                    <ArrowRight class="w-3 h-3" />
                    Calls to
                  </p>
                  <div class="space-y-1.5">
                    {#each downstreamEdges as edge}
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-medium truncate">{edge.target}</span>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <span class="text-muted-foreground tabular-nums">
                            {edge.callCount}
                          </span>
                          {#if edge.type === "log_correlation"}
                            <Badge variant="outline" class="text-[10px] px-1 py-0">log</Badge>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Upstream services -->
              {#if upstreamEdges.length > 0}
                <div>
                  <p class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                    <ArrowLeft class="w-3 h-3" />
                    Called by
                  </p>
                  <div class="space-y-1.5">
                    {#each upstreamEdges as edge}
                      <div class="flex items-center justify-between text-sm">
                        <span class="font-medium truncate">{edge.source}</span>
                        <div class="flex items-center gap-2 flex-shrink-0">
                          <span class="text-muted-foreground tabular-nums">
                            {edge.callCount}
                          </span>
                          {#if edge.type === "log_correlation"}
                            <Badge variant="outline" class="text-[10px] px-1 py-0">log</Badge>
                          {/if}
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <Button class="w-full" onclick={() => viewTracesForService(selectedNode!.name)}>
                View Traces
              </Button>
            </CardContent>
          </Card>
        </div>
      {/if}
    </div>
  {/if}
</div>