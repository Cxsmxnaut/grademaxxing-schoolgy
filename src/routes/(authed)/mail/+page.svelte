<script lang="ts">
	import { browser } from '$app/environment';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import type { InboxItemListingsMessageXML } from '$lib/types/MailData';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import MailCheckIcon from '@lucide/svelte/icons/mail-check';
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

<AppPageShell>
	<AppPageHeader
		eyebrow="StudentVUE inbox"
		title="Mail"
		description="Messages, links, and attachments sent through your school portal."
	/>

	{#if !mailDataState.loaded && !mailDataState.data}
		<LoadingBanner>Loading mail...</LoadingBanner>
	{/if}

	{#if openingMessageId !== undefined}
		<LoadingBanner>Opening message…</LoadingBanner>
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
			<section
				class="bg-card mx-auto mt-5 max-w-4xl overflow-hidden rounded-xl shadow-sm"
				aria-labelledby="inbox-heading"
			>
				<header
					class="border-border/70 flex items-center justify-between border-b px-4 py-3 sm:px-5"
				>
					<div class="flex items-center gap-2.5">
						<InboxIcon class="text-primary size-4" />
						<h2 id="inbox-heading" class="font-semibold">Inbox</h2>
					</div>
					<span class="text-muted-foreground text-xs tabular-nums">
						{allMessages.length}
						{allMessages.length === 1 ? 'message' : 'messages'}
					</span>
				</header>
				<ol aria-label="Inbox messages">
					{#each allMessages as message (message._SMMessageGU)}
						<li
							class="border-border/70 border-b last:border-b-0"
							ontouchend={() => (touchscreen = true)}
						>
							<MessageButton
								{message}
								disabled={openingMessageId !== undefined}
								onclick={() => void openMessage(message)}
							/>
						</li>
					{/each}
				</ol>
			</section>
		{:else}
			<div class="py-16 text-center" role="status">
				<MailCheckIcon class="text-success mx-auto size-9" />
				<h2 class="mt-3 font-semibold">Your inbox is empty</h2>
				<p class="text-muted-foreground mt-1 text-sm">New school messages will appear here.</p>
			</div>
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
</AppPageShell>
