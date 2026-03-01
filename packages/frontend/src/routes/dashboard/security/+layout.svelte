<script lang="ts">
  import { page } from '$app/state';
  
  interface Props {
    children: import('svelte').Snippet;
  }
  let { children }: Props = $props();
  
  const currentPath = $derived(page.url.pathname);
  
  const tabs = [
    { label: 'Dashboard', href: '/dashboard/security' },
    { label: 'Rules', href: '/dashboard/security/rules' },
    { label: 'Incidents', href: '/dashboard/security/incidents' },
  ];
  
  function isTabActive(href: string) {
    if (href === '/dashboard/security') return currentPath === href;
    return currentPath.startsWith(href);
  }
</script>

<div class="border-b border-border bg-card">
  <div class="container mx-auto px-6">
    <nav class="flex items-center gap-1 -mb-px">
      {#each tabs as tab}
        <a
          href={tab.href}
          class="px-4 py-3 text-sm font-medium border-b-2 transition-colors {isTabActive(tab.href)
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'}"
        >
          {tab.label}
        </a>
      {/each}
    </nav>
  </div>
</div>

{@render children()}
