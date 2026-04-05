<script lang="ts">
  import AppLayout from '$lib/components/AppLayout.svelte';
  import RequireOrganization from '$lib/components/RequireOrganization.svelte';
  import { createBoundaryHandler } from '@logtide/sveltekit';

  const onerror = createBoundaryHandler('Dashboard');
</script>

<AppLayout>
  <RequireOrganization>
    <svelte:boundary {onerror}>
      <slot />
      {#snippet failed(error, reset)}
        <div class="flex-1 flex items-center justify-center p-8">
          <div class="text-center space-y-4">
            <h2 class="text-2xl font-semibold text-destructive">Dashboard Error</h2>
            <p class="text-muted-foreground">Something went wrong loading this page.</p>
            <pre class="mt-2 text-left text-xs text-destructive/80 max-w-lg mx-auto overflow-auto">{error?.message ?? error}</pre>
            <button class="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm" onclick={reset}>
              Reload
            </button>
          </div>
        </div>
      {/snippet}
    </svelte:boundary>
  </RequireOrganization>
</AppLayout>
