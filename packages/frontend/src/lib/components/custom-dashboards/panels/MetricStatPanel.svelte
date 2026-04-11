<script lang="ts">
  import type { MetricStatConfig } from '@logtide/shared';

  interface MetricStatData {
    metricName: string;
    value: number | null;
    unit: string | null;
    aggregation: string;
  }

  interface Props {
    config: MetricStatConfig;
    data: unknown;
    loading: boolean;
    error: string | null;
  }

  let { config, data }: Props = $props();
  const typed = $derived(data as MetricStatData | null);

  function fmt(v: number | null | undefined): string {
    if (v == null) return '-';
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(2) + 'k';
    if (Math.abs(v) < 1) return v.toFixed(3);
    return v.toFixed(2);
  }
</script>

<div class="flex flex-col justify-center items-start gap-1 p-4 h-full">
  <div class="text-3xl font-bold tracking-tight">
    {fmt(typed?.value)}{typed?.unit ?? config.unit ?? ''}
  </div>
  <div class="text-xs text-muted-foreground truncate w-full" title={config.metricName}>
    {config.aggregation}({config.metricName})
  </div>
</div>
