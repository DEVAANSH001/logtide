<script lang="ts">
  import type { TopNTableConfig } from '@logtide/shared';
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
    config: TopNTableConfig;
    onChange: (updated: TopNTableConfig) => void;
  }

  let { config, onChange }: Props = $props();

  const dimensionOptions: Array<{ value: TopNTableConfig['dimension']; label: string }> = [
    { value: 'service', label: 'By service' },
    { value: 'error_message', label: 'By error message' },
  ];

  const intervals: Array<TopNTableConfig['interval']> = ['1h', '24h', '7d'];

  function update<K extends keyof TopNTableConfig>(key: K, value: TopNTableConfig[K]) {
    onChange({ ...config, [key]: value });
  }
</script>

<div class="space-y-4">
  <div class="space-y-1.5">
    <Label for="topn-title">Title</Label>
    <Input
      id="topn-title"
      type="text"
      value={config.title}
      oninput={(e) => update('title', (e.currentTarget as HTMLInputElement).value)}
    />
  </div>

  <div class="space-y-1.5">
    <Label>Group by</Label>
    <Select
      type="single"
      value={config.dimension}
      onValueChange={(v) => v && update('dimension', v as TopNTableConfig['dimension'])}
    >
      <SelectTrigger>
        <SelectValue>{dimensionOptions.find((o) => o.value === config.dimension)?.label ?? config.dimension}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {#each dimensionOptions as option}
          <SelectItem value={option.value}>{option.label}</SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-1.5">
    <Label>Time window</Label>
    <Select
      type="single"
      value={config.interval}
      onValueChange={(v) => v && update('interval', v as TopNTableConfig['interval'])}
    >
      <SelectTrigger>
        <SelectValue>{config.interval}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {#each intervals as i}
          <SelectItem value={i}>{i}</SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>

  <div class="space-y-1.5">
    <Label for="topn-limit">Number of rows</Label>
    <Input
      id="topn-limit"
      type="number"
      min="3"
      max="20"
      value={config.limit}
      oninput={(e) => {
        const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
        if (!Number.isNaN(v)) update('limit', Math.min(20, Math.max(3, v)));
      }}
    />
  </div>
</div>
