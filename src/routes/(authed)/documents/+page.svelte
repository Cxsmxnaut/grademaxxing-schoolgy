<script lang="ts">
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import type { StudentDocumentData } from '$lib/types/Documents';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { documentsState, loadDocuments } from './documents.svelte';

	loadDocuments();

	let search = $state('');
	let typeFilter = $state('all');
	let yearFilter = $state('all');
	let documentDatas = $derived(
		documentsState.data?.StudentDocumentDatas?.StudentDocumentData ?? []
	);

	const sortPriority = ['Transcript', 'Report Card'];
	let documentTypes = $derived(
		[...new Set(documentDatas.map((document) => document._DocumentType).filter(Boolean))].toSorted(
			(a, b) => {
				const aPriority = sortPriority.indexOf(a);
				const bPriority = sortPriority.indexOf(b);
				if (aPriority === -1 && bPriority === -1) return a.localeCompare(b);
				if (aPriority === -1) return 1;
				if (bPriority === -1) return -1;
				return aPriority - bPriority;
			}
		)
	);
	let documentYears = $derived(
		[...new Set(documentDatas.map((document) => schoolYear(document._DocumentDate)))]
			.toSorted()
			.toReversed()
	);
	let filteredDocuments = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase();
		return documentDatas
			.filter((document) => typeFilter === 'all' || document._DocumentType === typeFilter)
			.filter(
				(document) => yearFilter === 'all' || schoolYear(document._DocumentDate) === yearFilter
			)
			.filter((document) => {
				if (!query) return true;
				return `${displayName(document)} ${document._DocumentType} ${document._DocumentFileName}`
					.toLocaleLowerCase()
					.includes(query);
			})
			.toSorted((a, b) => dateValue(b._DocumentDate) - dateValue(a._DocumentDate));
	});

	function dateValue(value: string) {
		const timestamp = new Date(value).getTime();
		return Number.isNaN(timestamp) ? 0 : timestamp;
	}

	function displayName(document: StudentDocumentData) {
		const comment = document._DocumentComment?.trim();
		if (comment) return comment;
		const filename = document._DocumentFileName?.replace(/\.[^.]+$/, '').trim();
		return filename || document._DocumentType || 'Student document';
	}

	function fileMeta(document: StudentDocumentData) {
		const match = document._DocumentFileName?.match(/\.([a-z0-9]+)$/i);
		const extension = match?.[1]?.toUpperCase();
		return extension
			? `${extension} · ${schoolYear(document._DocumentDate)}`
			: schoolYear(document._DocumentDate);
	}

	function formatDate(value: string) {
		const date = new Date(value);
		if (!value || Number.isNaN(date.getTime())) return 'Date unavailable';
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}

	function schoolYear(value: string) {
		const date = new Date(value);
		if (!value || Number.isNaN(date.getTime())) return 'Unknown year';
		const start = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
		return `${start}–${String(start + 1).slice(-2)}`;
	}

	function typeColor(type: string) {
		const normalized = type.toLocaleLowerCase();
		if (normalized.includes('transcript')) return 'bg-rose-500/12 text-rose-700 dark:text-rose-300';
		if (normalized.includes('report card'))
			return 'bg-amber-500/14 text-amber-700 dark:text-amber-300';
		if (normalized.includes('map') || normalized.includes('assessment'))
			return 'bg-sky-500/12 text-sky-700 dark:text-sky-300';
		return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
	}

	function resetFilters() {
		search = '';
		typeFilter = 'all';
		yearFilter = 'all';
	}
</script>

<svelte:head><title>Documents - {brand}</title></svelte:head>

