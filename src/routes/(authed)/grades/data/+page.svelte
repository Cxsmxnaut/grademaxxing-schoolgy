<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import { gradebookState, switchReportPeriod } from '$lib/grades/catalog.svelte';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import ReportPeriodSwitcher from '../ReportPeriodSwitcher.svelte';

	const gradebookCatalog = $derived.by(() => {
		gradebookState.version;
		return gradebookState.gradebookCatalog;
	});

	const gradebook = $derived.by(() => {
		gradebookState.version;
		return getActiveGradebook();
	});

	const gradebookRecord = $derived(
		gradebookCatalog
			? gradebookCatalog.recordCache[
					gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex
				]
			: undefined
	);

	async function changeReportPeriod(index: number) {
		try {
			await switchReportPeriod({ overrideIndex: index });
		} catch {
			// The parent grade layout surfaces the shared loading error.
		}
	}
</script>

<svelte:head><title>Grade Data - {brand}</title></svelte:head>

<AppPageShell class="flex min-h-[calc(100vh-4rem)] flex-col">
	<AppPageHeader
		eyebrow="Developer view"
		title="Grade data"
		description="The raw StudentVUE gradebook response for the selected report period."
	/>

	<div class="flex flex-1 flex-col items-center gap-4">
		{#if gradebookCatalog && gradebook}
			<ReportPeriodSwitcher
				activeIndex={gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex}
				reportPeriods={gradebookCatalog?.canonicalReportPeriodEntries ??
					gradebook.ReportingPeriods.ReportPeriod}
				switchReportPeriod={changeReportPeriod}
				disabled={gradebookCatalog?.loadingIndex !== undefined}
			/>
		{/if}

		{#if gradebookRecord}
			<Textarea value={gradebookRecord.xml} class="h-full" />
		{/if}
	</div>
</AppPageShell>
