<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiUrl } from '$lib/config';
  import { page } from '$app/stores';

  interface UptimeBar {
    bucket: string;
    uptimePct: number | string;
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

  // uptimePct comes as string from Postgres ROUND — coerce to number
  function pct(v: number | string): number {
    return typeof v === 'string' ? parseFloat(v) : v;
  }

  function uptimeBarColor(val: number | string) {
    const p = pct(val);
    if (p >= 99) return 'bg-green-500';
    if (p >= 95) return 'bg-yellow-400';
    if (p > 0) return 'bg-red-500';
    return 'bg-gray-200 dark:bg-gray-700';
  }

  function avgUptime(history: UptimeBar[]) {
    if (history.length === 0) return null;
    const avg = history.reduce((sum, b) => sum + pct(b.uptimePct), 0) / history.length;
    return avg.toFixed(2);
  }
</script>

<svelte:head>
  <title>{data?.projectName ?? $page.params.projectSlug} — Status</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-12">
  {#if loading}
    <div class="flex items-center justify-center py-24">
      <div class="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-gray-600"></div>
    </div>
  {:else if notFound}
    <div class="text-center py-24">
      <h1 class="text-2xl font-semibold mb-2">Status page not found</h1>
      <p class="text-muted-foreground">The project <code class="font-mono">{$page.params.projectSlug}</code> does not have a public status page.</p>
    </div>
  {:else if fetchError}
    <div class="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive text-center">
      {fetchError}
    </div>
  {:else if data}
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold">{data.projectName}</h1>
      <p class="text-sm text-muted-foreground mt-1">Service status</p>
    </div>

    {#if data.overallStatus === 'operational'}
      <div class="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900 p-5 mb-8">
        <span class="text-lg font-semibold text-green-600">&#10003; All systems operational</span>
      </div>
    {:else if data.overallStatus === 'degraded'}
      <div class="rounded-xl border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-900 p-5 mb-8">
        <span class="text-lg font-semibold text-yellow-600">&#9888; Partial outage</span>
      </div>
    {:else}
      <div class="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-5 mb-8">
        <span class="text-lg font-semibold text-red-600">&#10007; Major outage</span>
      </div>
    {/if}

    {#if data.monitors.length === 0}
      <p class="text-center text-muted-foreground py-8">No monitors configured</p>
    {:else}
      <div class="space-y-3">
        {#each data.monitors as monitor (monitor.name)}
          <div class="rounded-lg border bg-card p-4">
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
                <span class="text-xs text-muted-foreground capitalize">({monitor.type})</span>
              </div>
              <div class="flex items-center gap-3">
                {#if avgUptime(monitor.uptimeHistory) != null}
                  <span class="text-xs text-muted-foreground">{avgUptime(monitor.uptimeHistory)}% uptime</span>
                {/if}
                {#if monitor.status === 'up'}
                  <span class="text-sm font-medium text-green-500">Operational</span>
                {:else if monitor.status === 'down'}
                  <span class="text-sm font-medium text-red-500">Outage</span>
                {:else}
                  <span class="text-sm font-medium text-gray-400">Unknown</span>
                {/if}
              </div>
            </div>

            {#if monitor.uptimeHistory.length > 0}
              <div class="flex items-end gap-0.5 h-8">
                {#each monitor.uptimeHistory.slice(-60) as bucket}
                  <div
                    class="flex-1 rounded-sm {uptimeBarColor(bucket.uptimePct)} transition-all"
                    style="height: {Math.max(8, (pct(bucket.uptimePct) / 100) * 32)}px; min-height: 3px"
                    title="{new Date(bucket.bucket).toLocaleDateString()} — {pct(bucket.uptimePct).toFixed(1)}%"
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

    <div class="mt-8 text-center text-xs text-muted-foreground">
      <p>Last updated: {new Date(data.lastUpdated).toLocaleString()}</p>
      <p class="mt-1">Powered by <a href="https://logtide.dev" class="hover:underline">LogTide</a></p>
    </div>
  {/if}
</div>
