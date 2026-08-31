<script lang="ts">
	import { bgColorVariants } from '$lib';
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import DateBadge from '$lib/components/DateBadge.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { StudentDocumentData } from '$lib/types/Documents';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import { documentsState, loadDocuments } from './documents.svelte';

	loadDocuments();

	function getDocumentColor(documentType: string) {
		switch (documentType) {
			case 'Report Card':
				return 'yellow';
			case 'Transcript':
				return 'red';
			case 'MAP Growth Family Report':
				return 'blue';
			default:
				return 'green';
		}
	}

	let documentDatas = $derived(
		documentsState.data?.StudentDocumentDatas?.StudentDocumentData ?? []
	);

	const sortPriority = ['Transcript', 'Report Card'];

	let documentCategories = $derived(
		new Set(
			documentDatas
				.map((documentData) => documentData._DocumentType)
				.toSorted((a, b) => {
					const aPriority = sortPriority.indexOf(a);
					const bPriority = sortPriority.indexOf(b);
					if (aPriority === -1 && bPriority === -1) return a.localeCompare(b);
					if (aPriority === -1) return 1;
					if (bPriority === -1) return -1;
					return aPriority - bPriority;
				})
		)
	);
</script>

<svelte:head>
	<title>Documents - {brand}</title>
</svelte:head>

<AppPageShell>
	<AppPageHeader
		eyebrow="School record"
		title="Documents"
		description="Report cards, transcripts, and other files available through StudentVUE."
	/>

	{#if !documentsState.loaded}
		<LoadingBanner>Loading documents...</LoadingBanner>
	{/if}

	{#if documentsState.loaded && documentsState.error}
		<RecordLoadFailure
			label="documents"
			error={documentsState.error}
			refreshing={documentsState.refreshing}
			retry={() => loadDocuments(true)}
		/>
	{/if}

	{#if documentsState.data && documentDatas.length > 0}
		<Tabs.Root value="all" class="mx-auto mt-5 max-w-4xl gap-4">
			<Tabs.List class="h-11 max-w-full justify-start overflow-x-auto rounded-xl">
				<Tabs.Trigger value="all">All</Tabs.Trigger>

				{#each documentCategories as category (category)}
					<Tabs.Trigger value={category}>
						<div
							class={[bgColorVariants[getDocumentColor(category)], 'h-2 w-2 rounded-full']}
						></div>
						{category}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			<Tabs.Content value="all">
				{@render documentsList(documentDatas)}
			</Tabs.Content>

			{#each documentCategories as category (category)}
				<Tabs.Content value={category}>
					{@render documentsList(
						documentDatas.filter((documentData) => documentData._DocumentType === category),
						false
					)}
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{:else if documentsState.loaded && !documentsState.error}
		<div class="py-16 text-center" role="status">
			<FolderOpenIcon class="text-primary mx-auto size-9" />
			<h2 class="mt-3 font-semibold">No documents yet</h2>
			<p class="text-muted-foreground mt-1 text-sm">
				Report cards and other files will appear here when your school publishes them.
			</p>
		</div>
	{/if}
</AppPageShell>

{#snippet documentsList(documents: StudentDocumentData[], showCategory = true)}
	<ol
		class="bg-card mx-auto max-w-4xl overflow-hidden rounded-xl shadow-sm"
		aria-label="Student documents"
	>
		{#each documents as documentData (documentData._DocumentGU)}
			<li class="border-border/70 border-b last:border-b-0" data-testid="document-row">
				<Button
					href="/documents/document?documentGU={documentData._DocumentGU}"
					target="_blank"
					variant="ghost"
					class="group flex h-auto w-full items-center justify-start gap-4 rounded-none px-4 py-4 text-left sm:px-5"
				>
					<span
						class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg"
					>
						<FileTextIcon class="size-5" />
					</span>
					<div class="min-w-0 flex-1">
						<h2 class="truncate font-semibold">{documentData._DocumentComment}</h2>
						<div class="mt-1.5 flex flex-wrap gap-1.5">
							{#if showCategory}
								<Badge color={getDocumentColor(documentData._DocumentType)}>
									{documentData._DocumentType}
								</Badge>
							{/if}
							<DateBadge date={new Date(documentData._DocumentDate)} />
						</div>
					</div>
					<ArrowUpRightIcon
						class="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
					/>
				</Button>
			</li>
		{/each}
	</ol>
{/snippet}
