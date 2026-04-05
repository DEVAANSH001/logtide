<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { organizationStore } from '$lib/stores/organization';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { ChannelsList, DefaultChannelsSettings } from '$lib/components/notification-channels';
	import type { OrganizationWithRole } from '@logtide/shared';
	import { canManageMembers } from '@logtide/shared';

	let token: string | null = null;
	let currentOrg = $state<OrganizationWithRole | null>(null);

	const unsubAuthStore = authStore.subscribe((state) => {
		token = state.token;
	});

	const unsubOrgStore = organizationStore.subscribe((state) => {
		currentOrg = state.currentOrganization;
	});

	onDestroy(() => {
		unsubAuthStore();
		unsubOrgStore();
	});

	onMount(() => {
		if (!token) {
			goto('/login');
			return;
		}
	});

	let canManage = $derived(currentOrg ? canManageMembers(currentOrg.role) : false);
</script>

<svelte:head>
	<title>Notification Channels - LogTide</title>
</svelte:head>

<div class="space-y-6">
	{#if !canManage}
		<Card>
			<CardContent class="py-8 text-center">
				<p class="text-muted-foreground">
					Only organization admins and owners can manage notification channels.
				</p>
			</CardContent>
		</Card>
	{:else}
		<Card>
			<CardHeader>
				<CardTitle>Channels</CardTitle>
				<CardDescription>
					Create reusable notification channels that can be assigned to alerts, Sigma rules, and
					other events
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChannelsList />
			</CardContent>
		</Card>

		<Separator />

		<Card>
			<CardHeader>
				<CardTitle>Organization Defaults</CardTitle>
				<CardDescription>
					Set default channels for each event type. These are used when no specific channels are
					configured.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DefaultChannelsSettings />
			</CardContent>
		</Card>
	{/if}
</div>
