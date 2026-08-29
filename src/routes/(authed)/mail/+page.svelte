<script lang="ts">
	import { browser } from '$app/environment';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import type { InboxItemListingsMessageXML } from '$lib/types/MailData';
	import InboxIcon from '@lucide/svelte/icons/inbox';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import MessageButton from './MessageButton.svelte';
	import MessageDialog from './MessageDialog.svelte';
	import { loadMailData, mailDataState } from './mailData.svelte';

	loadMailData();
	let domParser: DOMParser;
	if (browser) domParser = new DOMParser();

	type MailView = 'inbox' | 'unread';
	let activeView = $state<MailView>('inbox');
	let search = $state('');
	let messageOpen = $state(false);
	let openedMessage: InboxItemListingsMessageXML | undefined = $state(undefined);
	let openedMessageContent = $state('');
	const openedMessageLinks: SvelteSet<string> = new SvelteSet();
	let openingMessageId = $state<string | undefined>();
	let openSequence = 0;
	const messageDetails = new Map<string, InboxItemListingsMessageXML>();
	let touchscreen = $state(false);

	let allMessages = $derived(mailDataState.data?.InboxItemListings.MessageXML ?? []);
	let unreadCount = $derived(
		allMessages.filter((message) => message._MailRead.toLowerCase() !== 'true').length
	);
	let filteredMessages = $derived.by(() => {
		const query = search.trim().toLocaleLowerCase();
		return allMessages.filter((message) => {
			if (activeView === 'unread' && message._MailRead.toLowerCase() === 'true') return false;
			if (!query) return true;
			const sender = message.From.RecipientXML._Details1 ?? '';
			const plainText = message._MessageText.replace(/<[^>]*>/g, ' ');
			return `${sender} ${message._Subject} ${plainText}`.toLocaleLowerCase().includes(query);
		});
	});

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

<svelte:head><title>Mail - {brand}</title></svelte:head>

<div class="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
	<header class="mb-7 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<span
				class="bg-primary text-primary-foreground flex h-11 w-11 items-center justify-center rounded-xl shadow-sm"
			>
				<MailIcon class="h-5 w-5" />
			</span>
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Mail</h1>
				<p class="text-muted-foreground text-sm">Messages from your teachers and school</p>
			</div>
		</div>
		<button
			type="button"
			onclick={() => loadMailData(true)}
			disabled={mailDataState.refreshing}
			class="bg-card hover:bg-accent inline-flex h-10 items-center justify-center gap-2 self-start rounded-lg px-4 text-sm font-semibold shadow-sm transition-colors disabled:opacity-60 sm:self-auto"
		>
			<RefreshCwIcon class="h-4 w-4 {mailDataState.refreshing ? 'animate-spin' : ''}" /> Refresh
		</button>
	</header>

	{#if !mailDataState.loaded && !mailDataState.data}
		<LoadingBanner>Loading mail...</LoadingBanner>
	{:else if mailDataState.error}
		<RecordLoadFailure
			label="mail"
			error={mailDataState.error}
			refreshing={mailDataState.refreshing}
			retry={() => loadMailData(true)}
		/>
	{/if}

	{#if mailDataState.data}
		<section class="min-h-[calc(100dvh-7rem)]" aria-label="Mailbox">
			<div class="grid min-h-[560px] md:grid-cols-[190px_minmax(0,1fr)]">
				<aside class="py-3 md:py-5 md:pr-6">
					<nav aria-label="Mail folders" class="flex gap-1 overflow-x-auto md:flex-col">
						<button
							type="button"
							aria-pressed={activeView === 'inbox'}
							onclick={() => (activeView = 'inbox')}
							class="hover:bg-accent flex min-w-32 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors md:min-w-0"
							class:bg-primary={activeView === 'inbox'}
							class:text-primary-foreground={activeView === 'inbox'}
						>
							<InboxIcon class="h-4 w-4" /> Inbox
							<span class="ml-auto tabular-nums">{allMessages.length}</span>
						</button>
						<button
							type="button"
							aria-pressed={activeView === 'unread'}
							onclick={() => (activeView = 'unread')}
							class="hover:bg-accent flex min-w-32 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors md:min-w-0"
							class:bg-primary={activeView === 'unread'}
							class:text-primary-foreground={activeView === 'unread'}
						>
							<MailOpenIcon class="h-4 w-4" /> Unread
							<span class="ml-auto tabular-nums">{unreadCount}</span>
						</button>
					</nav>
				</aside>

				<div class="min-w-0 md:pl-5">
					<div
						class="flex min-h-16 flex-col gap-3 px-1 py-4 sm:flex-row sm:items-center sm:justify-between"
					>
						<div>
							<h2 class="font-bold">{activeView === 'unread' ? 'Unread' : 'Inbox'}</h2>
							<p class="text-muted-foreground text-xs">
								{filteredMessages.length}
								{filteredMessages.length === 1 ? 'message' : 'messages'}
							</p>
						</div>
						<label class="relative block w-full sm:max-w-xs">
							<span class="sr-only">Search mail</span>
							<SearchIcon
								class="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
							/>
							<input
								bind:value={search}
								type="search"
								placeholder="Search mail"
								class="bg-background border-input placeholder:text-muted-foreground focus:ring-ring h-10 w-full rounded-lg border pr-9 pl-9 text-sm transition-shadow outline-none focus:ring-2"
							/>
							{#if search}<button
									type="button"
									onclick={() => (search = '')}
									class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
									aria-label="Clear search"><XIcon class="h-4 w-4" /></button
								>{/if}
						</label>
					</div>

					{#if openingMessageId}<p role="status" class="text-muted-foreground px-5 py-2 text-xs">
							Opening message…
						</p>{/if}
					{#if filteredMessages.length === 0}
						<div class="flex min-h-80 flex-col items-center justify-center px-6 text-center">
							<span
								class="bg-muted text-muted-foreground mb-3 flex h-12 w-12 items-center justify-center rounded-full"
								><MailIcon class="h-5 w-5" /></span
							>
							<h3 class="font-semibold" role="status">
								{search
									? 'No matching messages'
									: activeView === 'unread'
										? 'You’re all caught up'
										: 'Your inbox is empty.'}
							</h3>
							<p class="text-muted-foreground mt-1 text-sm">
								{search
									? 'Try another sender or subject.'
									: 'New school messages will appear here.'}
							</p>
						</div>
					{:else}
						<ol aria-label="Inbox messages">
							{#each filteredMessages as message (message._SMMessageGU)}
								<li ontouchend={() => (touchscreen = true)}>
									<MessageButton
										{message}
										disabled={openingMessageId !== undefined}
										onclick={() => void openMessage(message)}
									/>
								</li>
							{/each}
						</ol>
					{/if}
				</div>
			</div>
		</section>
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
</div>
