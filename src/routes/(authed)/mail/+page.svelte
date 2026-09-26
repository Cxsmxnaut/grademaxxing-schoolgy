<script lang="ts">
	import { browser } from '$app/environment';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
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
	let unreadMessages = $derived(
		allMessages.filter((message) => message._MailRead !== 'true').length
	);

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

<AppPageShell class="mail-shell">
	<header class="mail-heading">
		<h1>Mail</h1>
		<p>Messages your school has sent through StudentVUE.</p>
	</header>

	{#if !mailDataState.loaded && !mailDataState.data}
		<LoadingBanner>Loading mail…</LoadingBanner>
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
			<section class="mail-inbox" aria-labelledby="inbox-heading">
				<header class="inbox-heading">
					<h2 id="inbox-heading">Inbox</h2>
					<span>
						{#if unreadMessages > 0}
							<strong>{unreadMessages} unread</strong>
							<span aria-hidden="true"> · </span>
						{/if}
						{allMessages.length}
						{allMessages.length === 1 ? 'message' : 'messages'}
					</span>
				</header>
				<ol class="message-list" aria-label="Inbox messages">
					{#each allMessages as message (message._SMMessageGU)}
						<li ontouchend={() => (touchscreen = true)}>
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
			<div class="mail-empty" role="status">
				<MailOpenIcon class="size-7" />
				<h2>No messages yet</h2>
				<p>Messages from your school will appear here when they arrive.</p>
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

<style>
	/* Hallmark · pre-emit critique: P5 H5 E4 S5 R5 V4 · genre: modern-minimal · macrostructure: inbox index · palette: Grademaxxing semantic tokens */
	:global(.mail-shell) {
		max-width: 82rem;
	}
	.mail-heading {
		margin-bottom: var(--space-xl);
	}
	.mail-heading h1 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.8rem, 3vw, 2.35rem);
		letter-spacing: -0.04em;
	}
	.mail-heading p {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.9rem;
		line-height: 1.5;
	}
	.mail-inbox {
		max-width: 65rem;
	}
	.inbox-heading {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
		padding-bottom: var(--space-sm);
	}
	.inbox-heading h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.2rem;
		letter-spacing: -0.025em;
	}
	.inbox-heading span {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.inbox-heading strong {
		color: var(--primary);
		font-weight: 700;
	}
	.message-list {
		margin: 0;
		border-top: 1px solid var(--border);
		padding: 0;
		list-style: none;
	}
	.message-list li {
		border-bottom: 1px solid var(--border);
	}
	.mail-empty {
		display: grid;
		justify-items: start;
		gap: var(--space-sm);
		max-width: 36rem;
		margin-top: var(--space-2xl);
		border-top: 1px solid var(--border);
		padding-top: var(--space-lg);
		color: var(--muted-foreground);
	}
	.mail-empty h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.2rem;
	}
	.mail-empty p {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.6;
	}
	@media (max-width: 39rem) {
		.mail-heading {
			margin-bottom: var(--space-lg);
		}
	}
</style>
