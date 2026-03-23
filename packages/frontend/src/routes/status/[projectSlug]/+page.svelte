<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiUrl } from '$lib/config';
  import { page } from '$app/state';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import CheckCircle from '@lucide/svelte/icons/check-circle';
  import XCircle from '@lucide/svelte/icons/x-circle';
  import MinusCircle from '@lucide/svelte/icons/minus-circle';
  import Activity from '@lucide/svelte/icons/activity';

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

  interface StatusPage {
    projectName: string;
    projectSlug: string;
    overallStatus: 'operational' | 'degraded' | 'outage';
    monitors: MonitorStatus[];
    lastUpdated: string;
  }

  const slug = $derived(page.params.projectSlug);

  let data = $state<StatusPage | null>(null);
  let loading = $state(true);
  let notFound = $state(false);
  let fetchError = $state<string | null>(null);

  async function load() {
    loading = true;
    fetchError = null;
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
    // Refresh every 60 seconds
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

  function monitorStatusIcon(s: string) {
    if (s === 'up') return CheckCircle;
    if (s === 'down') return XCircle;
    return MinusCircle;
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
  <title>{data?.projectName ?? slug} — Status</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-12">
  {#if loading}
    <div class="flex items-center justify-center py-24">
      <RefreshCw class="h-7 w-7 animate-spin text-muted-foreground" />
    </div>
  {:else if notFound}
    <div class="text-center py-24">
      <Activity class="mx-auto h-12 w-12 text-muted-foreground mb-4" />
      <h1 class="text-2xl font-semibold mb-2">Status page not found</h1>
      <p class="text-muted-foreground">The project <code class="font-mono">{slug}</code> does not have a public status page.</p>
    </div>
  {:else if fetchError}
    <div class="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive text-center">
      {fetchError}
    </div>
  {:else if data}
    <!-- Page header -->
    <div class="mb-8 text-center">
      <div class="flex items-center justify-center gap-2 mb-2">
        <Activity class="h-6 w-6 text-primary" />
        <h1 class="text-2xl font-bold">{data.projectName}</h1>
      </div>
      <p class="text-sm text-muted-foreground">Service status</p>
    </div>

    <!-- Overall status banner -->
    <div class="rounded-xl border p-5 mb-8 {statusBg(data.overallStatus)}">
      <div class="flex items-center gap-3">
        {#if data.overallStatus === 'operational'}
          <CheckCircle class="h-6 w-6 text-green-500" />
        {:else if data.overallStatus === 'degraded'}
          <MinusCircle class="h-6 w-6 text-yellow-500" />
        {:else}
          <XCircle class="h-6 w-6 text-red-500" />
        {/if}
        <span class="text-lg font-semibold {overallStatusColor(data.overallStatus)}">
          {overallStatusLabel(data.overallStatus)}
        </span>
      </div>
    </div>

    <!-- Monitors -->
    {#if data.monitors.length === 0}
      <p class="text-center text-muted-foreground py-8">No monitors configured</p>
    {:else}
      <div class="space-y-3">
        {#each data.monitors as monitor (monitor.name)}
          <div class="rounded-lg border bg-card p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                {#if monitor.status === 'up'}
                  <CheckCircle class="h-4 w-4 text-green-500" />
                {:else if monitor.status === 'down'}
                  <XCircle class="h-4 w-4 text-red-500" />
                {:else}
                  <MinusCircle class="h-4 w-4 text-gray-400" />
                {/if}
                <span class="font-medium">{monitor.name}</span>
                <span class="text-xs text-muted-foreground capitalize">({monitor.type})</span>
              </div>
              <div class="flex items-center gap-3">
                {#if avgUptime(monitor.uptimeHistory) != null}
                  <span class="text-xs text-muted-foreground">{avgUptime(monitor.uptimeHistory)}% uptime</span>
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
                    class="flex-1 rounded-sm {uptimeBarColor(bucket.uptimePct)} min-h-[3px] transition-all"
                    style="height: {Math.max(8, (bucket.uptimePct / 100) * 32)}px; min-height: 3px"
                    title="{new Date(bucket.bucket).toLocaleDateString()} — {bucket.uptimePct.toFixed(1)}%"
                  ></div>
                {/each}
              </div>
              <div class="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{Math.min(monitor.uptimeHistory.length, 60)} days ago</span>
                <span>Today</span>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    <!-- Footer -->
    <div class="mt-8 text-center text-xs text-muted-foreground">
      <p>Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
      <p class="mt-1">Powered by <a href="https://logtide.dev" class="hover:underline">LogTide</a></p>
    </div>
  {/if}
</div>
