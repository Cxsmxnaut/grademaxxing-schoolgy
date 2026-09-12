<script lang="ts">
	import { page } from '$app/state';
	import { getBlobURLFromBase64String } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import { Alert } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import type { Attachment } from '$lib/types/Attachment';
	import { onMount } from 'svelte';

	let attachmentURLPromise: Promise<string> | undefined = $state();

	const getAttachmentURL = async (attachmentGU: string | null) => {
		if (attachmentGU === null) throw new Error('AttachmentGU not provided');

		if (!acc.studentAccount) throw new Error('Student account not loaded');

		let attachment: Attachment;

		try {
			attachment = await acc.studentAccount.attachment(attachmentGU);
		} catch (error) {
			if (error instanceof Error && /session has expired|sign in/i.test(error.message)) throw error;
			throw new Error(error instanceof Error ? error.message : 'Attachment not found');
		}

		return getBlobURLFromBase64String(attachment.Base64Code);
	};

	function loadAttachment() {
		attachmentURLPromise = getAttachmentURL(page.url.searchParams.get('attachmentGU'));
		void attachmentURLPromise.then((url) => location.assign(url)).catch(() => undefined);
	}

	onMount(loadAttachment);
</script>

<svelte:head>
	<title>Attachment - {brand}</title>
</svelte:head>

{#if attachmentURLPromise}
	{#await attachmentURLPromise}
		<LoadingBanner>Loading attachment. One more file, apparently.</LoadingBanner>
	{:then}
		<LoadingBanner>Redirecting. The attachment is on its way.</LoadingBanner>
	{:catch error}
		<div class="flex min-h-screen items-center justify-center">
			<Alert class="block w-fit space-y-2">
				<h1 class="text-lg">Couldn't open this attachment. Naturally.</h1>
				<p>{error instanceof Error ? error.message : String(error)}</p>
				<div class="flex flex-wrap gap-2">
					{#if error instanceof Error && /session has expired|sign in/i.test(error.message)}
						<Button href="/login" variant="outline" data-sveltekit-reload>Sign in again</Button>
					{:else}
						<Button onclick={loadAttachment} variant="outline">Try again</Button>
					{/if}
					<Button href="/mail" variant="outline">Return to Mail</Button>
				</div>
			</Alert>
		</div>
	{/await}
{/if}
