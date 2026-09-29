<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import MessageButton from './MessageButton.svelte';
	import MessageDialog from './MessageDialog.svelte';
	import MessageReader from './MessageReader.svelte';
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
	const compactMail = new MediaQuery('(max-width: 68rem)');
	let mailFilter = $state<'all' | 'unread'>('all');
	let searchQuery = $state('');

	let allMessages = $derived(mailDataState.data?.InboxItemListings.MessageXML ?? []);
	let unreadMessages = $derived(
		allMessages.filter((message) => message._MailRead !== 'true').length
	);
	let filteredMessages = $derived(
		allMessages.filter((message) => {
			if (mailFilter === 'unread' && message._MailRead === 'true') return false;
			const query = searchQuery.trim().toLocaleLowerCase();
			if (!query) return true;
			return [message._Subject, message.From.RecipientXML._Details1, message._MessageText]
				.join(' ')
				.toLocaleLowerCase()
				.includes(query);
		})
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
		messageOpen = compactMail.current;
	}

	// Deep link from quick jump: open the requested message once it is loaded.
	let deepLinkHandled = false;
	$effect(() => {
		const messageGU = page.url.searchParams.get('messageGU');
		if (!messageGU || deepLinkHandled) return;
		const summary = allMessages.find(
			(message) => (message._SMMsgPersonGU || message._SMMessageGU) === messageGU
		);
		if (!summary) return;
		deepLinkHandled = true;
		void openMessage(summary);
	});
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
			<div class="mail-workspace">
				<section class="mail-inbox" aria-labelledby="inbox-heading">
					<header class="inbox-heading">
						<div class="inbox-topline">
							<h2 id="inbox-heading">Inbox</h2>
							<span>
								{#if unreadMessages > 0}
									<strong>{unreadMessages} unread</strong>
									<span aria-hidden="true"> · </span>
								{/if}
								{allMessages.length}
								{allMessages.length === 1 ? 'message' : 'messages'}
							</span>
						</div>
						<div class="mail-filters" role="group" aria-label="Filter messages">
							<Button
								variant={mailFilter === 'all' ? 'secondary' : 'ghost'}
								size="sm"
								aria-pressed={mailFilter === 'all'}
								onclick={() => (mailFilter = 'all')}>All mail</Button
							>
							<Button
								variant={mailFilter === 'unread' ? 'secondary' : 'ghost'}
								size="sm"
								aria-pressed={mailFilter === 'unread'}
								onclick={() => (mailFilter = 'unread')}>Unread</Button
							>
						</div>
						<div class="mail-search">
							<SearchIcon class="size-4" aria-hidden="true" />
							<Input
								type="search"
								bind:value={searchQuery}
								aria-label="Search messages"
								placeholder="Search mail"
							/>
						</div>
					</header>
					{#if filteredMessages.length > 0}
						<ol class="message-list" aria-label="Inbox messages">
							{#each filteredMessages as message (message._SMMessageGU)}
								<li ontouchend={() => (touchscreen = true)}>
									<MessageButton
										{message}
										selected={openedMessage?._SMMessageGU === message._SMMessageGU}
										disabled={openingMessageId !== undefined}
										onclick={() => void openMessage(message)}
									/>
								</li>
							{/each}
						</ol>
					{:else}
						<p class="mail-no-results">No messages match this view.</p>
					{/if}
				</section>
				<section class="mail-reading-pane" aria-label="Message preview">
					{#if openedMessage}
						<MessageReader
							message={openedMessage}
							content={openedMessageContent}
							links={openedMessageLinks}
							{touchscreen}
						/>
					{:else}
						<div class="mail-reader-empty">
							<MailOpenIcon class="size-7" aria-hidden="true" />
							<h2>Select a message</h2>
							<p>Choose a message from the inbox to read it here.</p>
						</div>
					{/if}
				</section>
			</div>
		{:else}
			<div class="mail-empty" role="status">
				<MailOpenIcon class="size-7" />
				<h2>No messages yet</h2>
				<p>Messages from your school will appear here when they arrive.</p>
			</div>
		{/if}

		{#if compactMail.current && openedMessage}
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
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · genre: modern-minimal · macrostructure: inbox index · palette: Grademaxxing semantic tokens */
	:global(.mail-shell) {
		max-width: 80rem;
		margin-inline: auto;
	}
	.mail-heading {
		margin-bottom: 1.5rem;
	}
	.mail-heading h1 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.5rem, 3vw, 1.875rem);
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.035em;
	}
	.mail-heading p {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.mail-workspace {
		display: grid;
		grid-template-columns: minmax(19rem, 27rem) minmax(0, 1fr);
		height: calc(100dvh - 11rem);
		min-height: 28rem;
		overflow: hidden;
		border: 1px solid var(--sidebar-border);
		border-radius: var(--radius-lg);
	}
	.mail-inbox {
		display: flex;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
	}
	.inbox-heading {
		display: grid;
		gap: 0.875rem;
		flex: none;
		border-bottom: 1px solid var(--sidebar-border);
		padding: 1.125rem 1.25rem;
	}
	.inbox-topline {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
	}
	.inbox-heading h2 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.125rem;
		font-weight: 700;
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
		color: var(--sidebar-accent-foreground);
		font-weight: 700;
	}
	.mail-filters {
		display: flex;
		gap: 0.375rem;
	}
	.mail-search {
		position: relative;
		color: var(--muted-foreground);
	}
	.mail-search :global(svg) {
		position: absolute;
		z-index: 1;
		top: 50%;
		left: 0.75rem;
		transform: translateY(-50%);
		pointer-events: none;
	}
	:global(.mail-search input) {
		height: 2.25rem;
		padding-left: 2.25rem;
	}
	.message-list {
		min-height: 0;
		flex: 1;
		margin: 0;
		overflow-y: auto;
		padding: 0;
		list-style: none;
	}
	.mail-no-results {
		margin: 0;
		padding: 1.5rem 1.25rem;
		color: var(--muted-foreground);
		font-size: 0.875rem;
	}
	.mail-reading-pane {
		min-width: 0;
		min-height: 0;
		border-left: 1px solid var(--sidebar-border);
	}
	.mail-reader-empty {
		display: grid;
		height: 100%;
		align-content: center;
		justify-items: center;
		gap: 0.5rem;
		padding: 2rem;
		color: var(--muted-foreground);
		text-align: center;
	}
	.mail-reader-empty h2 {
		margin: 0.5rem 0 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1.125rem;
	}
	.mail-reader-empty p {
		margin: 0;
		font-size: 0.875rem;
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
	@media (max-width: 68rem) {
		.mail-workspace {
			grid-template-columns: minmax(0, 1fr);
		}
		.mail-reading-pane {
			display: none;
		}
	}
	@media (max-width: 39rem) {
		.mail-heading {
			margin-bottom: 1.25rem;
		}
		.mail-workspace {
			height: calc(100dvh - 13.5rem);
			min-height: 23rem;
		}
		.inbox-heading {
			padding: 1rem;
		}
	}
</style>
