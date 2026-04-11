<script lang="ts">
  import type { AlertStatusConfig } from '@logtide/shared';
  import { Badge } from '$lib/components/ui/badge';
  import Bell from '@lucide/svelte/icons/bell';
  import BellOff from '@lucide/svelte/icons/bell-off';

  interface AlertStatusRow {
    id: string;
    name: string;
    enabled: boolean;
    lastTriggeredAt: string | null;
    triggerCount24h: number;
  }

  interface AlertStatusData {
    rules: AlertStatusRow[];
    recentHistory: Array<{
      id: string;
      ruleName: string;
      triggeredAt: string;
      logCount: number;
    }>;
  }

  interface Props {
    config: AlertStatusConfig;
    data: unknown;
    loading: boolean;
    error: string | null;
  }

  let { config, data }: Props = $props();
  const typed = $derived(data as AlertStatusData | null);

  function formatRelative(time: string | null): string {
    if (!time) return 'never';
    const now = Date.now();
    const t = new Date(time).getTime();
    const diff = now - t;
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
  }
</script>

<div class="h-full overflow-auto">
  {#if !typed || typed.rules.length === 0}
    <p class="text-sm text-muted-foreground text-center py-6">No alert rules configured</p>
  {:else}
    <ul class="divide-y divide-border">
      {#each typed.rules as rule (rule.id)}
        <li class="flex items-center justify-between gap-3 px-3 py-2">
          <div class="flex items-center gap-2 min-w-0 flex-1">
            {#if rule.enabled}
              <Bell class="w-4 h-4 text-primary flex-shrink-0" />
            {:else}
              <BellOff class="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {/if}
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{rule.name}</p>
              <p class="text-xs text-muted-foreground">
                Last: {formatRelative(rule.lastTriggeredAt)}
              </p>
            </div>
          </div>
          {#if rule.triggerCount24h > 0}
            <Badge variant="destructive" class="flex-shrink-0">{rule.triggerCount24h}×</Badge>
          {:else}
            <Badge variant="secondary" class="flex-shrink-0">quiet</Badge>
          {/if}
        </li>
      {/each}
    </ul>
    {#if config.showHistory && typed.recentHistory.length > 0}
      <div class="border-t border-border/60 mt-2 pt-2">
        <p class="px-3 text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
          Recent triggers
        </p>
        <ul class="divide-y divide-border/60">
          {#each typed.recentHistory as h (h.id)}
            <li class="px-3 py-1 text-xs flex items-center justify-between gap-2">
              <span class="truncate">{h.ruleName}</span>
              <span class="text-muted-foreground flex-shrink-0">
                {formatRelative(h.triggeredAt)}
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</div>
