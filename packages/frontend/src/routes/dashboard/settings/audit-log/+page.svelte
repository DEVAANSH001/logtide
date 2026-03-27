<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { organizationStore } from '$lib/stores/organization';
	import {
		getAuditLog,
		getAuditLogActions,
		exportAuditLogCsv,
		type AuditLogEntry,
		type AuditCategory,
	} from '$lib/api/audit-log';
	import {
		Card,
		CardContent,
		CardHeader,
		CardTitle,
	} from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
	} from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { OrganizationWithRole } from '@logtide/shared';
	import { canManageMembers } from '@logtide/shared';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Download from '@lucide/svelte/icons/download';

	const CATEGORIES: { value: AuditCategory; label: string; color: string }[] = [
		{
			value: 'log_access',
			label: 'Log Access',
			color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
		},
		{
			value: 'config_change',
			label: 'Config Change',
			color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
		},
		{
			value: 'user_management',
			label: 'User Management',
			color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
		},
		{
			value: 'data_modification',
			label: 'Data Modification',
			color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
		},
	];

	let token: string | null = null;
	let currentOrg = $state<OrganizationWithRole | null>(null);

	let entries = $state<AuditLogEntry[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let error = $state('');
	let availableActions = $state<string[]>([]);
	let lastLoadedOrgId = $state<string | null>(null);
	let expandedId = $state<string | null>(null);
	let exporting = $state(false);

	// Filters
	let categoryFilter = $state<AuditCategory | ''>('');
	let actionFilter = $state('');

	// Pagination
	let currentPage = $state(1);
	const pageSize = 50;

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

	$effect(() => {
		if (browser && currentOrg && currentOrg.id !== lastLoadedOrgId) {
			lastLoadedOrgId = currentOrg.id;
			currentPage = 1;
			void loadEntries();
			void loadActions();
		}
	});

	async function loadEntries() {
		if (!currentOrg) return;
		loading = true;
		error = '';
		try {
			const result = await getAuditLog({
				organizationId: currentOrg.id,
				category: categoryFilter || undefined,
				action: actionFilter || undefined,
				limit: pageSize,
				offset: (currentPage - 1) * pageSize,
			});
			entries = result.entries;
			total = result.total;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load audit log';
		} finally {
			loading = false;
		}
	}

	async function loadActions() {
		if (!currentOrg) return;
		try {
			availableActions = await getAuditLogActions(currentOrg.id);
		} catch {
			// Not critical
		}
	}

	function applyFilters() {
		currentPage = 1;
		void loadEntries();
	}

	function clearFilters() {
		categoryFilter = '';
		actionFilter = '';
		currentPage = 1;
		void loadEntries();
	}

	async function handleExport() {
		if (!currentOrg || exporting) return;
		exporting = true;
		try {
			await exportAuditLogCsv({
				organizationId: currentOrg.id,
				category: categoryFilter || undefined,
				action: actionFilter || undefined,
			});
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to export';
		} finally {
			exporting = false;
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage -= 1;
			void loadEntries();
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage += 1;
			void loadEntries();
		}
	}

	function toggleExpand(id: string) {
		expandedId = expandedId === id ? null : id;
	}

	const totalPages = $derived(Math.max(1, Math.ceil(total / pageSize)));

	function getCategoryInfo(cat: string) {
		return (
			CATEGORIES.find((c) => c.value === cat) ?? {
				label: cat,
				color: 'bg-gray-100 text-gray-800',
			}
		);
	}

	function formatDate(iso: string) {
		return new Date(iso).toLocaleString();
	}

	function formatAction(action: string) {
		return action.replace(/_/g, ' ');
	}

	function describeEntry(entry: AuditLogEntry): string {
		const actor = entry.user_email ?? 'Unknown user';
		const action = formatAction(entry.action);
		const resource = entry.resource_type ?? '';
		const meta = entry.metadata;

		// Build a human-readable description from action + metadata
		switch (entry.action) {
			case 'create_organization':
				return `${actor} created organization "${meta?.name ?? ''}"`;
			case 'update_organization':
				return `${actor} updated organization settings${meta?.name ? ` (name: "${meta.name}")` : ''}`;
			case 'delete_organization':
				return `${actor} deleted the organization`;
			case 'leave_organization':
				return `${actor} left the organization`;
			case 'create_project':
				return `${actor} created project "${meta?.name ?? ''}"`;
			case 'update_project':
				return `${actor} updated project${meta?.name ? ` "${meta.name}"` : ''}${meta?.description !== undefined ? ' description' : ''}`;
			case 'delete_project':
				return `${actor} deleted a project`;
			case 'create_api_key':
				return `${actor} created API key "${meta?.name ?? ''}" (${meta?.type ?? 'write'})`;
			case 'revoke_api_key':
				return `${actor} revoked an API key`;
			case 'update_member_role':
				return `${actor} changed a member's role to ${meta?.role ?? 'unknown'}`;
			case 'remove_member':
				return `${actor} removed a member from the organization`;
			case 'register':
				return `${actor} registered a new account`;
			case 'login':
				return `${actor} logged in`;
			case 'logout':
				return `${actor} logged out`;
			case 'delete_account':
				return `${actor} deleted their account`;
			case 'disable_user':
			case 'enable_user':
				return `${actor} ${entry.action === 'disable_user' ? 'disabled' : 'enabled'} user ${meta?.targetEmail ?? ''}`;
			case 'update_user_role':
				return `${actor} ${meta?.is_admin ? 'promoted' : 'demoted'} user ${meta?.targetEmail ?? ''}`;
			case 'reset_user_password':
				return `${actor} reset password for ${meta?.targetEmail ?? ''}`;
			default:
				return `${actor} performed ${action}${resource ? ` on ${resource}` : ''}`;
		}
	}
</script>

<svelte:head>
	<title>Audit Log - LogTide</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-end gap-2">
		<Button variant="outline" size="sm" onclick={handleExport} disabled={exporting || !canManage}>
			<Download class="h-4 w-4 mr-1" />
			{exporting ? 'Exporting...' : 'Export CSV'}
		</Button>
		<Button variant="outline" size="sm" onclick={() => loadEntries()}>
			<RotateCcw class="h-4 w-4 mr-1" />
			Refresh
		</Button>
	</div>

	{#if !canManage}
		<Card>
			<CardContent class="py-12 text-center">
				<ClipboardList class="mx-auto h-10 w-10 text-muted-foreground/40" />
				<p class="mt-3 text-sm text-muted-foreground">
					Only organization owners and admins can view the audit log.
				</p>
			</CardContent>
		</Card>
	{:else}
		<!-- Filters -->
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-base">Filters</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="flex flex-wrap items-end gap-3">
					<div class="space-y-1">
						<label for="category-filter" class="text-xs font-medium text-muted-foreground"
							>Category</label
						>
						<select
							id="category-filter"
							bind:value={categoryFilter}
							onchange={applyFilters}
							class="flex h-9 w-44 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							<option value="">All categories</option>
							{#each CATEGORIES as cat}
								<option value={cat.value}>{cat.label}</option>
							{/each}
						</select>
					</div>

					<div class="space-y-1">
						<label for="action-filter" class="text-xs font-medium text-muted-foreground"
							>Action</label
						>
						<select
							id="action-filter"
							bind:value={actionFilter}
							onchange={applyFilters}
							class="flex h-9 w-52 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						>
							<option value="">All actions</option>
							{#each availableActions as action}
								<option value={action}>{formatAction(action)}</option>
							{/each}
						</select>
					</div>

					{#if categoryFilter || actionFilter}
						<Button variant="ghost" size="sm" onclick={clearFilters} class="h-9">
							Clear
						</Button>
					{/if}
				</div>
			</CardContent>
		</Card>

		<!-- Events table -->
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="text-base">
					{total} event{total !== 1 ? 's' : ''}
				</CardTitle>
			</CardHeader>
			<CardContent class="p-0">
				{#if loading}
					<div class="flex justify-center py-12">
						<Spinner />
					</div>
				{:else if error}
					<p class="py-8 text-center text-sm text-destructive">{error}</p>
				{:else if entries.length === 0}
					<div class="py-12 text-center">
						<ClipboardList class="mx-auto h-10 w-10 text-muted-foreground/40" />
						<p class="mt-3 text-sm text-muted-foreground">No audit events found.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead class="w-[30px]"></TableHead>
									<TableHead class="w-[170px]">Time</TableHead>
									<TableHead>User</TableHead>
									<TableHead>Category</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Resource</TableHead>
									<TableHead>IP Address</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{#each entries as entry (entry.id)}
									{@const catInfo = getCategoryInfo(entry.category)}
									{@const isExpanded = expandedId === entry.id}
									<TableRow
										class="cursor-pointer hover:bg-muted/50"
										role="button"
										tabindex={0}
										onclick={() => toggleExpand(entry.id)}
										onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(entry.id); } }}
									>
										<TableCell class="pr-0">
											<ChevronDown
												class="h-4 w-4 text-muted-foreground transition-transform {isExpanded ? '' : '-rotate-90'}"
											/>
										</TableCell>
										<TableCell class="whitespace-nowrap text-xs text-muted-foreground">
											{formatDate(entry.time)}
										</TableCell>
										<TableCell class="text-sm">
											{entry.user_email ?? '\u2014'}
										</TableCell>
										<TableCell>
											<span
												class="inline-flex rounded-full px-2 py-0.5 text-xs font-medium {catInfo.color}"
											>
												{catInfo.label}
											</span>
										</TableCell>
										<TableCell class="font-mono text-sm">
											{formatAction(entry.action)}
										</TableCell>
										<TableCell class="text-sm">
											{#if entry.resource_type}
												<span class="text-muted-foreground">{entry.resource_type}</span>
												{#if entry.resource_id}
													<span class="ml-1 font-mono text-xs text-muted-foreground/70"
														>{entry.resource_id.length > 12
															? entry.resource_id.slice(0, 8) + '\u2026'
															: entry.resource_id}</span
													>
												{/if}
											{:else}
												<span class="text-muted-foreground/50">\u2014</span>
											{/if}
										</TableCell>
										<TableCell class="font-mono text-xs text-muted-foreground">
											{entry.ip_address ?? '\u2014'}
										</TableCell>
									</TableRow>
									{#if isExpanded}
										<TableRow class="hover:bg-transparent">
											<TableCell colspan={7} class="p-0">
												<div class="bg-muted/30 mx-6 mb-4 mt-1 rounded-md px-5 py-4">
													<p class="text-sm mb-3">{describeEntry(entry)}</p>
													<div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
														<div>
															<span class="text-xs font-medium text-muted-foreground">Time</span>
															<p>{new Date(entry.time).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'long' })}</p>
														</div>
														<div>
															<span class="text-xs font-medium text-muted-foreground">User</span>
															<p>{entry.user_email ?? '\u2014'}</p>
															{#if entry.user_id}
																<p class="font-mono text-xs text-muted-foreground">{entry.user_id}</p>
															{/if}
														</div>
														{#if entry.resource_type}
															<div>
																<span class="text-xs font-medium text-muted-foreground">Resource Type</span>
																<p>{entry.resource_type}</p>
															</div>
														{/if}
														{#if entry.resource_id}
															<div>
																<span class="text-xs font-medium text-muted-foreground">Resource ID</span>
																<p class="font-mono text-xs break-all">{entry.resource_id}</p>
															</div>
														{/if}
														<div>
															<span class="text-xs font-medium text-muted-foreground">IP Address</span>
															<p class="font-mono">{entry.ip_address ?? '\u2014'}</p>
														</div>
														{#if entry.user_agent}
															<div class="md:col-span-2">
																<span class="text-xs font-medium text-muted-foreground">User Agent</span>
																<p class="text-xs text-muted-foreground break-all">{entry.user_agent}</p>
															</div>
														{/if}
														{#if entry.metadata && Object.keys(entry.metadata).length > 0}
															<div class="md:col-span-2">
																<span class="text-xs font-medium text-muted-foreground">Details</span>
																<div class="mt-1 rounded-md bg-background border p-3">
																	<dl class="space-y-1">
																		{#each Object.entries(entry.metadata) as [key, value]}
																			<div class="flex gap-2 text-sm">
																				<dt class="font-mono text-xs text-muted-foreground shrink-0">{key}:</dt>
																				<dd class="font-mono text-xs break-all">
																					{typeof value === 'object' ? JSON.stringify(value) : String(value)}
																				</dd>
																			</div>
																		{/each}
																	</dl>
																</div>
															</div>
														{/if}
													</div>
												</div>
											</TableCell>
										</TableRow>
									{/if}
								{/each}
							</TableBody>
						</Table>
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Pagination -->
		{#if totalPages > 1}
			<div class="flex items-center justify-between">
				<p class="text-sm text-muted-foreground">
					Page {currentPage} of {totalPages} ({total} total)
				</p>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" disabled={currentPage <= 1} onclick={prevPage}>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={currentPage >= totalPages}
						onclick={nextPage}
					>
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			</div>
		{/if}
	{/if}
</div>
