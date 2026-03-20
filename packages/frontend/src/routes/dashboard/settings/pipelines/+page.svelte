<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { organizationStore } from '$lib/stores/organization';
  import { toastStore } from '$lib/stores/toast';
  import { pipelineStore } from '$lib/stores/log-pipeline';
  import type { Pipeline } from '$lib/api/log-pipeline';
  import Button from '$lib/components/ui/button/button.svelte';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Badge } from '$lib/components/ui/badge';
  import { Switch } from '$lib/components/ui/switch';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '$lib/components/ui/alert-dialog';
  import Spinner from '$lib/components/Spinner.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import GitBranch from '@lucide/svelte/icons/git-branch';

  let token: string | null = null;
  let organizationId = $state<string | null>(null);
  let deleteTarget = $state<Pipeline | null>(null);
  let deleting = $state(false);
  let deleteDialogOpen = $state(false);

  authStore.subscribe((s) => {
    token = s.token;
  });

  organizationStore.subscribe((s) => {
    organizationId = s.currentOrganization?.id ?? null;
  });

  onMount(() => {
    if (!token) {
      goto('/login');
      return;
    }
    if (organizationId) {
      pipelineStore.load(organizationId);
    }
  });

  function openDeleteDialog(pipeline: Pipeline) {
    deleteTarget = pipeline;
    deleteDialogOpen = true;
  }

  async function handleDelete() {
    if (!deleteTarget || !organizationId) return;
    deleting = true;
    try {
      await pipelineStore.delete(deleteTarget.id, organizationId);
      toastStore.success('Pipeline deleted');
      deleteDialogOpen = false;
      deleteTarget = null;
    } catch (e) {
      toastStore.error(e instanceof Error ? e.message : 'Failed to delete pipeline');
    } finally {
      deleting = false;
    }
  }

  async function handleToggle(pipeline: Pipeline) {
    if (!organizationId) return;
    try {
      await pipelineStore.toggleEnabled(pipeline, organizationId);
    } catch (e) {
      toastStore.error(e instanceof Error ? e.message : 'Failed to update pipeline');
    }
  }
</script>

<svelte:head>
  <title>Pipelines - LogTide</title>
</svelte:head>

<div class="space-y-6">
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <div>
          <CardTitle class="flex items-center gap-2">
            <GitBranch class="w-4 h-4" />
            Log Parsing Pipelines
          </CardTitle>
          <CardDescription>
            Define steps to parse and enrich incoming log messages before they are stored
          </CardDescription>
        </div>
        <Button onclick={() => goto('/dashboard/settings/pipelines/new')} class="gap-2">
          <Plus class="w-4 h-4" />
          New pipeline
        </Button>
      </div>
    </CardHeader>
    <CardContent>
      {#if $pipelineStore.loading}
        <div class="flex items-center justify-center py-12">
          <Spinner size="md" />
          <span class="ml-2 text-sm text-muted-foreground">Loading pipelines...</span>
        </div>
      {:else if $pipelineStore.error}
        <div class="text-destructive text-sm py-4">{$pipelineStore.error}</div>
      {:else if $pipelineStore.pipelines.length === 0}
        <div class="flex flex-col items-center justify-center py-16 text-center gap-4">
          <GitBranch class="w-10 h-10 text-muted-foreground/50" />
          <div>
            <p class="font-medium">No pipelines yet</p>
            <p class="text-sm text-muted-foreground mt-1">
              Create your first pipeline to start parsing and enriching logs
            </p>
          </div>
          <Button onclick={() => goto('/dashboard/settings/pipelines/new')} class="gap-2">
            <Plus class="w-4 h-4" />
            Create your first pipeline
          </Button>
        </div>
      {:else}
        <div class="space-y-3">
          {#each $pipelineStore.pipelines as pipeline}
            <div class="flex items-center justify-between p-4 border rounded-lg gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="font-medium truncate">{pipeline.name}</span>
                  {#if pipeline.projectId}
                    <Badge variant="secondary" class="text-xs">Project</Badge>
                  {:else}
                    <Badge variant="outline" class="text-xs">Org-wide</Badge>
                  {/if}
                  <Badge variant={pipeline.enabled ? 'default' : 'secondary'} class="text-xs">
                    {pipeline.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                {#if pipeline.description}
                  <p class="text-sm text-muted-foreground mt-1 truncate">{pipeline.description}</p>
                {/if}
                <p class="text-xs text-muted-foreground mt-1">
                  {pipeline.steps.length} step{pipeline.steps.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div class="flex items-center gap-3 flex-shrink-0">
                <Switch
                  checked={pipeline.enabled}
                  onCheckedChange={() => handleToggle(pipeline)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  onclick={() => goto(`/dashboard/settings/pipelines/${pipeline.id}`)}
                  title="Edit pipeline"
                >
                  <Pencil class="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8 text-destructive hover:text-destructive"
                  onclick={() => openDeleteDialog(pipeline)}
                  title="Delete pipeline"
                >
                  <Trash2 class="w-4 h-4" />
                </Button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </CardContent>
  </Card>
</div>

<AlertDialog bind:open={deleteDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Delete Pipeline?</AlertDialogTitle>
      <AlertDialogDescription>
        Are you sure you want to delete <strong>{deleteTarget?.name}</strong>?
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onclick={() => { deleteDialogOpen = false; deleteTarget = null; }}>
        Cancel
      </AlertDialogCancel>
      <AlertDialogAction
        onclick={handleDelete}
        class="bg-destructive hover:bg-destructive/90"
        disabled={deleting}
      >
        {deleting ? 'Deleting...' : 'Delete'}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
