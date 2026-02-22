<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { currentOrganization } from "$lib/stores/organization";
  import { authStore } from "$lib/stores/auth";
  import { ProjectsAPI } from "$lib/api/projects";
  import {
    tracesAPI,
    type EnrichedServiceDependencies,
    type EnrichedServiceDependencyNode,
  } from "$lib/api/traces";
  import ServiceMap from "$lib/components/ServiceMap.svelte";
  import type { Project } from "@logtide/shared";
  import Button from "$lib/components/ui/button/button.svelte";
  import Label from "$lib/components/ui/label/label.svelte";
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import * as Select from "$lib/components/ui/select";
  import Network from "@lucide/svelte/icons/network";
  import Download from "@lucide/svelte/icons/download";
  import X from "@lucide/svelte/icons/x";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import ArrowLeft from "@lucide/svelte/icons/arrow-left";
  import Spinner from "$lib/components/Spinner.svelte";
  import TimeRangePicker, {
    type TimeRangeType,
  } from "$lib/components/TimeRangePicker.svelte";
  import { layoutStore } from "$lib/stores/layout";

  let maxWidthClass = $state("max-w-7xl");
  let containerPadding = $state("px-6 py-8");

  $effect(() => {
    const unsubscribe = layoutStore.maxWidthClass.subscribe((v) => {
      maxWidthClass = v;
    });
    return unsubscribe;
  });

  $effect(() => {
    const unsubscribe = layoutStore.containerPadding.subscribe((v) => {
      containerPadding = v;
    });
    return unsubscribe;
  });

  let token = $state<string | null>(null);
  authStore.subscribe((state) => {
    token = state.token;
  });
  let projectsAPI = $derived(new ProjectsAPI(() => token));

  let projects = $state<Project[]>([]);
  let selectedProject = $state<string | null>(null);
  let mapData = $state<EnrichedServiceDependencies | null>(null);
  let isLoading = $state(false);
  let loadError = $state<string | null>(null);
  let lastLoadedOrg = $state<string | null>(null);

  // Side panel
  let selectedNode = $state<EnrichedServiceDependencyNode | null>(null);

  // Time range
  let timeRangePicker = $state<ReturnType<typeof TimeRangePicker> | null>(
    null,
  );
  let timeRangeType = $state<TimeRangeType>("last_24h");

  function getTimeRange(): { from: Date; to: Date } {
    if (timeRangePicker) return timeRangePicker.getTimeRange();
    const now = new Date();
    return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now };
  }

  onMount(() => {
    if ($currentOrganization) loadProjects();
  });

  $effect(() => {
    if (!$currentOrganization) {
      projects = [];
      mapData = null;
      lastLoadedOrg = null;
      return;
    }
    if ($currentOrganization.id === lastLoadedOrg) return;
    loadProjects();
    lastLoadedOrg = $currentOrganization.id;
  });

  async function loadProjects() {
    if (!$currentOrganization) return;
    try {
      const response = await projectsAPI.getProjects($currentOrganization.id);
      projects = response.projects;
      if (projects.length > 0 && !selectedProject) {
        selectedProject = projects[0].id;
        loadMap();
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
      projects = [];
    }
  }

  async function loadMap() {
    if (!selectedProject) {
      mapData = null;
      return;
    }
    isLoading = true;
    loadError = null;
    try {
      const { from, to } = getTimeRange();
      mapData = await tracesAPI.getServiceMap(
        selectedProject,
        from.toISOString(),
        to.toISOString(),
      );
    } catch (e) {
      console.error("Failed to load service map:", e);
      loadError = "Failed to load service map data.";
      mapData = null;
    } finally {
      isLoading = false;
    }
  }

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
    if (errorRate >= 0.1)
      return { label: "Unhealthy", variant: "destructive" };
    if (errorRate >= 0.01) return { label: "Degraded", variant: "default" };
    return { label: "Healthy", variant: "secondary" };
  }

  function formatLatency(ms: number): string {
    if (ms < 1) return "<1ms";
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  function exportAsPng() {
    const canvas = document.querySelector(
      ".service-map canvas",
    ) as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `service-map-${selectedProject}-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  function viewTraces(serviceName: string) {
    goto(
      `/dashboard/traces?service=${encodeURIComponent(serviceName)}&projectId=${selectedProject}`,
    );
  }

  // Computed: downstream/upstream edges for selected node
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
</script>

<svelte:head>
  <title>Service Map - LogTide</title>
</svelte:head>

<div class="container mx-auto {containerPadding} {maxWidthClass}">
  <!-- Header -->
  <div class="mb-6">
    <div class="flex items-center gap-3 mb-2">
      <Network class="w-8 h-8 text-primary" />
      <h1 class="text-3xl font-bold tracking-tight">Service Map</h1>
    </div>
    <p class="text-muted-foreground">
      Visualize service dependencies and correlations across your infrastructure
    </p>
  </div>

  <!-- Filters -->
  <Card class="mb-6">
    <CardHeader>
      <CardTitle>Filters</CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div class="space-y-2">
          <Label>Project</Label>
          <Select.Root
            type="single"
            value={selectedProject || ""}
            onValueChange={(v) => {
              if (v) {
                selectedProject = v;
                selectedNode = null;
                loadMap();
              }
            }}
          >
            <Select.Trigger class="w-full">
              {projects.find((p) => p.id === selectedProject)?.name ||
                "Select project"}
            </Select.Trigger>
            <Select.Content>
              {#each projects as project}
                <Select.Item value={project.id}>{project.name}</Select.Item>
              {/each}
            </Select.Content>
          </Select.Root>
        </div>

        <div class="space-y-2 col-span-2">
          <Label>Time Range</Label>
          <TimeRangePicker
            bind:this={timeRangePicker}
            initialType={timeRangeType}
            onchange={() => {
              selectedNode = null;
              loadMap();
            }}
          />
        </div>
      </div>
    </CardContent>
  </Card>

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
        <span
          class="border-t-2 border-dashed border-muted-foreground w-6 inline-block"
        ></span>
        <span>Log correlation</span>
      </div>
    </div>
    <Button variant="outline" size="sm" onclick={exportAsPng}>
      <Download class="w-4 h-4 mr-2" />
      Export PNG
    </Button>
  </div>

  <!-- Main layout: graph + optional side panel -->
  <div class="flex gap-4">
    <!-- Graph -->
    <div class="flex-1 min-w-0">
      <Card>
        <CardContent class="pt-6">
          {#if isLoading}
            <div class="flex items-center justify-center h-[500px]">
              <Spinner size="lg" />
            </div>
          {:else if loadError}
            <div
              class="flex items-center justify-center h-[500px] text-destructive"
            >
              <p>{loadError}</p>
            </div>
          {:else if mapData && mapData.nodes.length > 0}
            <ServiceMap
              dependencies={mapData}
              height="600px"
              onNodeClick={handleNodeClick}
            />
          {:else if mapData}
            <div
              class="flex items-center justify-center h-[500px] text-muted-foreground"
            >
              <div class="text-center">
                <Network class="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p class="font-medium">No service dependencies found</p>
                <p class="text-sm mt-1">
                  Send traces with parent-child spans or logs with trace_id to
                  see service relationships
                </p>
              </div>
            </div>
          {:else}
            <div
              class="flex items-center justify-center h-[500px] text-muted-foreground"
            >
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
                <p
                  class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1"
                >
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
                          <Badge
                            variant="outline"
                            class="text-[10px] px-1 py-0">log</Badge
                          >
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
                <p
                  class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1"
                >
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
                          <Badge
                            variant="outline"
                            class="text-[10px] px-1 py-0">log</Badge
                          >
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            <Button class="w-full" onclick={() => viewTraces(selectedNode!.name)}>
              View Traces
            </Button>
          </CardContent>
        </Card>
      </div>
    {/if}
  </div>
</div>
