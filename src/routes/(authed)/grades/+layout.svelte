<script lang="ts">
	import BoundaryFailure from '$lib/components/BoundaryFailure.svelte';
	import PostLoginLoadingScreen from '$lib/components/auth/PostLoginLoadingScreen.svelte';
	import { acc } from '$lib/account.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Item from '$lib/components/ui/item';
	import {
		getReportPeriodName,
		gradebookState,
		initializeGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import AlertCircleIcon from '@lucide/svelte/icons/alert-circle';
	import HistoryIcon from '@lucide/svelte/icons/history';
	import { onMount } from 'svelte';
	import { portalConnection } from '$lib/session.svelte';

	let { children } = $props();
	const loadingError = $derived.by(() => {
		gradebookState.version;
		return gradebookState.loadingError;
	});

	const gradebookCatalog = $derived.by(() => {
		gradebookState.version;
		return gradebookState.gradebookCatalog;
	});

	const loadingIndex = $derived(gradebookCatalog?.loadingIndex);
	const hasCachedLoadingRecord = $derived.by(() => {
		gradebookState.version;
		return loadingIndex !== undefined && gradebookCatalog?.recordCache[loadingIndex] !== undefined;
	});

	const defaultReportPeriodName = $derived(
		gradebookCatalog ? getReportPeriodName(gradebookCatalog.defaultIndex) : undefined
	);

	const loadingReportPeriodName = $derived(
		loadingIndex !== undefined ? getReportPeriodName(loadingIndex) : undefined
	);

	async function resetReportPeriodOverride() {
		try {
			await switchReportPeriod({ delta: true });
		} catch {
			// The shared gradebook state and toast already expose the failure.
		}
	}

	async function refreshGradebook() {
		try {
			await switchReportPeriod({
				overrideIndex: gradebookCatalog?.overrideIndex,
				forceRefresh: true,
				fresh: true
			});
		} catch {
			// The shared gradebook state and toast already expose the failure.
		}
	}

	async function retryGradebook() {
		if (!gradebookCatalog) {
			await initializeGradebookCatalog();
			return;
		}
		await refreshGradebook();
	}

	onMount(() => {
		if (!acc.studentAccount) return;
		void initializeGradebookCatalog();
	});
</script>

{#if gradebookCatalog === undefined && loadingError === undefined}
	<PostLoginLoadingScreen />
{:else if loadingIndex !== undefined && !hasCachedLoadingRecord}
	<div class="text-muted-foreground p-6" role="status" aria-live="polite">
		Loading {loadingReportPeriodName} grades…
	</div>
{/if}

{#if loadingError !== undefined}
	<Alert.Root
		variant={gradebookCatalog ? 'default' : 'destructive'}
		class="mx-auto w-fit min-w-sm {gradebookCatalog ? 'border-amber-400/30 bg-amber-400/10' : ''}"
		data-testid="gradebook-stale-indicator"
	>
		<AlertCircleIcon />
		<Alert.Title
			>{gradebookCatalog
				? 'Showing saved grades. StudentVUE is being difficult.'
				: 'An error occurred while loading grades.'}</Alert.Title
		>
		<Alert.Description>
			{#if gradebookCatalog}
				StudentVUE is unavailable right now. Your saved grades are still here; we'll retry
				automatically.
			{:else}
				{loadingError instanceof Error ? loadingError.message : String(loadingError)}
			{/if}
		</Alert.Description>
		<Button variant="outline" onclick={() => void retryGradebook()}>
			{portalConnection.state === 'offline' ? 'Retry now' : 'Try again'}
		</Button>
	</Alert.Root>
{/if}

{#if gradebookCatalog?.overrideIndex !== undefined}
	<div class="m-4 flex justify-center">
		<Item.Root variant="outline" size="sm" class="w-full max-w-3xl">
			<Item.Media>
				<HistoryIcon class="size-5" />
			</Item.Media>

			<Item.Content>
				<Item.Title class="whitespace-nowrap">
					<span>
						Viewing grades from
						<span class="font-bold">
							{getReportPeriodName(gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex)}
						</span>
					</span>
				</Item.Title>
			</Item.Content>

			<Item.Actions>
				<Button onclick={resetReportPeriodOverride} variant="outline">
					Return to {defaultReportPeriodName}
				</Button>
			</Item.Actions>
		</Item.Root>
	</div>
{/if}

<svelte:boundary>
	{@render children()}

	{#snippet failed(error, reset)}
		<BoundaryFailure {error} {reset} />
	{/snippet}
</svelte:boundary>
