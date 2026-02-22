<script lang="ts">
  import { currentOrganization } from '$lib/stores/organization';
  import { observeContextStore } from '$lib/stores/observe-context';
  import { ProjectsAPI } from '$lib/api/projects';
  import { authStore } from '$lib/stores/auth';
  import type { Project } from '@logtide/shared';
  import type { TimeRangeType } from '$lib/stores/observe-context';
  import * as Popover from '$lib/components/ui/popover';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Checkbox } from '$lib/components/ui/checkbox';
  import FolderKanban from '@lucide/svelte/icons/folder-kanban';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';

  let token = $state<string | null>(null);
  authStore.subscribe((state) => { token = state.token; });
  let projectsAPI = $derived(new ProjectsAPI(() => token));

  let projects = $state<Project[]>([]);
  let loading = $state(false);
  let selectedProjectIds = $state<string[]>([]);
  let currentTimeRange = $state<TimeRangeType>('last_24h');
  let lastOrgId = $state<string | null>(null);
  let popoverOpen = $state(false);

  observeContextStore.subscribe((state) => {
    selectedProjectIds = state.selectedProjects;
    currentTimeRange = state.timeRangeType;
  });

  const timeRangeOptions: { value: TimeRangeType; label: string }[] = [
    { value: 'last_hour', label: '1h' },
    { value: 'last_24h', label: '24h' },
    { value: 'last_7d', label: '7d' },
  ];

  $effect(() => {
    const org = $currentOrganization;
    if (!org || !token) return;
    if (org.id === lastOrgId) return;

    lastOrgId = org.id;
    loadProjects(org.id);
  });

  async function loadProjects(orgId: string) {
    loading = true;
    try {
      const res = await projectsAPI.getProjects(orgId);
      projects = res.projects;

      // Auto-select all if store has none selected
      if (selectedProjectIds.length === 0 && projects.length > 0) {
        observeContextStore.setProjects(projects.map((p) => p.id));
      }
    } catch (e) {
      console.error('Failed to load projects for context bar:', e);
    } finally {
      loading = false;
    }
  }

  function toggleProject(projectId: string) {
    const current = [...selectedProjectIds];
    const idx = current.indexOf(projectId);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(projectId);
    }
    observeContextStore.setProjects(current);
  }

  function selectAll() {
    observeContextStore.setProjects(projects.map((p) => p.id));
  }

  function selectNone() {
    observeContextStore.setProjects([]);
  }

  function setTimeRange(type: TimeRangeType) {
    observeContextStore.setTimeRange(type);
  }

  let projectLabel = $derived.by(() => {
    if (projects.length === 0) return 'No projects';
    if (selectedProjectIds.length === 0) return 'None selected';
    if (selectedProjectIds.length === projects.length) return 'All projects';
    if (selectedProjectIds.length === 1) {
      const p = projects.find((proj) => proj.id === selectedProjectIds[0]);
      return p?.name ?? '1 project';
    }
    return `${selectedProjectIds.length} projects`;
  });
</script>

<div class="flex items-center gap-2">
  <!-- Project multi-select popover -->
  <Popover.Root bind:open={popoverOpen}>
    <Popover.Trigger>
      <Button variant="outline" size="sm" class="h-8 gap-1.5 text-xs">
        <FolderKanban class="w-3.5 h-3.5" />
        <span class="max-w-[120px] truncate">{projectLabel}</span>
        <ChevronDown class="w-3 h-3 opacity-50" />
      </Button>
    </Popover.Trigger>
    <Popover.Content align="start" class="w-64 p-0">
      <div class="px-3 py-2 border-b border-border">
        <div class="flex items-center justify-between">
          <p class="text-xs font-medium text-muted-foreground">Projects</p>
          <div class="flex gap-1">
            <button
              onclick={selectAll}
              class="text-[10px] text-primary hover:underline"
            >
              All
            </button>
            <span class="text-[10px] text-muted-foreground">/</span>
            <button
              onclick={selectNone}
              class="text-[10px] text-primary hover:underline"
            >
              None
            </button>
          </div>
        </div>
      </div>
      <div class="max-h-[200px] overflow-y-auto p-1">
        {#if loading}
          <p class="px-3 py-2 text-xs text-muted-foreground">Loading...</p>
        {:else if projects.length === 0}
          <p class="px-3 py-2 text-xs text-muted-foreground">No projects found</p>
        {:else}
          {#each projects as project}
            <button
              onclick={() => toggleProject(project.id)}
              class="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm text-left text-sm hover:bg-accent/50 transition-colors"
            >
              <Checkbox
                checked={selectedProjectIds.includes(project.id)}
                class="pointer-events-none"
              />
              <span class="truncate">{project.name}</span>
            </button>
          {/each}
        {/if}
      </div>
    </Popover.Content>
  </Popover.Root>

  <!-- Time range button group -->
  <div class="flex items-center rounded-md border border-border overflow-hidden">
    {#each timeRangeOptions as opt}
      <button
        onclick={() => setTimeRange(opt.value)}
        class="px-2.5 py-1 text-xs font-medium transition-colors {currentTimeRange === opt.value
          ? 'bg-primary text-primary-foreground'
          : 'bg-background text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'}"
      >
        {opt.label}
      </button>
    {/each}
  </div>
</div>
