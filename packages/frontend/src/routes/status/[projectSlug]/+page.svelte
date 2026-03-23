<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiUrl } from '$lib/config';
  import { page } from '$app/stores';

  interface UptimeBar {
    bucket: string;
    uptimePct: number;
  }

  interface MonitorStatus {
    name: string;
    type: string;
    status: 'up' | 'down' | 'unknown';
    uptimeHistory: UptimeBar[];
  }

  interface StatusPageData {
    projectName: string;
    projectSlug: string;
    overallStatus: 'operational' | 'degraded' | 'outage';
    monitors: MonitorStatus[];
    lastUpdated: string;
  }

  let data = $state<StatusPageData | null>(null);
  let loading = $state(true);
  let notFound = $state(false);
  let fetchError = $state<string | null>(null);

  async function load() {
    const slug = $page.params.projectSlug;
    if (!slug) return;
    loading = true;
    fetchError = null;
    notFound = false;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/status/project/${slug}`);
      if (res.status === 404) {
        notFound = true;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      fetchError = err instanceof Error ? err.message : 'Failed to load status';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  });

  function overallStatusColor(s: string) {
    if (s === 'operational') return 'text-green-600';
    if (s === 'degraded') return 'text-yellow-600';
    return 'text-red-600';
  }

  function overallStatusLabel(s: string) {
    if (s === 'operational') return 'All systems operational';
    if (s === 'degraded') return 'Partial outage';
    return 'Major outage';
  }

  function statusBg(s: string) {
    if (s === 'operational') return 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900';
    if (s === 'degraded') return 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900';
    return 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900';
  }

  function monitorStatusColor(s: string) {
    if (s === 'up') return 'text-green-500';
    if (s === 'down') return 'text-red-500';
    return 'text-gray-400';
  }

  function monitorStatusLabel(s: string) {
    if (s === 'up') return 'Operational';
    if (s === 'down') return 'Outage';
    return 'Unknown';
  }

  function uptimeBarColor(pct: number) {
    if (pct >= 99) return 'bg-green-500';
    if (pct >= 95) return 'bg-yellow-400';
    if (pct > 0) return 'bg-red-500';
    return 'bg-gray-200 dark:bg-gray-700';
  }

  function avgUptime(history: UptimeBar[]) {
    if (history.length === 0) return null;
    const avg = history.reduce((sum, b) => sum + b.uptimePct, 0) / history.length;
    return avg.toFixed(2);
  }
</script>

<svelte:head>
  <title>{data?.projectName ?? $page.params.projectSlug} — Status</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-12">
  {#if loading}
    <div class="flex items-center justify-center py-24">
      <svg class="h-7 w-7 animate-spin text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.22-8.56" />
      </svg>
    </div>
  {:else if notFound}
    <div class="text-center py-24">
      <h1 class="text-2xl font-semibold mb-2">Status page not found</h1>
      <p class="text-gray-500">The project <code class="font-mono">{$page.params.projectSlug}</code> does not have a public status page.</p>
    </div>
  {:else if fetchError}
    <div class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-600 text-center">
      {fetchError}
    </div>
  {:else if data}
    <!-- Page header -->
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold">{data.projectName}</h1>
      <p class="text-sm text-gray-500 mt-1">Service status</p>
    </div>

    <!-- Overall status banner -->
    <div class="rounded-xl border p-5 mb-8 {statusBg(data.overallStatus)}">
      <div class="flex items-center gap-3">
        {#if data.overallStatus === 'operational'}
          <span class="text-green-500 text-xl">&#10003;</span>
        {:else if data.overallStatus === 'degraded'}
          <span class="text-yellow-500 text-xl">&#9888;</span>
        {:else}
          <span class="text-red-500 text-xl">&#10007;</span>
        {/if}
        <span class="text-lg font-semibold {overallStatusColor(data.overallStatus)}">
          {overallStatusLabel(data.overallStatus)}
        </span>
      </div>
    </div>

    <!-- Monitors -->
    {#if data.monitors.length === 0}
      <p class="text-center text-gray-500 py-8">No monitors configured</p>
    {:else}
      <div class="space-y-3">
        {#each data.monitors as monitor (monitor.name)}
          <div class="rounded-lg border bg-white dark:bg-gray-900 p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                {#if monitor.status === 'up'}
                  <span class="h-2.5 w-2.5 rounded-full bg-green-500"></span>
                {:else if monitor.status === 'down'}
                  <span class="h-2.5 w-2.5 rounded-full bg-red-500"></span>
                {:else}
                  <span class="h-2.5 w-2.5 rounded-full bg-gray-400"></span>
                {/if}
                <span class="font-medium">{monitor.name}</span>
                <span class="text-xs text-gray-500 capitalize">({monitor.type})</span>
              </div>
              <div class="flex items-center gap-3">
                {#if avgUptime(monitor.uptimeHistory) != null}
                  <span class="text-xs text-gray-500">{avgUptime(monitor.uptimeHistory)}% uptime</span>
                {/if}
                <span class="text-sm font-medium {monitorStatusColor(monitor.status)}">
                  {monitorStatusLabel(monitor.status)}
                </span>
              </div>
            </div>

            <!-- Uptime bar -->
            {#if monitor.uptimeHistory.length > 0}
              <div class="flex items-end gap-0.5 h-8">
                {#each monitor.uptimeHistory.slice(-60) as bucket}
                  <div
                    class="flex-1 rounded-sm {uptimeBarColor(bucket.uptimePct)} transition-all"
                    style="height: {Math.max(8, (bucket.uptimePct / 100) * 32)}px; min-height: 3px"
                    title="{new Date(bucket.bucket).toLocaleDateString()} — {bucket.uptimePct.toFixed(1)}%"
                  ></div>
                {/each}
              </div>
              <div class="mt-1 flex justify-between text-xs text-gray-500">
                <span>{Math.min(monitor.uptimeHistory.length, 60)} days ago</span>
                <span>Today</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Footer -->
    <div class="mt-8 text-center text-xs text-gray-500">
      <p>Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
      <p class="mt-1">Powered by <a href="https://logtide.dev" class="hover:underline">LogTide</a></p>
    </div>
  {/if}
</div>
