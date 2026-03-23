<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiUrl } from '$lib/config';
  import { page } from '$app/stores';
  import { themeStore } from '$lib/stores/theme';

  const theme = $derived($themeStore);

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

  function pct(v: number | string): number {
    return typeof v === 'string' ? parseFloat(v) : v;
  }

  function barColor(val: number | string) {
    const p = pct(val);
    if (p >= 99) return 'bg-green-500';
    if (p >= 95) return 'bg-yellow-400';
    if (p > 0) return 'bg-red-500';
    return 'bg-muted';
  }

  function badgeColor(val: number | string) {
    const p = pct(val);
    if (p >= 99) return 'bg-green-500/15 text-green-700 dark:text-green-400 ring-green-500/20';
    if (p >= 95) return 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 ring-yellow-500/20';
    return 'bg-red-500/15 text-red-700 dark:text-red-400 ring-red-500/20';
  }

  function statusDot(s: string) {
    if (s === 'up') return 'bg-green-500 shadow-green-500/50';
    if (s === 'down') return 'bg-red-500 shadow-red-500/50';
    return 'bg-muted-foreground';
  }

  function avgUptime(history: UptimeBar[]): number | null {
    if (history.length === 0) return null;
    return history.reduce((sum, b) => sum + pct(b.uptimePct), 0) / history.length;
  }

  function overallBanner(s: string) {
    if (s === 'operational') return { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-700 dark:text-green-400', dot: 'bg-green-500 shadow-green-500/50', label: 'All systems operational' };
    if (s === 'degraded') return { bg: 'bg-yellow-500/10 border-yellow-500/20', text: 'text-yellow-700 dark:text-yellow-400', dot: 'bg-yellow-400 shadow-yellow-400/50', label: 'Partial system outage' };
    return { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-700 dark:text-red-400', dot: 'bg-red-500 shadow-red-500/50', label: 'Major system outage' };
  }
</script>

<svelte:head>
  <title>{data?.projectName ?? $page.params.projectSlug} — Status</title>
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
  {#if loading}
    <div class="flex items-center justify-center py-32">
      <div class="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary"></div>
    </div>
  {:else if notFound}
    <div class="text-center py-32">
      <div class="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-4">
        <span class="text-2xl">?</span>
      </div>
      <h1 class="text-xl font-semibold mb-2">Status page not found</h1>
      <p class="text-sm text-muted-foreground">The project <code class="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{$page.params.projectSlug}</code> does not have a public status page.</p>
    </div>
  {:else if fetchError}
    <div class="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive text-center">
      {fetchError}
    </div>
  {:else if data}
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold tracking-tight">{data.projectName}</h1>
        <p class="text-xs text-muted-foreground mt-0.5">Service status</p>
      </div>
      <button
        onclick={() => themeStore.toggle()}
        class="h-8 w-8 rounded-md border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        title="Toggle theme"
      >
        {#if theme === 'dark'}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        {:else}
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        {/if}
      </button>
    </div>

    <!-- Overall status banner -->
    <div class="rounded-lg border {overallBanner(data.overallStatus).bg} px-4 py-3 mb-6 flex items-center gap-3">
      <span class="h-3 w-3 rounded-full {overallBanner(data.overallStatus).dot} shadow-sm animate-pulse"></span>
      <span class="text-sm font-semibold {overallBanner(data.overallStatus).text}">{overallBanner(data.overallStatus).label}</span>
    </div>

    <!-- Monitor list -->
    <div class="space-y-3">
      {#each data.monitors as monitor (monitor.name)}
        <div class="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/30">
          <!-- Monitor header row -->
          <div class="flex items-center gap-3 mb-3">
            <!-- Status dot -->
            <span class="h-2.5 w-2.5 rounded-full {statusDot(monitor.status)} shadow-sm shrink-0"></span>

            <!-- Name + type -->
            <span class="font-medium text-sm flex-1 truncate">{monitor.name}</span>
            <span class="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-1.5 py-0.5 rounded bg-muted">{monitor.type}</span>

            <!-- Uptime badge -->
            {#if avgUptime(monitor.uptimeHistory) != null}
              <span class="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ring-1 ring-inset {badgeColor(avgUptime(monitor.uptimeHistory) ?? 0)}">
                {avgUptime(monitor.uptimeHistory)?.toFixed(1)}%
              </span>
            {/if}
          </div>

          <!-- Heartbeat bars (Kuma-style fixed-width squares) -->
          <div class="flex items-center gap-[2px]">
            {#each Array(Math.max(0, 45 - monitor.uptimeHistory.length)) as _}
              <div class="bar-cell flex-1 min-w-[6px] h-[22px] rounded-sm bg-muted">
                <span class="bar-tooltip">No data</span>
              </div>
            {/each}
            {#each monitor.uptimeHistory.slice(-45) as bucket}
              <div class="bar-cell flex-1 min-w-[6px] h-[22px] rounded-sm {barColor(bucket.uptimePct)} transition-colors hover:brightness-110">
                <span class="bar-tooltip">{new Date(bucket.bucket).toLocaleDateString()}<br/>{pct(bucket.uptimePct).toFixed(1)}%</span>
              </div>
            {/each}
          </div>
          <div class="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
            <span>45d ago</span>
            <span>Now</span>
          </div>
        </div>
      {/each}
    </div>

    {#if data.monitors.length === 0}
      <div class="rounded-lg border border-dashed bg-card p-8 text-center">
        <p class="text-sm text-muted-foreground">No monitors configured for this project.</p>
      </div>
    {/if}

    <!-- Footer -->
    <div class="mt-6 text-center text-[10px] text-muted-foreground space-y-1">
      <p>Last updated {new Date(data.lastUpdated).toLocaleString()}</p>
      <p><a href="https://logtide.dev" class="hover:text-foreground transition-colors">Powered by LogTide</a></p>
    </div>
  {/if}
</div>

<style>
  .bar-cell {
    position: relative;
    cursor: default;
  }

  .bar-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    padding: 4px 8px;
    border-radius: 6px;
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
    text-align: center;
    pointer-events: none;
    z-index: 50;
    background: hsl(var(--popover));
    color: hsl(var(--popover-foreground));
    border: 1px solid hsl(var(--border));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  }

  .bar-tooltip::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 4px solid transparent;
    border-top-color: hsl(var(--border));
  }

  .bar-cell:hover .bar-tooltip {
    display: block;
  }
</style>
