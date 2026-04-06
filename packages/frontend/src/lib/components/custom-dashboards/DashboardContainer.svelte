<script lang="ts">
  // CSS-Grid based dashboard layout with svelte-dnd-action drag-to-reorder.
  //
  // Layout strategy:
  //   - 12-column CSS Grid, auto rows of 80px (~ panel.layout.h * 80 px tall)
  //   - Both view and edit modes use auto-flow: each panel takes only `w`
  //     columns and `h` rows, and CSS Grid places them sequentially in array
  //     order. The `x` and `y` fields in PanelLayout are reserved for future
  //     arbitrary-positioning support but are NOT consumed yet, because the
  //     DnD reorder pipeline only mutates array order, not coordinates.
  //   - `grid-auto-flow: dense` lets smaller panels fill leftover gaps so
  //     mixed sizes don't leave holes in the grid.
  //
  // The container itself is dumb - it gets `panels` + `panelData` + edit mode
  // flag, dispatches reorder/edit/remove events upward.

  import { dndzone } from 'svelte-dnd-action';
  import type { PanelInstance } from '@logtide/shared';
  import PanelRenderer from './PanelRenderer.svelte';
  import type { PanelDataEntry } from '$lib/stores/custom-dashboards';

  interface Props {
    panels: PanelInstance[];
    panelData: Record<string, PanelDataEntry>;
    editMode: boolean;
    onReorder?: (panels: PanelInstance[]) => void;
    onEditPanel?: (panelId: string) => void;
    onRemovePanel?: (panelId: string) => void;
    onRefreshPanel?: (panelId: string) => void;
  }

  let {
    panels,
    panelData,
    editMode,
    onReorder,
    onEditPanel,
    onRemovePanel,
    onRefreshPanel,
  }: Props = $props();

  // svelte-dnd-action requires items to have an `id` field - PanelInstance does.
  // It also mutates internally; we always pass back through onReorder so the
  // store remains the source of truth.
  function handleConsider(e: CustomEvent<{ items: PanelInstance[] }>): void {
    onReorder?.(e.detail.items);
  }

  function handleFinalize(e: CustomEvent<{ items: PanelInstance[] }>): void {
    onReorder?.(e.detail.items);
  }

  function gridStyleFor(panel: PanelInstance): string {
    // Auto-flow placement: panel claims `w` columns and `h` rows, browser
    // places it after the previous one. Same in view and edit mode so the
    // post-save layout matches what the user saw while editing.
    const w = Math.min(Math.max(1, panel.layout.w), 12);
    const h = Math.max(1, panel.layout.h);
    return `grid-column: span ${w} / span ${w}; grid-row: span ${h} / span ${h};`;
  }

  function getEntry(id: string): PanelDataEntry {
    return (
      panelData[id] ?? {
        data: null,
        loading: false,
        error: null,
        lastFetchedAt: null,
      }
    );
  }
</script>

<div
  class="grid gap-4"
  style="grid-template-columns: repeat(12, minmax(0, 1fr)); grid-auto-rows: 80px; grid-auto-flow: dense;"
  use:dndzone={{
    items: panels,
    flipDurationMs: 200,
    dragDisabled: !editMode,
    dropTargetStyle: {},
  }}
  onconsider={handleConsider}
  onfinalize={handleFinalize}
>
  {#each panels as panel (panel.id)}
    {@const entry = getEntry(panel.id)}
    <div style={gridStyleFor(panel)} class="min-w-0">
      <PanelRenderer
        {panel}
        data={entry.data}
        loading={entry.loading}
        error={entry.error}
        {editMode}
        onEdit={onEditPanel}
        onRemove={onRemovePanel}
        onRefresh={onRefreshPanel}
      />
    </div>
  {/each}
</div>
