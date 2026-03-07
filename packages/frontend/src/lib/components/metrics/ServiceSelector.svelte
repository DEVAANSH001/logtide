<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import Button from "$lib/components/ui/button/button.svelte";

  interface Props {
    services: string[];
    selectedService: string | null;
    timeRange: string;
    onServiceChange: (service: string | null) => void;
    onTimeRangeChange: (range: string) => void;
  }

  let { services, selectedService, timeRange, onServiceChange, onTimeRangeChange }: Props = $props();

  const timeRanges = [
    { value: 'last_hour', label: '1h' },
    { value: 'last_6h', label: '6h' },
    { value: 'last_24h', label: '24h' },
    { value: 'last_7d', label: '7d' },
  ];
</script>

<div class="flex items-center gap-4">
  <Select.Root
    type="single"
    value={selectedService || "__all__"}
    onValueChange={(v) => onServiceChange(v === "__all__" ? null : v || null)}
  >
    <Select.Trigger class="w-[200px]">
      {selectedService || "All Services"}
    </Select.Trigger>
    <Select.Content>
      <Select.Item value="__all__">All Services</Select.Item>
      {#each services as service}
        <Select.Item value={service}>{service}</Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>

  <div class="flex items-center rounded-md border bg-muted p-0.5">
    {#each timeRanges as tr}
      <Button
        variant={timeRange === tr.value ? 'default' : 'ghost'}
        size="sm"
        class="h-7 px-2 text-xs"
        onclick={() => onTimeRangeChange(tr.value)}
      >
        {tr.label}
      </Button>
    {/each}
  </div>
</div>
