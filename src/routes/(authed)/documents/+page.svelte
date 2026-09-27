<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs';
	import type { StudentDocumentData } from '$lib/contracts/studentvue/documents';
	import ArrowUpRightIcon from '@lucide/svelte/icons/arrow-up-right';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
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
			<Tabs.List aria-label="Document category" class="max-w-full justify-start overflow-x-auto">
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
				<Item.Root size="sm" class="document-link">
					{#snippet child({ props })}
						<a
							href="/documents/document?documentGU={documentData._DocumentGU}"
							target="_blank"
							rel="noopener noreferrer"
							{...props}
						>
							<Item.Media class="document-icon" aria-hidden="true">
								<FileTextIcon class="size-5" />
							</Item.Media>
							<Item.Content class="document-main">
								<Item.Title class="document-title">{documentTitle(documentData)}</Item.Title>
								<Item.Description class="document-meta">
									<span class="document-chip">{documentData._DocumentType || 'School file'}</span>
									<time class="document-chip" datetime={documentData._DocumentDate}
										><CalendarDaysIcon class="size-3" />{formatDocumentDate(
											documentData._DocumentDate
										)}</time
									>
								</Item.Description>
							</Item.Content>
							<Item.Actions class="open-file">
								<span class="open-file-label">Open file</span><ArrowUpRightIcon class="size-4" />
							</Item.Actions>
						</a>
					{/snippet}
				</Item.Root>
			</li>
		{/each}
	</ol>
{/snippet}

<style>
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · genre: modern-minimal · macrostructure: document index · palette: Grademaxxing sidebar tokens */
	:global(.documents-shell) {
		max-width: 80rem;
		margin-inline: auto;
	}
	.documents-heading {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: 1.5rem;
	}
	.documents-heading h1 {
		min-width: 0;
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.5rem, 3vw, 1.875rem);
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.035em;
		overflow-wrap: anywhere;
	}
	.documents-heading p {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.875rem;
		line-height: 1.5;
	}
	:global(.document-tabs) {
		display: block;
		min-width: 0;
	}
	:global(.document-tabs [data-slot='tabs-list']) {
		display: flex;
		width: fit-content;
		max-width: 100%;
		height: auto;
		gap: 0.25rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
		scrollbar-width: thin;
	}
	:global(.document-tabs [data-slot='tabs-trigger']) {
		height: 2.25rem;
		flex: 0 0 auto;
		gap: var(--space-xs);
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted-foreground);
		padding: 0 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		box-shadow: none;
		white-space: nowrap;
	}
	:global(.document-tabs [data-slot='tabs-trigger'][data-state='active']) {
		background: transparent;
		color: var(--sidebar-accent-foreground);
		font-weight: 600;
		box-shadow: none;
	}
	:global(.document-tabs [data-slot='tabs-content']) {
		margin-top: 1.5rem;
	}
	.list-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: 0.5rem;
	}
	.list-heading h2 {
		margin: 0;
		color: var(--tertiary-foreground);
		font-family: var(--font-technical);
		font-size: 0.625rem;
		font-weight: 600;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	.list-heading span {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.documents-list {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.document-link {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 1rem;
		min-height: 4.75rem;
		border: 0;
		border-left: 2px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--sidebar-foreground);
		padding: 0.75rem 1rem;
		text-decoration: none;
		transition: background-color 150ms ease-out;
	}
	.document-link :global([data-slot='item-media']) {
		align-self: center;
	}
	.document-link:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.document-icon {
		display: grid;
		width: 3rem;
		height: 3rem;
		place-items: center;
		color: var(--sidebar-primary);
	}
	.document-main {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}
	:global(.document-title) {
		overflow-wrap: anywhere;
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.3;
	}
	.document-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		margin: 0;
		text-wrap: wrap;
	}
	.document-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3125rem;
		background: transparent;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.open-file {
		display: inline-flex;
		align-items: center;
		justify-self: end;
		gap: 0.3rem;
		color: var(--muted-foreground);
		font-size: 0.8125rem;
		font-weight: 600;
		white-space: nowrap;
	}
	.documents-empty {
		display: grid;
		justify-items: start;
		gap: var(--space-sm);
		max-width: 36rem;
		border-top: 1px solid var(--sidebar-border);
		padding-top: 1.5rem;
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
			margin-bottom: 1.25rem;
		}
		.document-link {
			grid-template-columns: 2.5rem minmax(0, 1fr) 1rem;
			gap: 0.75rem;
			padding: 0.75rem 0.5rem;
		}
		.document-icon {
			width: 2.5rem;
			height: 2.5rem;
		}
		.open-file {
			grid-column: 3;
		}
		.open-file-label {
			display: none;
		}
	}
	@media (hover: hover) {
		.document-link:hover {
			background: var(--sidebar-accent);
		}
		.document-link:hover :global(.open-file) {
			color: var(--sidebar-accent-foreground);
		}
		:global(.document-tabs [data-slot='tabs-trigger']:hover) {
			background: var(--sidebar-accent);
			color: var(--sidebar-accent-foreground);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.document-link {
			transition: none;
		}
	}
</style>
