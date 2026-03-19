<script lang="ts">
  import type { Snippet } from 'svelte';
  import Spinner from '$lib/components/Spinner.svelte';

  interface Props {
    loading: boolean;
    class?: string;
    className?: string;
    children?: Snippet;
  }

  let {
    loading,
    class: classProp = '',
    className = '',
    children,
  }: Props = $props();

  const wrapperClass = $derived(`relative ${classProp} ${className}`.trim());
</script>

<div class={wrapperClass}>
  <div class:opacity-40={loading} class:pointer-events-none={loading}>
    {@render children?.()}
  </div>
  {#if loading}
    <div
      class="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/50 backdrop-blur-[1px]"
    >
      <Spinner size="md" />
    </div>
  {/if}
</div>
