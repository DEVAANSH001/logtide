<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const projectId = $derived(page.params.id);

	onMount(() => {
		goto(`/dashboard/projects/${projectId}/settings`, { replaceState: true });
	});
</script>

<div class="flex items-center justify-center py-12">
	<span class="text-muted-foreground">Redirecting...</span>
</div>
