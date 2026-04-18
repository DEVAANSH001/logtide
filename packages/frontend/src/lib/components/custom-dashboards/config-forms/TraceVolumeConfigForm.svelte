<script lang="ts">
  import type { TraceVolumeConfig } from '@logtide/shared';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '$lib/components/ui/select';

  interface Props {
    config: TraceVolumeConfig;
    onChange: (updated: TraceVolumeConfig) => void;
  }

  let { config, onChange }: Props = $props();

  const timeRanges = ['1h', '6h', '24h', '7d'] as const;

  function update<K extends keyof TraceVolumeConfig>(key: K, value: TraceVolumeConfig[K]) {
    onChange({ ...config, [key]: value });
  }
</script>

<div class="space-y-4">
  <div class="space-y-1.5">
    <Label for="tv-title">Title</Label>
    <Input
      id="tv-title"
      type="text"
      value={config.title}
      oninput={(e) => update('title', (e.currentTarget as HTMLInputElement).value)}
    />
  </div>

  <div class="space-y-1.5">
    <Label>Time range</Label>
    <Select
      type="single"
      value={config.timeRange}
      onValueChange={(v) => v && update('timeRange', v as TraceVolumeConfig['timeRange'])}
    >
      <SelectTrigger>
        <SelectValue>{config.timeRange}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {#each timeRanges as r}
          <SelectItem value={r}>{r}</SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-1.5">
    <Label for="tv-service">Service filter (optional)</Label>
    <Input
      id="tv-service"
      type="text"
      placeholder="Leave empty for all services"
      value={config.serviceName ?? ''}
      oninput={(e) => {
        const val = (e.currentTarget as HTMLInputElement).value;
        update('serviceName', val.length > 0 ? val : null);
      }}
    />
  </div>

  <div class="flex items-center gap-2">
    <input
      id="tv-errors"
      type="checkbox"
      class="h-4 w-4"
      checked={config.showErrors}
      onchange={(e) => update('showErrors', (e.currentTarget as HTMLInputElement).checked)}
    />
    <Label for="tv-errors" class="cursor-pointer">Show errors line</Label>
  </div>
</div>
