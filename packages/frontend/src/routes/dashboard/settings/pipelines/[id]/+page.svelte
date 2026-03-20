<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authStore } from '$lib/stores/auth';
  import { organizationStore } from '$lib/stores/organization';
  import { toastStore } from '$lib/stores/toast';
  import { pipelineStore } from '$lib/stores/log-pipeline';
  import type { PipelineStep } from '$lib/api/log-pipeline';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Switch } from '$lib/components/ui/switch';
  import Spinner from '$lib/components/Spinner.svelte';
  import StepBuilder from '$lib/components/pipelines/StepBuilder.svelte';
  import PipelinePreview from '$lib/components/pipelines/PipelinePreview.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import GitBranch from '@lucide/svelte/icons/git-branch';

  let token: string | null = null;
  let organizationId = $state<string | null>(null);
  let initialOrgId: string | null = null;

  let pipelineId = $derived(page.params.id);

  let name = $state('');
  let description = $state('');
  let enabled = $state(true);
  let steps = $state<PipelineStep[]>([]);
  let loadingPipeline = $state(true);
  let saving = $state(false);
  let loadError = $state<string | null>(null);

  authStore.subscribe((s) => {
    token = s.token;
  });

  organizationStore.subscribe((s) => {
    organizationId = s.currentOrganization?.id ?? null;
  });

  $effect(() => {
    if (!token) {
      goto('/login');
      return;
    }
    if (!organizationId) {
      loadError = 'No organization selected';
      loadingPipeline = false;
      return;
    }
    if (initialOrgId && initialOrgId !== organizationId) {
      goto('/dashboard/settings/pipelines');
      return;
    }
    initialOrgId = organizationId;
    loadPipeline();
  });

  async function loadPipeline() {
    loadingPipeline = true;
    loadError = null;
    try {
      const pipeline = await pipelineStore.get(pipelineId, organizationId!);
      name = pipeline.name;
      description = pipeline.description ?? '';
      enabled = pipeline.enabled;
      steps = pipeline.steps;
    } catch (e) {
      loadError = e instanceof Error ? e.message : 'Failed to load pipeline';
    } finally {
      loadingPipeline = false;
    }
  }

  async function handleSave() {
    if (!organizationId) return;
    if (!name.trim()) {
      toastStore.error('Pipeline name is required');
      return;
    }
    saving = true;
    try {
      await pipelineStore.update(pipelineId, organizationId, {
        name: name.trim(),
        description: description.trim() || undefined,
        steps,
        enabled,
      });
      toastStore.success('Pipeline saved');
      goto('/dashboard/settings/pipelines');
    } catch (e) {
      toastStore.error(e instanceof Error ? e.message : 'Failed to save pipeline');
    } finally {
      saving = false;
    }
  }
</script>

<svelte:head>
  <title>Edit Pipeline - LogTide</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center gap-3">
    <Button variant="ghost" size="icon" onclick={() => goto('/dashboard/settings/pipelines')}>
      <ArrowLeft class="w-4 h-4" />
    </Button>
    <div>
      <h2 class="text-xl font-semibold flex items-center gap-2">
        <GitBranch class="w-5 h-5" />
        Edit Pipeline
      </h2>
      <p class="text-sm text-muted-foreground">Update pipeline configuration</p>
    </div>
  </div>

  {#if loadingPipeline}
    <div class="flex items-center justify-center py-16">
      <Spinner size="md" />
      <span class="ml-2 text-sm text-muted-foreground">Loading pipeline...</span>
    </div>
  {:else if loadError}
    <div class="text-destructive text-sm py-4">{loadError}</div>
  {:else}
    <!-- Basic Info -->
    <Card>
      <CardHeader>
        <CardTitle>Basic Info</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <Label for="pipeline-name">Name *</Label>
          <Input
            id="pipeline-name"
            type="text"
            placeholder="nginx-access-logs"
            bind:value={name}
            disabled={saving}
          />
        </div>
        <div class="space-y-2">
          <Label for="pipeline-desc">Description</Label>
          <Textarea
            id="pipeline-desc"
            placeholder="Parse nginx access log format and enrich with GeoIP data"
            bind:value={description}
            disabled={saving}
            rows={2}
          />
        </div>
        <div class="flex items-center gap-3">
          <Switch bind:checked={enabled} disabled={saving} />
          <span class="text-sm">{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
      </CardContent>
    </Card>

    <!-- Steps -->
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Steps</CardTitle>
        <CardDescription>
          Steps are executed in order. Each step can parse or enrich log data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StepBuilder {steps} onChange={(s) => { steps = s; }} />
      </CardContent>
    </Card>

    <!-- Preview -->
    {#if organizationId}
      <PipelinePreview {organizationId} {steps} />
    {/if}

    <!-- Actions -->
    <div class="flex items-center justify-end gap-3">
      <Button
        variant="outline"
        onclick={() => goto('/dashboard/settings/pipelines')}
        disabled={saving}
      >
        Cancel
      </Button>
      <Button onclick={handleSave} disabled={saving || !name.trim()}>
        {saving ? 'Saving...' : 'Save changes'}
      </Button>
    </div>
  {/if}
</div>
