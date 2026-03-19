<script lang="ts">
  import Skeleton from './skeleton.svelte';

  interface Props {
    rows?: number;
    columns?: number;
    columnWidths?: string[];
    class?: string;
    className?: string;
  }

  let {
    rows = 5,
    columns = 4,
    columnWidths = [],
    class: classProp = '',
    className = '',
  }: Props = $props();

  // Vary widths naturally so rows don't look identical
  const defaultWidths = ['70%', '55%', '65%', '45%', '60%', '50%', '40%'];

  function getCellWidth(colIndex: number): string {
    if (columnWidths[colIndex]) return columnWidths[colIndex];
    return defaultWidths[colIndex % defaultWidths.length];
  }

  // Vary height slightly per row for a natural look
  function getRowVariant(rowIndex: number): string {
    return rowIndex % 3 === 0 ? 'h-4' : rowIndex % 3 === 1 ? 'h-3.5' : 'h-4';
  }
</script>

<div class="rounded-md border overflow-hidden {classProp} {className}">
  <table class="w-full">
    <thead>
      <tr class="border-b bg-muted/30">
        {#each Array(columns) as _, i}
          <th class="px-4 py-3 text-left">
            <Skeleton class="h-3 w-20" />
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each Array(rows) as _, rowIndex}
        <tr class="border-b last:border-0">
          {#each { length: columns } as _, colIndex}
            <td class="px-4 py-3">
              <Skeleton
                class={getRowVariant(rowIndex)}
                width={getCellWidth(colIndex)}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
