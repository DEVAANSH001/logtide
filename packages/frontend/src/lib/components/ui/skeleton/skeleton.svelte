<script lang="ts">
  interface Props {
    class?: string;
    className?: string;
    width?: string;
    height?: string;
    rounded?: 'sm' | 'md' | 'lg' | 'full' | 'none';
  }

  let {
    class: classProp = '',
    className = '',
    width,
    height,
    rounded = 'md',
  }: Props = $props();

  const roundedMap = {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
    none: 'rounded-none',
  };

  const combinedClass = $derived(
    `skeleton ${roundedMap[rounded]} ${classProp} ${className}`.trim()
  );
</script>

<div
  class={combinedClass}
  style:width={width}
  style:height={height}
  aria-hidden="true"
></div>
