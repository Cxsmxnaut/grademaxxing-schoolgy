<script lang="ts">
	import { browser } from '$app/environment';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import type { InboxItemListingsMessageXML } from '$lib/types/MailData';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import MessageButton from './MessageButton.svelte';
	import MessageDialog from './MessageDialog.svelte';
	import { loadMailData, mailDataState } from './mailData.svelte';

	loadMailData();
	let domParser: DOMParser;
	if (browser) domParser = new DOMParser();

	let messageOpen = $state(false);
	let openedMessage: InboxItemListingsMessageXML | undefined = $state(undefined);
	let openedMessageContent = $state('');
	const openedMessageLinks: SvelteSet<string> = new SvelteSet();
	let openingMessageId = $state<string | undefined>();
	let openSequence = 0;
	const messageDetails = new Map<string, InboxItemListingsMessageXML>();
	let touchscreen = $state(false);

	let allMessages = $derived(mailDataState.data?.InboxItemListings.MessageXML ?? []);

	async function openMessage(summary: InboxItemListingsMessageXML) {
		const id = summary._SMMsgPersonGU || summary._SMMessageGU;
		if (!id || openingMessageId !== undefined) return;
		const sequence = ++openSequence;
		openingMessageId = id;
		let message = messageDetails.get(id) ?? summary;
		try {
			if (!messageDetails.has(id)) {
				message = {
					...summary,
					...(await acc.studentAccount?.message(id, summary._IsSystemMessage === 'true'))
				};
				messageDetails.set(id, message);
			}
		} catch (error) {
			if (sequence !== openSequence) return;
			toast.error('Could not open this message', {
				description: error instanceof Error ? error.message : String(error)
			});
			return;
		} finally {
			if (sequence === openSequence) openingMessageId = undefined;
		}
		if (sequence !== openSequence) return;
		openedMessage = message;
		const doc = domParser.parseFromString(message._MessageText, 'text/html');
		openedMessageLinks.clear();
		doc.querySelectorAll('a').forEach((link) => {
			try {
				const url = new URL(link.href);
				if (url.protocol === 'https:' || url.protocol === 'http:') {
					link.setAttribute('target', '_blank');
					link.setAttribute('rel', 'noopener noreferrer');
					openedMessageLinks.add(url.href);
				} else link.removeAttribute('href');
			} catch {
				link.removeAttribute('href');
			}
		});
		openedMessageContent = doc.body.innerHTML;
		messageOpen = true;
	}
</script>

<svelte:head>
	<title>Mail - {brand}</title>
</svelte:head>

{#if !mailDataState.loaded && !mailDataState.data}
	<LoadingBanner>Loading mail...</LoadingBanner>
{/if}

{#if openingMessageId !== undefined}
	<LoadingBanner>Opening message…</LoadingBanner>
{/if}

{#if mailDataState.lastRefresh !== undefined}
	<RefreshIndicator
		canRefresh={!mailDataState.refreshing}
		lastRefresh={mailDataState.lastRefresh}
		refreshing={mailDataState.refreshing}
		refresh={() => loadMailData(true)}
	/>
{/if}

{#if mailDataState.error}
	<RecordLoadFailure
		label="mail"
		error={mailDataState.error}
		refreshing={mailDataState.refreshing}
		retry={() => loadMailData(true)}
	/>
{/if}

{#if mailDataState.data}
	{#if allMessages.length > 0}
		<ol class="m-4 flex flex-col items-center gap-4" aria-label="Inbox messages">
			{#each allMessages as message (message._SMMessageGU)}
				<li class="w-full max-w-3xl" ontouchend={() => (touchscreen = true)}>
					<MessageButton
						{message}
						disabled={openingMessageId !== undefined}
						onclick={() => void openMessage(message)}
					/>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="text-muted-foreground mx-auto my-16 text-center" role="status">
			Your inbox is empty.
		</p>
	{/if}

	{#if openedMessage}
		<MessageDialog
			bind:open={messageOpen}
			message={openedMessage}
			content={openedMessageContent}
			links={openedMessageLinks}
			{touchscreen}
		/>
	{/if}
{/if}
