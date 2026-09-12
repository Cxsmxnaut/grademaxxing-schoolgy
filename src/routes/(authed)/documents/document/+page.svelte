<script lang="ts">
	import { page } from '$app/state';
	import { getBlobURLFromBase64String } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import { Alert } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import type { ReportCard } from '$lib/types/ReportCard';
	import { onMount } from 'svelte';

	let reportCardURLPromise: Promise<string> | undefined = $state();

	const getReportCardURL = async (documentGU: string | null) => {
		if (documentGU === null) throw new Error('DocumentGU not provided');

		if (!acc.studentAccount) throw new Error('Student account not loaded');

		let reportCard: ReportCard;

		try {
			const result = await acc.studentAccount.reportCard(documentGU);
			if (!('Base64Code' in result)) throw new Error('Document not found');
			reportCard = result;
		} catch (error) {
			if (error instanceof Error && /session has expired|sign in/i.test(error.message)) throw error;
			throw new Error(error instanceof Error ? error.message : 'Document not found');
		}

		return getBlobURLFromBase64String(reportCard.Base64Code);
	};

	function loadDocument() {
		reportCardURLPromise = getReportCardURL(page.url.searchParams.get('documentGU'));
		void reportCardURLPromise.then((url) => location.assign(url)).catch(() => undefined);
	}

	onMount(loadDocument);
</script>

<svelte:head>
	<title>Document - {brand}</title>
</svelte:head>

{#if reportCardURLPromise}
	{#await reportCardURLPromise}
		<LoadingBanner>Loading document. Paperwork, but digital.</LoadingBanner>
	{:then}
		<LoadingBanner>Redirecting. The document is making an entrance.</LoadingBanner>
	{:catch error}
		<div class="flex min-h-screen items-center justify-center">
			<Alert class="block w-fit space-y-2">
				<h1 class="text-lg">Couldn't open this document. Naturally.</h1>
				<p>{error instanceof Error ? error.message : String(error)}</p>
				<div class="flex flex-wrap gap-2">
					{#if error instanceof Error && /session has expired|sign in/i.test(error.message)}
						<Button href="/login" variant="outline" data-sveltekit-reload>Sign in again</Button>
					{:else}
						<Button onclick={loadDocument} variant="outline">Try again</Button>
					{/if}
					<Button href="/documents" variant="outline">Return to Documents</Button>
				</div>
			</Alert>
		</div>
	{/await}
{/if}
