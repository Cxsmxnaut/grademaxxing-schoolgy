<script lang="ts">
	import BoundaryFailure from '$lib/components/BoundaryFailure.svelte';
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
	import { fade, fly } from 'svelte/transition';
	import GradebookLoadingBanner from './GradebookLoadingBanner.svelte';

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

	const defaultReportPeriodName = $derived(
		gradebookCatalog ? getReportPeriodName(gradebookCatalog.defaultIndex) : undefined
	);

	const loadingReportPeriodName = $derived(
		loadingIndex !== undefined ? getReportPeriodName(loadingIndex) : undefined
	);

	async function resetReportPeriodOverride() {
		try {
			await switchReportPeriod();
		} catch {
			// The shared gradebook state and toast already expose the failure.
		}
	}

	async function refreshGradebook() {
		try {
			await switchReportPeriod({
				overrideIndex: gradebookCatalog?.overrideIndex,
				forceRefresh: true
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
	<div class="flex justify-center" in:fade out:fly={{ y: '-50%' }}>
		<GradebookLoadingBanner status="Pending" />
	</div>
{:else if loadingIndex !== undefined}
	<div class="flex justify-center" in:fade out:fly={{ y: '-50%' }}>
		{#key gradebookCatalog?.receivingData}
			<GradebookLoadingBanner
				{loadingReportPeriodName}
				status={gradebookCatalog?.receivingData ? 'Receiving' : 'Pending'}
			/>
		{/key}
	</div>
{/if}

{#if loadingError !== undefined}
	<Alert.Root variant="destructive" class="mx-auto w-fit min-w-sm">
		<AlertCircleIcon />
		<Alert.Title>An error occurred while loading grades.</Alert.Title>
		<Alert.Description>
			{loadingError instanceof Error ? loadingError.message : String(loadingError)}
		</Alert.Description>
		<Button variant="outline" onclick={() => void retryGradebook()}>Try again</Button>
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
