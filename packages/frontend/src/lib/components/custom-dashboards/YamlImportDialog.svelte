<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import Button from '$lib/components/ui/button/button.svelte';
  import Label from '$lib/components/ui/label/label.svelte';
  import Textarea from '$lib/components/ui/textarea/textarea.svelte';
  import Upload from '@lucide/svelte/icons/upload';

  interface Props {
    open: boolean;
    onImport: (yamlText: string) => void;
    onOpenChange: (open: boolean) => void;
  }

  let { open = $bindable(), onImport, onOpenChange }: Props = $props();

  let yamlText = $state('');
  let fileName = $state('');

  function reset() {
    yamlText = '';
    fileName = '';
  }

  async function handleFileUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    fileName = file.name;
    yamlText = await file.text();
  }

  function handleImport() {
    if (yamlText.trim().length === 0) return;
    onImport(yamlText);
    reset();
    onOpenChange(false);
  }
</script>

<Dialog.Root
  bind:open
  onOpenChange={(o) => {
    if (!o) reset();
    onOpenChange(o);
  }}
>
  <Dialog.Content class="max-w-xl">
    <Dialog.Header>
      <Dialog.Title>Import dashboard YAML</Dialog.Title>
      <Dialog.Description>
        Paste a previously exported dashboard YAML or upload a file. A new
        dashboard will be created in your organization.
      </Dialog.Description>
    </Dialog.Header>

    <div class="space-y-4 py-2">
      <div class="space-y-1.5">
        <Label for="yaml-file">Upload file</Label>
        <div class="flex items-center gap-2">
          <input
            id="yaml-file"
            type="file"
            accept=".yaml,.yml,application/x-yaml,text/yaml"
            onchange={handleFileUpload}
            class="hidden"
          />
          <Button
            variant="outline"
            onclick={() => document.getElementById('yaml-file')?.click()}
            class="gap-2"
          >
            <Upload class="w-4 h-4" />
            Choose file…
          </Button>
          {#if fileName}
            <span class="text-xs text-muted-foreground truncate">{fileName}</span>
          {/if}
        </div>
      </div>

      <div class="space-y-1.5">
        <Label for="yaml-text">Or paste YAML</Label>
        <Textarea
          id="yaml-text"
          rows={10}
          value={yamlText}
          oninput={(e) => (yamlText = (e.currentTarget as HTMLTextAreaElement).value)}
          class="font-mono text-xs"
        />
      </div>
    </div>

    <Dialog.Footer>
      <Button variant="ghost" onclick={() => onOpenChange(false)}>Cancel</Button>
      <Button disabled={yamlText.trim().length === 0} onclick={handleImport}>
        Import
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
