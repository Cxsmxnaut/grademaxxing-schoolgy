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
		<Tabs.Root value="all" class="document-workspace">
			<aside class="document-navigation" aria-label="Document library">
				<div class="navigation-heading">
					<h2>Library</h2>
				</div>
				<Tabs.List aria-label="Document category">
					<Tabs.Trigger value="all" aria-label="All">
						<span>All files</span><span class="category-count" aria-hidden="true"
							>{sortedDocuments.length}</span
						>
					</Tabs.Trigger>

					{#each documentCategories as category (category)}
						<Tabs.Trigger value={category} aria-label={category}>
							<span>{category}</span><span class="category-count" aria-hidden="true"
								>{sortedDocuments.filter((document) => document._DocumentType === category)
									.length}</span
							>
						</Tabs.Trigger>
					{/each}
				</Tabs.List>
			</aside>

			<section class="document-library" aria-label="Files">
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
			</section>
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
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · genre: modern-minimal · macrostructure: library rail + file workspace · palette: Grademaxxing sidebar tokens */
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
	:global(.document-workspace) {
		display: grid;
		grid-template-columns: 13.5rem minmax(0, 1fr);
		min-width: 0;
		min-height: 18rem;
		overflow: hidden;
		border: 1px solid var(--sidebar-border);
		border-radius: var(--radius-lg);
	}
	.document-navigation {
		min-width: 0;
		border-right: 1px solid var(--sidebar-border);
		background: var(--sidebar);
		padding: 1.25rem 0.75rem;
	}
	.navigation-heading {
		display: grid;
		gap: 0.2rem;
		padding: 0 0.75rem 1rem;
	}
	.navigation-heading h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.125rem;
		font-weight: 700;
		letter-spacing: -0.025em;
	}
	:global(.document-navigation [data-slot='tabs-list']) {
		display: flex;
		width: 100%;
		height: auto;
		flex-direction: column;
		align-items: stretch;
		gap: 0.25rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
	}
	:global(.document-navigation [data-slot='tabs-trigger']) {
		display: flex;
		min-width: 0;
		height: 2.5rem;
		flex: none;
		justify-content: space-between;
		gap: 0.5rem;
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
	:global(.document-navigation [data-slot='tabs-trigger'] > span:first-child) {
		overflow: hidden;
		text-overflow: ellipsis;
	}
	:global(.document-navigation [data-slot='tabs-trigger'][data-state='active']) {
		background: var(--sidebar-accent);
		color: var(--sidebar-accent-foreground);
		font-weight: 600;
		box-shadow: none;
	}
	:global(.document-navigation .category-count) {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}
	.document-library {
		min-width: 0;
	}
	:global(.document-library [data-slot='tabs-content']) {
		margin: 0;
	}
	.list-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
		border-bottom: 1px solid var(--sidebar-border);
		padding: 1.25rem 1.5rem;
	}
	.list-heading h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.125rem;
		font-weight: 700;
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
		display: grid;
		gap: 0;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.documents-list li + li {
		border-top: 1px solid var(--sidebar-border);
	}
	.document-link {
		display: grid;
		grid-template-columns: 3rem minmax(0, 1fr) auto;
		align-items: center;
		gap: 1rem;
		min-height: 4.75rem;
		border: 0;
		border-radius: 0;
		background: transparent;
		color: var(--sidebar-foreground);
		padding: 0.75rem 1.5rem;
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
		overflow-wrap: anywhere;
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
		min-height: 20rem;
		align-content: center;
		justify-items: center;
		gap: var(--space-sm);
		border: 1px solid var(--sidebar-border);
		border-radius: var(--radius-lg);
		padding: 2rem;
		color: var(--muted-foreground);
		text-align: center;
	}
	.documents-empty h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.2rem;
	}
	.documents-empty p {
		margin: 0;
		max-width: 25rem;
		font-size: 0.875rem;
		line-height: 1.6;
	}
	@media (max-width: 58rem) {
		:global(.document-workspace) {
			grid-template-columns: minmax(0, 1fr);
		}
		.document-navigation {
			border-right: 0;
			border-bottom: 1px solid var(--sidebar-border);
			padding: 0.875rem 1rem;
		}
		.navigation-heading {
			padding: 0 0 0.75rem;
		}
		:global(.document-navigation [data-slot='tabs-list']) {
			width: 100%;
			flex-direction: row;
			overflow-x: auto;
			scrollbar-width: thin;
		}
		:global(.document-navigation [data-slot='tabs-trigger']) {
			flex: 0 0 auto;
		}
	}
	@media (max-width: 39rem) {
		.navigation-heading {
			display: none;
		}
		.documents-heading {
			align-items: start;
			flex-direction: column;
			margin-bottom: 1.25rem;
		}
		.document-link {
			grid-template-columns: 2.5rem minmax(0, 1fr) 1rem;
			gap: 0.75rem;
			padding: 0.75rem 1rem;
		}
		.list-heading {
			padding: 1rem;
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
		:global(.document-navigation [data-slot='tabs-trigger']:hover) {
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
