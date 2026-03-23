<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { currentOrganization } from '$lib/stores/organization';
  import { monitoringStore, monitors, monitorsLoading, monitorsError } from '$lib/stores/monitoring';
  import { toastStore } from '$lib/stores/toast';
  import { layoutStore } from '$lib/stores/layout';
  import { type CreateMonitorInput, type Monitor } from '$lib/api/monitoring';
  import { ProjectsAPI } from '$lib/api/projects';
  import { getAuthToken } from '$lib/utils/auth';
  import type { Project } from '@logtide/shared';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Badge } from '$lib/components/ui/badge';
  import Activity from '@lucide/svelte/icons/activity';
  import Plus from '@lucide/svelte/icons/plus';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Globe from '@lucide/svelte/icons/globe';
  import Wifi from '@lucide/svelte/icons/wifi';
  import Heart from '@lucide/svelte/icons/heart';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import ExternalLink from '@lucide/svelte/icons/external-link';

  const layout = $derived($layoutStore);
  const org = $derived($currentOrganization);
  const monitorList = $derived($monitors);
  const loading = $derived($monitorsLoading);
  const error = $derived($monitorsError);

  // Projects
  let projects = $state<Project[]>([]);
  const projectsAPI = new ProjectsAPI(getAuthToken);

  // Form state
  let showCreateForm = $state(false);
  let editingMonitor = $state<Monitor | null>(null);
  let deleteConfirmId = $state<string | null>(null);
  let submitting = $state(false);

  // Form fields
  let formName = $state('');
  let formType = $state<'http' | 'tcp' | 'heartbeat'>('http');
  let formTarget = $state('');
  let formInterval = $state(60);
  let formTimeout = $state(10);
  let formThreshold = $state(2);
  let formAutoResolve = $state(true);
  let formEnabled = $state(true);
  let projectId = $state<string | undefined>(undefined);

  $effect(() => {
    if (org) {
      monitoringStore.load(org.id, projectId);
      projectsAPI.getProjects(org.id).then((res) => {
        projects = res.projects;
        if (!projectId && res.projects.length > 0) {
          projectId = res.projects[0].id;
        }
      }).catch(() => {});
    }
  });

  function resetForm() {
    formName = '';
    formType = 'http';
    formTarget = '';
    formInterval = 60;
    formTimeout = 10;
    formThreshold = 2;
    formAutoResolve = true;
    formEnabled = true;
  }

  function openCreate() {
    resetForm();
    editingMonitor = null;
    showCreateForm = true;
  }

  function openEdit(monitor: Monitor) {
    formName = monitor.name;
    formType = monitor.type;
    formTarget = monitor.target ?? '';
    formInterval = monitor.intervalSeconds;
    formTimeout = monitor.timeoutSeconds;
    formThreshold = monitor.failureThreshold;
    formAutoResolve = monitor.autoResolve;
    formEnabled = monitor.enabled;
    editingMonitor = monitor;
    showCreateForm = true;
  }

  function closeForm() {
    showCreateForm = false;
    editingMonitor = null;
    resetForm();
  }

  let formError = $state<string | null>(null);

  function validateForm(): string | null {
    if (!editingMonitor) {
      if (formType === 'http') {
        if (!formTarget || !(formTarget.startsWith('http://') || formTarget.startsWith('https://'))) {
          return 'HTTP target must start with http:// or https://';
        }
      }
      if (formType === 'tcp') {
        if (!formTarget || !formTarget.includes(':')) {
          return 'TCP target must be in host:port format';
        }
      }
    }
    return null;
  }

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!org) return;

    const validationError = validateForm();
    if (validationError) {
      formError = validationError;
      return;
    }
    formError = null;

    submitting = true;
    try {
      if (editingMonitor) {
        await monitoringStore.update(editingMonitor.id, org.id, {
          name: formName,
          target: formTarget || null,
          intervalSeconds: formInterval,
          timeoutSeconds: formTimeout,
          failureThreshold: formThreshold,
          autoResolve: formAutoResolve,
          enabled: formEnabled,
        });
        toastStore.success('Monitor updated');
      } else {
        const input: CreateMonitorInput = {
          organizationId: org.id,
          projectId: projectId!,
          name: formName,
          type: formType,
          target: formTarget || null,
          intervalSeconds: formInterval,
          timeoutSeconds: formTimeout,
          failureThreshold: formThreshold,
          autoResolve: formAutoResolve,
          enabled: formEnabled,
        };
        await monitoringStore.create(input);
        toastStore.success('Monitor created');
      }
      closeForm();
    } catch (err) {
      toastStore.error(err instanceof Error ? err.message : 'Failed to save monitor');
    } finally {
      submitting = false;
    }
  }

  async function handleDelete(id: string) {
    if (!org) return;
    try {
      await monitoringStore.delete(id, org.id);
      toastStore.success('Monitor deleted');
      deleteConfirmId = null;
    } catch (err) {
      toastStore.error(err instanceof Error ? err.message : 'Failed to delete monitor');
    }
  }

  function statusColor(status?: string) {
    if (status === 'up') return 'bg-green-500';
    if (status === 'down') return 'bg-red-500';
    return 'bg-gray-400';
  }

  function statusLabel(status?: string) {
    if (status === 'up') return 'Up';
    if (status === 'down') return 'Down';
    return 'Unknown';
  }

  function typeIcon(type: string) {
    if (type === 'http') return Globe;
    if (type === 'tcp') return Wifi;
    return Heart;
  }

  function formatResponseTime(ms: number | null | undefined) {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Status page toggle
  const selectedProject = $derived(projects.find((p) => p.id === projectId));

  async function toggleStatusPage() {
    if (!org || !projectId || !selectedProject) return;
    try {
      const res = await projectsAPI.updateProject(org.id, projectId, {
        statusPagePublic: !selectedProject.statusPagePublic,
      });
      // Update local projects array
      projects = projects.map((p) => p.id === projectId ? { ...p, statusPagePublic: res.project.statusPagePublic } : p);
      toastStore.success(res.project.statusPagePublic ? 'Status page enabled' : 'Status page disabled');
    } catch (err) {
      toastStore.error(err instanceof Error ? err.message : 'Failed to update status page');
    }
  }
</script>

<div class="flex flex-col gap-6 p-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <Activity class="h-6 w-6 text-primary" />
      <div>
        <h1 class="text-2xl font-semibold">Monitoring</h1>
        <p class="text-sm text-muted-foreground">Uptime and health checks for your services</p>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onclick={() => org && monitoringStore.load(org.id, projectId)}
      >
        <RefreshCw class="h-4 w-4" />
      </Button>
      <Button size="sm" onclick={openCreate}>
        <Plus class="mr-2 h-4 w-4" />
        New Monitor
      </Button>
    </div>
  </div>

  <!-- Status page toggle -->
  {#if selectedProject}
    <div class="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selectedProject.statusPagePublic}
            onchange={toggleStatusPage}
            class="rounded"
          />
          Public status page
        </label>
        {#if selectedProject.statusPagePublic}
          <Badge variant="outline" class="text-xs">Live</Badge>
        {/if}
      </div>
      {#if selectedProject.statusPagePublic && selectedProject.slug}
        <a
          href="/status/{selectedProject.slug}"
          target="_blank"
          class="flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          View status page
          <ExternalLink class="h-3 w-3" />
        </a>
      {/if}
    </div>
  {/if}

  <!-- Error -->
  {#if error}
    <div class="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
      {error}
    </div>
  {/if}

  <!-- Create / Edit Form -->
  {#if showCreateForm}
    <div class="rounded-lg border bg-card p-6">
      <h2 class="mb-4 text-lg font-medium">{editingMonitor ? 'Edit Monitor' : 'New Monitor'}</h2>
      <form onsubmit={handleSubmit} class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label class="mb-1 block text-sm font-medium">Name</label>
          <input
            bind:value={formName}
            required
            minlength="1"
            maxlength="255"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="My API"
          />
        </div>

        {#if !editingMonitor}
          <div>
            <label class="mb-1 block text-sm font-medium">Project</label>
            <select
              bind:value={projectId}
              required
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {#each projects as p (p.id)}
                <option value={p.id}>{p.name}</option>
              {/each}
            </select>
          </div>
          <div>
            <label class="mb-1 block text-sm font-medium">Type</label>
            <select
              bind:value={formType}
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="http">HTTP / HTTPS</option>
              <option value="tcp">TCP</option>
              <option value="heartbeat">Heartbeat</option>
            </select>
          </div>
        {/if}

        {#if formType !== 'heartbeat' || editingMonitor}
          <div class={!editingMonitor ? '' : 'sm:col-span-2'}>
            <label class="mb-1 block text-sm font-medium">
              {formType === 'tcp' ? 'Target (host:port)' : 'URL'}
              {#if formType === 'heartbeat' && editingMonitor}(not used for heartbeat){/if}
            </label>
            <input
              bind:value={formTarget}
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder={formType === 'tcp' ? 'db.example.com:5432' : 'https://example.com/health'}
            />
          </div>
        {/if}

        <div>
          <label class="mb-1 block text-sm font-medium">Check interval (seconds)</label>
          <input
            type="number"
            bind:value={formInterval}
            min="30"
            max="86400"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {#if formType !== 'heartbeat'}
          <div>
            <label class="mb-1 block text-sm font-medium">Timeout (seconds)</label>
            <input
              type="number"
              bind:value={formTimeout}
              min="1"
              max="60"
              class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        {/if}

        <div>
          <label class="mb-1 block text-sm font-medium">Failure threshold</label>
          <input
            type="number"
            bind:value={formThreshold}
            min="1"
            max="20"
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <p class="mt-1 text-xs text-muted-foreground">Consecutive failures before alerting</p>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={formAutoResolve} class="rounded" />
            Auto-resolve incident on recovery
          </label>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm">
            <input type="checkbox" bind:checked={formEnabled} class="rounded" />
            Enabled
          </label>
        </div>

        {#if formError}
          <div class="sm:col-span-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </div>
        {/if}

        <div class="sm:col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onclick={closeForm}>Cancel</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : editingMonitor ? 'Save changes' : 'Create monitor'}
          </Button>
        </div>
      </form>
    </div>
  {/if}

  <!-- Monitor List -->
  {#if loading}
    <div class="flex items-center justify-center py-16">
      <RefreshCw class="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  {:else if monitorList.length === 0 && !showCreateForm}
    <div class="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed py-16 text-center">
      <Activity class="h-10 w-10 text-muted-foreground" />
      <div>
        <p class="font-medium">No monitors yet</p>
        <p class="text-sm text-muted-foreground">Create a monitor to track uptime and health of your services</p>
      </div>
      <Button size="sm" onclick={openCreate}>
        <Plus class="mr-2 h-4 w-4" />
        Create your first monitor
      </Button>
    </div>
  {:else}
    <div class="rounded-lg border bg-card">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th class="px-4 py-3">Status</th>
            <th class="px-4 py-3">Name</th>
            <th class="px-4 py-3">Type</th>
            <th class="px-4 py-3 hidden md:table-cell">Response</th>
            <th class="px-4 py-3 hidden lg:table-cell">Last checked</th>
            <th class="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {#each monitorList as monitor (monitor.id)}
            <tr class="border-b last:border-0 hover:bg-muted/40 transition-colors">
              <td class="px-4 py-3">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full {statusColor(monitor.status?.status)}"></span>
                  <span class="font-medium {monitor.status?.status === 'down' ? 'text-destructive' : ''}">
                    {statusLabel(monitor.status?.status)}
                  </span>
                  {#if !monitor.enabled}
                    <Badge variant="outline" class="text-xs">Paused</Badge>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3">
                <button
                  class="font-medium hover:text-primary hover:underline text-left"
                  onclick={() => goto(`/dashboard/monitoring/${monitor.id}`)}
                >
                  {monitor.name}
                </button>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center gap-1.5 text-muted-foreground">
                  {#if monitor.type === 'http'}
                    <Globe class="h-3.5 w-3.5" />
                  {:else if monitor.type === 'tcp'}
                    <Wifi class="h-3.5 w-3.5" />
                  {:else}
                    <Heart class="h-3.5 w-3.5" />
                  {/if}
                  <span class="capitalize">{monitor.type}</span>
                </div>
              </td>
              <td class="px-4 py-3 hidden md:table-cell text-muted-foreground">
                {formatResponseTime(monitor.status?.responseTimeMs)}
              </td>
              <td class="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                {monitor.status?.lastCheckedAt
                  ? new Date(monitor.status.lastCheckedAt).toLocaleString()
                  : '—'}
              </td>
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  {#if deleteConfirmId === monitor.id}
                    <span class="text-xs text-muted-foreground mr-1">Delete?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      onclick={() => handleDelete(monitor.id)}
                    >Yes</Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onclick={() => (deleteConfirmId = null)}
                    >No</Button>
                  {:else}
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => openEdit(monitor)}
                      title="Edit"
                    >
                      <Pencil class="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => (deleteConfirmId = monitor.id)}
                      title="Delete"
                    >
                      <Trash2 class="h-4 w-4 text-destructive" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onclick={() => goto(`/dashboard/monitoring/${monitor.id}`)}
                      title="View details"
                    >
                      <ChevronRight class="h-4 w-4" />
                    </Button>
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
