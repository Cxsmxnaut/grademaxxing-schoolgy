<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { StudentDocumentData } from '$lib/contracts/studentvue/documents';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import FolderOpenIcon from '@lucide/svelte/icons/folder-open';
	import { documentsState, loadDocuments } from './documents.svelte';

	loadDocuments();

	const documentDatas = $derived(
		documentsState.data?.StudentDocumentDatas?.StudentDocumentData ?? []
	);
	const sortedDocuments = $derived(
		[...documentDatas].toSorted((a, b) => {
			const aDate = new Date(a._DocumentDate).getTime();
			const bDate = new Date(b._DocumentDate).getTime();
			return (Number.isNaN(bDate) ? 0 : bDate) - (Number.isNaN(aDate) ? 0 : aDate);
		})
	);
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
	function formatDocumentDate(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? 'Date unavailable' : dateFormatter.format(date);
	}
	function documentTitle(document: StudentDocumentData) {
		return document._DocumentComment || document._DocumentFileName || document._DocumentType;
	}

	const sortPriority = ['Transcript', 'Report Card'];

	const documentCategories = $derived(
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

<AppPageShell class="documents-shell">
	<header class="documents-heading">
		<div>
			<h1>Documents</h1>
			<p>Files your school has shared through StudentVUE.</p>
		</div>
	</header>

	{#if !documentsState.loaded}
		<LoadingBanner>Loading documents…</LoadingBanner>
	{/if}

	{#if documentsState.loaded && documentsState.error}
		<RecordLoadFailure
			label="documents"
			error={documentsState.error}
			refreshing={documentsState.refreshing}
			retry={() => loadDocuments(true)}
		/>
	{/if}

	{#if documentsState.data && sortedDocuments.length > 0}
		<Tabs.Root value="all" class="document-tabs">
			<Tabs.List
				aria-label="Document category"
				class="max-w-full justify-start overflow-x-auto rounded-none"
			>
				<Tabs.Trigger value="all">All</Tabs.Trigger>

				{#each documentCategories as category (category)}
					<Tabs.Trigger value={category}>
						{category}
					</Tabs.Trigger>
				{/each}
			</Tabs.List>

			<Tabs.Content value="all">
				{@render documentsList(sortedDocuments, 'All files')}
			</Tabs.Content>

			{#each documentCategories as category (category)}
				<Tabs.Content value={category}>
					{@render documentsList(
						sortedDocuments.filter((documentData) => documentData._DocumentType === category),
						category
					)}
				</Tabs.Content>
			{/each}
		</Tabs.Root>
	{:else if documentsState.loaded && !documentsState.error}
		<div class="documents-empty" role="status">
			<FolderOpenIcon class="size-7" />
			<h2>No documents available yet</h2>
			<p>Report cards and other files will appear here when your school publishes them.</p>
		</div>
	{/if}
</AppPageShell>

{#snippet documentsList(documents: StudentDocumentData[], title: string)}
	<div class="list-heading">
		<h2>{title}</h2>
		<span>{documents.length} {documents.length === 1 ? 'file' : 'files'}</span>
	</div>
	<ol class="documents-list" aria-label="Student documents">
		{#each documents as documentData (documentData._DocumentGU)}
			<li data-testid="document-row">
				<a
					href="/documents/document?documentGU={documentData._DocumentGU}"
					target="_blank"
					rel="noopener noreferrer"
					class="document-link"
				>
					<span class="document-icon" aria-hidden="true"><FileTextIcon class="size-5" /></span>
					<span class="document-main"
						><strong>{documentTitle(documentData)}</strong><span
							>{documentData._DocumentType || 'School file'}</span
						></span
					>
					<time datetime={documentData._DocumentDate}
						>{formatDocumentDate(documentData._DocumentDate)}</time
					>
					<span class="open-file"><span>Open file</span><ArrowUpRightIcon class="size-4" /></span>
				</a>
			</li>
		{/each}
	</ol>
{/snippet}

<style>
	/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 · genre: modern-minimal · macrostructure: document index · palette: Grademaxxing semantic tokens */
	:global(.documents-shell) {
		max-width: 82rem;
	}
	.documents-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: var(--space-xl);
	}
	.documents-heading h1 {
		min-width: 0;
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.8rem, 3vw, 2.35rem);
		letter-spacing: -0.04em;
		overflow-wrap: anywhere;
	}
	.documents-heading p {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	:global(.document-tabs) {
		display: block;
		min-width: 0;
	}
	:global(.document-tabs [data-slot='tabs-list']) {
		display: flex;
		width: 100%;
		height: auto;
		gap: var(--space-lg);
		border-bottom: 1px solid var(--border);
		border-radius: 0;
		background: transparent;
		padding: 0;
		scrollbar-width: thin;
	}
	:global(.document-tabs [data-slot='tabs-trigger']) {
		height: 2.9rem;
		flex: 0 0 auto;
		gap: var(--space-xs);
		border: 0;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		background: transparent;
		color: var(--muted-foreground) !important;
		padding: 0;
		font-size: 0.82rem;
		font-weight: 650;
		box-shadow: none;
		white-space: nowrap;
	}
	:global(.document-tabs [data-slot='tabs-trigger'][data-state='active']) {
		border-bottom-color: var(--primary);
		background: transparent;
		color: var(--foreground) !important;
		box-shadow: none;
	}
	:global(.document-tabs [data-slot='tabs-content']) {
		margin-top: var(--space-lg);
	}
	.list-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
		padding-bottom: var(--space-sm);
	}
	.list-heading h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.2rem;
		letter-spacing: -0.025em;
	}
	.list-heading span {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.documents-list {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--border);
		list-style: none;
	}
	.documents-list li {
		border-bottom: 1px solid var(--border);
	}
	.document-link {
		display: grid;
		grid-template-columns: 2.5rem minmax(0, 1fr) 8rem 5.5rem;
		align-items: center;
		gap: var(--space-md);
		min-height: 5.3rem;
		color: var(--foreground);
		padding: var(--space-md) var(--space-xs);
		text-decoration: none;
	}
	.document-link:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.document-icon {
		display: grid;
		width: 2.5rem;
		height: 2.5rem;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--primary);
	}
	.document-main {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}
	.document-main strong {
		overflow-wrap: anywhere;
		font-size: 0.9rem;
		line-height: 1.35;
	}
	.document-main > span {
		color: var(--muted-foreground);
		font-size: 0.75rem;
	}
	.document-link time {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.73rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.open-file {
		display: inline-flex;
		align-items: center;
		justify-self: end;
		gap: 0.3rem;
		color: var(--primary);
		font-size: 0.73rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.documents-empty {
		display: grid;
		justify-items: start;
		gap: var(--space-sm);
		max-width: 36rem;
		margin-top: var(--space-2xl);
		border-top: 1px solid var(--border);
		padding-top: var(--space-lg);
		color: var(--muted-foreground);
	}
	.documents-empty h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.2rem;
	}
	.documents-empty p {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.6;
	}
	@media (max-width: 39rem) {
		.documents-heading {
			align-items: start;
			flex-direction: column;
			margin-bottom: var(--space-lg);
		}
		.document-link {
			grid-template-columns: 2.4rem minmax(0, 1fr) 1.3rem;
			gap: var(--space-sm);
			min-height: 5.5rem;
		}
		.document-link time {
			grid-column: 2;
			grid-row: 2;
			margin-top: -0.5rem;
		}
		.open-file {
			grid-column: 3;
			grid-row: 1 / span 2;
		}
		.open-file span {
			display: none;
		}
	}
	@media (hover: hover) {
		.document-link:hover {
			background: var(--secondary);
		}
		:global(.document-tabs [data-slot='tabs-trigger']:hover) {
			color: var(--foreground);
		}
	}
</style>
