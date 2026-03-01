<script lang="ts">
	import { browser } from "$app/environment";
	import { currentOrganization } from "$lib/stores/organization";
	import { sigmaAPI, type SigmaRule } from "$lib/api/sigma";
	import { toastStore } from "$lib/stores/toast";
	import Button from "$lib/components/ui/button/button.svelte";
	import { Card, CardContent } from "$lib/components/ui/card";
	import SigmaRulesList from "$lib/components/SigmaRulesList.svelte";
	import SigmaRuleDetailsDialog from "$lib/components/SigmaRuleDetailsDialog.svelte";
	import SigmaSyncDialog from "$lib/components/SigmaSyncDialog.svelte";
	import DetectionPacksGalleryDialog from "$lib/components/DetectionPacksGalleryDialog.svelte";
	import Spinner from "$lib/components/Spinner.svelte";
	import Shield from "@lucide/svelte/icons/shield";
	import Package from "@lucide/svelte/icons/package";
	import Download from "@lucide/svelte/icons/download";
	import FolderKanban from "@lucide/svelte/icons/folder-kanban";
	import { layoutStore } from "$lib/stores/layout";

	let sigmaRules = $state<SigmaRule[]>([]);
	let loading = $state(false);
	let error = $state("");
	let lastLoadedOrgId = $state<string | null>(null);
	let selectedSigmaRule = $state<SigmaRule | null>(null);
	let showSigmaDetails = $state(false);
	let showSyncDialog = $state(false);
	let showPacksDialog = $state(false);
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

	async function loadSigmaRules() {
		if (!$currentOrganization) return;

		loading = true;
		error = "";

		try {
			const res = await sigmaAPI.getRules($currentOrganization.id);
			sigmaRules = res.rules || [];
			lastLoadedOrgId = $currentOrganization.id;
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to load Sigma rules";
			toastStore.error(error);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		if (!browser || !$currentOrganization) {
			sigmaRules = [];
			lastLoadedOrgId = null;
			return;
		}

		if ($currentOrganization.id === lastLoadedOrgId) return;

		loadSigmaRules();
	});
</script>

<svelte:head>
	<title>Sigma Rules - LogTide</title>
</svelte:head>

<div class="container mx-auto {containerPadding} {maxWidthClass}">
	<div class="flex items-start justify-between mb-6">
		<div>
			<div class="flex items-center gap-3 mb-2">
				<Shield class="w-8 h-8 text-primary" />
				<h1 class="text-3xl font-bold tracking-tight">Sigma Rules</h1>
			</div>
			<p class="text-muted-foreground">
				Manage security detection rules. Import from SigmaHQ or install detection packs.
			</p>
		</div>
		<div class="flex gap-2">
			<Button
				onclick={() => (showPacksDialog = true)}
				size="lg"
				variant="outline"
				class="gap-2"
			>
				<Package class="w-5 h-5" />
				Detection Packs
			</Button>
			<Button
				onclick={() => (showSyncDialog = true)}
				size="lg"
				variant="outline"
				class="gap-2"
			>
				<Download class="w-5 h-5" />
				Sync from SigmaHQ
			</Button>
		</div>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Spinner />
			<span class="ml-3 text-muted-foreground">Loading Sigma rules...</span>
		</div>
	{:else if error}
		<Card>
			<CardContent class="py-12 text-center text-destructive">
				{error}
			</CardContent>
		</Card>
	{:else if sigmaRules.length === 0}
		<Card class="border-2 border-dashed">
			<CardContent class="py-16 text-center">
				<div class="w-16 h-16 mx-auto mb-6 rounded-full bg-primary/10 flex items-center justify-center">
					<FolderKanban class="w-8 h-8 text-primary" />
				</div>
				<h3 class="text-xl font-semibold mb-2">No Sigma rules yet</h3>
				<p class="text-muted-foreground mb-6 max-w-md mx-auto">
					Import Sigma rules to automatically detect security threats in your logs
				</p>
				<div class="flex gap-2 justify-center">
					<Button onclick={() => (showPacksDialog = true)} size="lg" variant="outline" class="gap-2">
						<Package class="w-5 h-5" />
						Browse Detection Packs
					</Button>
					<Button onclick={() => (showSyncDialog = true)} size="lg" class="gap-2">
						<Download class="w-5 h-5" />
						Sync from SigmaHQ
					</Button>
				</div>
			</CardContent>
		</Card>
	{:else}
		<SigmaRulesList
			rules={sigmaRules}
			organizationId={$currentOrganization?.id ?? ''}
			onrefresh={loadSigmaRules}
			onview={(rule) => {
				selectedSigmaRule = rule;
				showSigmaDetails = true;
			}}
		/>
	{/if}
</div>

{#if $currentOrganization}
	<SigmaRuleDetailsDialog
		bind:open={showSigmaDetails}
		rule={selectedSigmaRule}
	/>

	<SigmaSyncDialog
		bind:open={showSyncDialog}
		organizationId={$currentOrganization.id}
		onSuccess={() => {
			loadSigmaRules();
		}}
	/>

	<DetectionPacksGalleryDialog
		bind:open={showPacksDialog}
		organizationId={$currentOrganization.id}
		onSuccess={() => {
			loadSigmaRules();
		}}
	/>
{/if}