<div class="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
	<header class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<span
				class="bg-primary text-primary-foreground flex h-11 w-11 items-center justify-center rounded-xl shadow-sm"
				><FileTextIcon class="h-5 w-5" /></span
			>
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Documents</h1>
				<p class="text-muted-foreground text-sm">Report cards, transcripts, and school files</p>
			</div>
		</div>
		<button
			type="button"
			onclick={() => loadDocuments(true)}
			disabled={documentsState.refreshing}
			class="bg-card hover:bg-accent inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg px-4 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 sm:self-auto"
		>
			<RefreshCwIcon class="h-4 w-4 {documentsState.refreshing ? 'animate-spin' : ''}" /> Refresh
		</button>
	</header>

	{#if !documentsState.loaded && !documentsState.data}
		<LoadingBanner>Loading documents...</LoadingBanner>
	{:else if documentsState.error}
		<RecordLoadFailure
			label="documents"
			error={documentsState.error}
			refreshing={documentsState.refreshing}
			retry={() => loadDocuments(true)}
		/>
	{/if}

	{#if documentsState.data}
		<section class="min-h-[calc(100dvh-7rem)]" aria-label="Student documents">
			<div
				class="bg-card flex flex-col gap-3 rounded-2xl p-4 shadow-sm lg:flex-row lg:items-center"
			>
				<label class="relative block min-w-0 flex-1">
					<span class="sr-only">Search documents</span>
					<SearchIcon
						class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
					/>
					<input
						bind:value={search}
						type="search"
						placeholder="Search documents"
						class="bg-background border-input placeholder:text-muted-foreground focus:ring-ring h-10 w-full rounded-lg border pr-9 pl-9 text-sm outline-none focus:ring-2"
					/>
					{#if search}<button
							type="button"
							onclick={() => (search = '')}
							class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
							aria-label="Clear search"><XIcon class="h-4 w-4" /></button
						>{/if}
				</label>
				<div class="grid grid-cols-2 gap-2 lg:flex">
					<label>
						<span class="sr-only">Document type</span>
						<select
							bind:value={typeFilter}
							class="bg-background border-input focus:ring-ring h-10 w-full rounded-lg border px-3 text-sm font-medium outline-none focus:ring-2 lg:w-48"
						>
							<option value="all">All document types</option>
							{#each documentTypes as type (type)}<option value={type}>{type}</option>{/each}
						</select>
					</label>
					<label>
						<span class="sr-only">School year</span>
						<select
							bind:value={yearFilter}
							class="bg-background border-input focus:ring-ring h-10 w-full rounded-lg border px-3 text-sm font-medium outline-none focus:ring-2 lg:w-40"
						>
							<option value="all">All school years</option>
							{#each documentYears as year (year)}<option value={year}>{year}</option>{/each}
						</select>
					</label>
				</div>
			</div>

			<div class="flex items-center justify-between px-1 pt-8 pb-3">
				<div>
					<h2 class="font-bold">Student files</h2>
					<p class="text-muted-foreground text-xs">
						{filteredDocuments.length}
						{filteredDocuments.length === 1 ? 'document' : 'documents'}
					</p>
				</div>
				{#if search || typeFilter !== 'all' || yearFilter !== 'all'}
					<button
						type="button"
						onclick={resetFilters}
						class="text-primary hover:text-primary/75 text-sm font-semibold">Clear filters</button
					>
				{/if}
			</div>

			{#if filteredDocuments.length === 0}
				<div class="flex min-h-80 flex-col items-center justify-center px-6 text-center">
					<span
						class="bg-muted text-muted-foreground mb-3 flex h-12 w-12 items-center justify-center rounded-full"
						><FileTextIcon class="h-5 w-5" /></span
					>
					<h3 class="font-semibold" role="status">
						{documentDatas.length === 0
							? 'No student documents are available yet.'
							: 'No matching documents'}
					</h3>
					<p class="text-muted-foreground mt-1 text-sm">
						{documentDatas.length === 0
							? 'Files shared by your school will appear here.'
							: 'Try changing your search or filters.'}
					</p>
				</div>
			{:else}
				<div
					class="text-muted-foreground hidden grid-cols-[minmax(0,1fr)_11rem_8rem_5rem] gap-4 px-4 py-2 text-xs font-bold tracking-wide uppercase sm:grid"
				>
					<span>Document</span><span>Type</span><span>Date</span><span class="text-right">Open</span
					>
				</div>
				<ol aria-label="Student document files">
					{#each filteredDocuments as document (document._DocumentGU)}
						<li class="mb-1">
							<a
								href="/documents/document?documentGU={document._DocumentGU}"
								target="_blank"
								rel="noopener noreferrer"
								class="hover:bg-accent/45 focus-visible:ring-ring group grid min-h-20 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-3 transition-colors outline-none focus-visible:ring-2 sm:grid-cols-[2.75rem_minmax(0,1fr)_11rem_8rem_5rem] sm:gap-4 sm:px-4"
							>
								<span
									class="{typeColor(
										document._DocumentType
									)} flex h-11 w-11 items-center justify-center rounded-xl"
									><FileTextIcon class="h-5 w-5" /></span
								>
								<div class="min-w-0">
									<h3 class="truncate text-sm font-semibold">{displayName(document)}</h3>
									<div
										class="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-xs sm:hidden"
									>
										<span>{document._DocumentType}</span><span aria-hidden="true">·</span><span
											>{formatDate(document._DocumentDate)}</span
										>
									</div>
									<p class="text-muted-foreground mt-1 text-xs">{fileMeta(document)}</p>
								</div>
								<span class="hidden truncate text-sm sm:block">{document._DocumentType}</span>
								<time
									datetime={document._DocumentDate}
									class="text-muted-foreground hidden text-sm sm:block"
									>{formatDate(document._DocumentDate)}</time
								>
								<span class="text-primary flex items-center justify-end gap-1 text-sm font-semibold"
									><span class="hidden sm:inline">Open</span><ExternalLinkIcon
										class="h-4 w-4"
									/></span
								>
							</a>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}
</div>
