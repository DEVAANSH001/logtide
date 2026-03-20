<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth';
  import { organizationStore } from '$lib/stores/organization';
  import { toastStore } from '$lib/stores/toast';
  import { pipelineStore } from '$lib/stores/log-pipeline';
  import type { PipelineStep } from '$lib/api/log-pipeline';
  import { logPipelineAPI } from '$lib/api/log-pipeline';
  import Button from '$lib/components/ui/button/button.svelte';
  import Input from '$lib/components/ui/input/input.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
  import { Switch } from '$lib/components/ui/switch';
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from '$lib/components/ui/dialog';
  import StepBuilder from '$lib/components/pipelines/StepBuilder.svelte';
  import PipelinePreview from '$lib/components/pipelines/PipelinePreview.svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Upload from '@lucide/svelte/icons/upload';
  import GitBranch from '@lucide/svelte/icons/git-branch';

  let token: string | null = null;
  let organizationId = $state<string | null>(null);

  let name = $state('');
  let description = $state('');
  let enabled = $state(true);
  let steps = $state<PipelineStep[]>([]);
  let saving = $state(false);

  let importDialogOpen = $state(false);
  let importYaml = $state('');
  let importing = $state(false);

  authStore.subscribe((s) => {
    token = s.token;
  });

  organizationStore.subscribe((s) => {
    organizationId = s.currentOrganization?.id ?? null;
  });

  onMount(() => {
    if (!token) goto('/login');
  });

  async function handleCreate() {
    if (!organizationId) return;
    if (!name.trim()) {
      toastStore.error('Pipeline name is required');
      return;
    }
    saving = true;
    try {
      await pipelineStore.create(organizationId, {
        name: name.trim(),
        description: description.trim() || undefined,
        steps,
        enabled,
      });
      toastStore.success('Pipeline created');
      goto('/dashboard/settings/pipelines');
    } catch (e) {
      toastStore.error(e instanceof Error ? e.message : 'Failed to create pipeline');
    } finally {
      saving = false;
    }
  }

  async function handleImport() {
    if (!organizationId || !importYaml.trim()) return;
    importing = true;
    try {
      const pipeline = await logPipelineAPI.importYaml(organizationId, null, importYaml);
      toastStore.success('Pipeline imported');
      importDialogOpen = false;
      goto('/dashboard/settings/pipelines');
    } catch (e) {
      toastStore.error(e instanceof Error ? e.message : 'Failed to import pipeline');
    } finally {
      importing = false;
    }
  }
</script>

<svelte:head>
  <title>New Pipeline - LogTide</title>
</svelte:head>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-3">
      <Button variant="ghost" size="icon" onclick={() => goto('/dashboard/settings/pipelines')}>
        <ArrowLeft class="w-4 h-4" />
      </Button>
      <div>
        <h2 class="text-xl font-semibold flex items-center gap-2">
          <GitBranch class="w-5 h-5" />
          New Pipeline
        </h2>
        <p class="text-sm text-muted-foreground">Define parsing and enrichment steps for your logs</p>
      </div>
    </div>
    <Button variant="outline" class="gap-2" onclick={() => importDialogOpen = true}>
      <Upload class="w-4 h-4" />
      Import from YAML
    </Button>
  </div>

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
    <Button onclick={handleCreate} disabled={saving || !name.trim()}>
      {saving ? 'Creating...' : 'Create pipeline'}
    </Button>
  </div>
</div>

<!-- Import YAML Dialog -->
<Dialog bind:open={importDialogOpen}>
  <DialogContent class="max-w-lg">
    <DialogHeader>
      <DialogTitle>Import Pipeline from YAML</DialogTitle>
      <DialogDescription>
        Paste your pipeline YAML definition below to import it.
      </DialogDescription>
    </DialogHeader>
    <div class="space-y-3">
      <Textarea
        placeholder="name: my-pipeline&#10;steps:&#10;  - type: parser&#10;    parser: nginx"
        bind:value={importYaml}
        rows={12}
        class="font-mono text-sm"
        disabled={importing}
      />
    </div>
    <DialogFooter>
      <Button
        variant="outline"
        onclick={() => { importDialogOpen = false; importYaml = ''; }}
        disabled={importing}
      >
        Cancel
      </Button>
      <Button onclick={handleImport} disabled={importing || !importYaml.trim()} class="gap-2">
        <Upload class="w-4 h-4" />
        {importing ? 'Importing...' : 'Import'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
