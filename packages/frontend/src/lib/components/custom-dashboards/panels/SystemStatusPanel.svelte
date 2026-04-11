<script lang="ts">
  // Big aggregated banner: All systems operational / Partial outage / Major outage.
  // Mirrors the look-and-feel of the public status page banner so users get the
  // same visual cue inside their custom dashboards.

  import type { SystemStatusConfig } from '@logtide/shared';
  import CheckCircle2 from '@lucide/svelte/icons/check-circle-2';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import XOctagon from '@lucide/svelte/icons/x-octagon';
  import HelpCircle from '@lucide/svelte/icons/help-circle';

  interface SystemStatusData {
    overallStatus: 'operational' | 'degraded' | 'outage' | 'no_monitors';
    totalMonitors: number;
    upCount: number;
    downCount: number;
    unknownCount: number;
  }

  interface Props {
    config: SystemStatusConfig;
    data: unknown;
    loading: boolean;
    error: string | null;
  }

  let { config, data }: Props = $props();
  const typed = $derived(data as SystemStatusData | null);

  function bannerStyle(s: SystemStatusData['overallStatus'] | undefined) {
    if (s === 'operational') {
      return {
        bg: 'bg-green-500/10 border-green-500/30',
        text: 'text-green-700 dark:text-green-400',
        dot: 'bg-green-500 shadow-green-500/50',
        label: 'All systems operational',
        icon: CheckCircle2,
      };
    }
    if (s === 'degraded') {
      return {
        bg: 'bg-yellow-500/10 border-yellow-500/30',
        text: 'text-yellow-700 dark:text-yellow-400',
        dot: 'bg-yellow-400 shadow-yellow-400/50',
        label: 'Partial system outage',
        icon: AlertTriangle,
      };
    }
    if (s === 'outage') {
      return {
        bg: 'bg-red-500/10 border-red-500/30',
        text: 'text-red-700 dark:text-red-400',
        dot: 'bg-red-500 shadow-red-500/50',
        label: 'Major system outage',
        icon: XOctagon,
      };
    }
    return {
      bg: 'bg-muted/30 border-border',
      text: 'text-muted-foreground',
      dot: 'bg-muted-foreground',
      label: 'No monitors configured',
      icon: HelpCircle,
    };
  }

  const banner = $derived(bannerStyle(typed?.overallStatus));
  const Icon = $derived(banner.icon);
</script>

<div class="h-full w-full p-3">
  <div
    class="h-full rounded-lg border {banner.bg} px-5 py-4 flex items-center justify-between gap-4"
  >
    <div class="flex items-center gap-3 min-w-0">
      <span class="relative flex h-3 w-3 flex-shrink-0">
        {#if typed?.overallStatus === 'operational' || typed?.overallStatus === 'degraded' || typed?.overallStatus === 'outage'}
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full {banner.dot} opacity-60"></span>
        {/if}
        <span class="relative inline-flex h-3 w-3 rounded-full {banner.dot} shadow-sm"></span>
      </span>
      <Icon class="w-5 h-5 flex-shrink-0 {banner.text}" />
      <span class="text-base sm:text-lg font-semibold truncate {banner.text}">
        {banner.label}
      </span>
    </div>

    {#if config.showCounts && typed && typed.totalMonitors > 0}
      <div class="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm flex-shrink-0">
        <div class="flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <span class="font-semibold">{typed.upCount}</span>
          <span class="hidden sm:inline">up</span>
        </div>
        {#if typed.downCount > 0}
          <div class="flex items-center gap-1.5 text-red-700 dark:text-red-400">
            <span class="font-semibold">{typed.downCount}</span>
            <span class="hidden sm:inline">down</span>
          </div>
        {/if}
        {#if typed.unknownCount > 0}
          <div class="flex items-center gap-1.5 text-muted-foreground">
            <span class="font-semibold">{typed.unknownCount}</span>
            <span class="hidden sm:inline">unknown</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
