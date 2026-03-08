<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { currentOrganization } from '$lib/stores/organization';
	import { projectsAPI } from '$lib/api/projects';
	import { toastStore } from '$lib/stores/toast';
	import Card from '$lib/components/ui/card/card.svelte';
	import CardContent from '$lib/components/ui/card/card-content.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import { layoutStore } from '$lib/stores/layout';

	interface Props {
		children: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	let project = $state<any>(null);
	let capabilities = $state<{ hasWebVitals: boolean; hasSessions: boolean }>({ hasWebVitals: false, hasSessions: false });
	let loading = $state(false);
	let error = $state('');
	let lastLoadedKey = $state<string | null>(null);
	let maxWidthClass = $state("max-w-7xl");
	let containerPadding = $state("px-6 py-8");

	$effect(() => {
		const unsubscribe = layoutStore.maxWidthClass.subscribe((value) => {
			maxWidthClass = value;
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = layoutStore.containerPadding.subscribe((value) => {
			containerPadding = value;
		});
		return unsubscribe;
	});

	const projectId = $derived(page.params.id);

	const currentPath = $derived(page.url.pathname);

	const allTabs = ['overview', 'performance', 'sessions', 'alerts', 'settings'] as const;

	const currentTab = $derived(() => {
		const segments = currentPath.split('/');
		const last = segments[segments.length - 1];
		if (allTabs.includes(last as any)) return last;
		return 'overview';
	});

	const visibleTabs = $derived(() => {
		const tabs: Array<{ value: string; label: string }> = [
			{ value: 'overview', label: 'Overview' },
		];
		if (capabilities.hasWebVitals) {
			tabs.push({ value: 'performance', label: 'Performance' });
		}
		if (capabilities.hasSessions) {
			tabs.push({ value: 'sessions', label: 'Sessions' });
		}
		tabs.push({ value: 'alerts', label: 'Alerts' });
		tabs.push({ value: 'settings', label: 'Settings' });
		return tabs;
	});

	async function loadProject(orgId: string, projId: string) {
		loading = true;
		error = '';

		try {
			const [response, caps] = await Promise.all([
				projectsAPI.getProjects(orgId),
				projectsAPI.getProjectCapabilities(projId).catch(() => ({ hasWebVitals: false, hasSessions: false })),
			]);

			const foundProject = response.projects.find((p) => p.id === projId);

			if (!foundProject) {
				error = 'Project not found';
				toastStore.error('Project not found');
				goto('/dashboard/projects');
				return;
			}

			project = foundProject;
			capabilities = caps;
			lastLoadedKey = `${orgId}-${projId}`;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load project';
			toastStore.error(error);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!browser || !$currentOrganization || !projectId) {
			project = null;
			lastLoadedKey = null;
			return;
		}

		const key = `${$currentOrganization.id}-${projectId}`;
		if (key === lastLoadedKey) return;

		loadProject($currentOrganization.id, projectId);
	});

	// Handle tab change
	function handleTabChange(tab: string) {
		const basePath = `/dashboard/projects/${projectId}`;
		goto(`${basePath}/${tab}`);
	}
</script>

<div class="container mx-auto {containerPadding} {maxWidthClass} space-y-6">
	{#if error}
		<Card>
			<CardContent class="py-12 text-center">
				<p class="text-destructive">{error}</p>
			</CardContent>
		</Card>
	{:else if project}
		<div>
			<h1 class="text-3xl font-bold tracking-tight">{project.name}</h1>
			{#if project.description}
				<p class="text-muted-foreground mt-2">{project.description}</p>
			{/if}
		</div>

		<Tabs.Root value={currentTab()} onValueChange={handleTabChange}>
			<Tabs.List class="grid w-full" style="grid-template-columns: repeat({visibleTabs().length}, minmax(0, 1fr))">
				{#each visibleTabs() as tab (tab.value)}
					<Tabs.Trigger value={tab.value}>{tab.label}</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>

		<div>
			{@render children()}
		</div>
	{:else}
		<div class="flex items-center justify-center py-12">
			<Spinner size="lg" />
			<span class="ml-3 text-muted-foreground">Loading project...</span>
		</div>
	{/if}
</div>
