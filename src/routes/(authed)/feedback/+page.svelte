<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import * as Bubble from '$lib/components/ui/bubble';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import * as Message from '$lib/components/ui/message';
	import { Textarea } from '$lib/components/ui/textarea';
	import { LocalStorageKey } from '$lib/storage/keys';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import BugIcon from '@lucide/svelte/icons/bug';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ShieldCheckIcon from '@lucide/svelte/icons/shield-check';
	import { onMount } from 'svelte';

	type FeedbackKind = 'Bug report' | 'Grade question' | 'Feature idea';
	type FeedbackReceipt = { id: string; replyToken: string };
	type FeedbackHistoryItem = {
		id: string;
		kind: FeedbackKind;
		message: string;
		status: 'new' | 'reviewing' | 'planned' | 'resolved' | 'dismissed';
		adminReply: string;
		repliedAt: string | null;
		createdAt: string;
		updatedAt: string;
		messages: Array<{
			id: string;
			sender: 'student' | 'admin';
			message: string;
			createdAt: string;
		}>;
	};

	const feedbackKinds: {
		value: FeedbackKind;
		label: string;
		description: string;
		icon: typeof BugIcon;
	}[] = [
		{
			value: 'Bug report',
			label: 'Something broke',
			description: 'An action did not work as expected.',
			icon: BugIcon
		},
		{
			value: 'Grade question',
			label: 'A grade looks off',
			description: 'Help us investigate a display or calculation.',
			icon: MessageCircleIcon
		},
		{
			value: 'Feature idea',
			label: 'Feature idea',
			description: 'Tell us what would make this more useful.',
			icon: LightbulbIcon
		}
	];

	let message = $state('');
	let feedbackKind = $state<FeedbackKind>('Bug report');
	let sending = $state(false);
	let sent = $state(false);
	let sendError = $state<string>();
	let feedbackHistory = $state<FeedbackHistoryItem[]>([]);
	let loadingHistory = $state(false);
	let selectedConversationId = $state('new');

	const canReport = $derived(message.trim().length >= 3);
	const sortedHistory = $derived(
		[...feedbackHistory].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
	);
	const selectedConversation = $derived(
		feedbackHistory.find((item) => item.id === selectedConversationId)
	);

	async function submitFeedback() {
		if (!canReport || sending) return;
		sending = true;
		sendError = undefined;
		const receipt = savedReceipts().find((item) => item.id === selectedConversationId);
		const endpoint = receipt
			? `/api/feedback/${encodeURIComponent(receipt.id)}/messages?token=${encodeURIComponent(receipt.replyToken)}`
			: '/api/feedback';
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(
				receipt
					? { message: message.trim() }
					: { kind: feedbackKind, message: message.trim(), pagePath: page.url.pathname }
			)
		}).catch(() => undefined);
		if (!response?.ok) {
			sendError = response
				? ((await response.json().catch(() => ({ message: 'Unable to send feedback.' }))).message ??
					'Unable to send feedback.')
				: 'You appear to be offline. Reconnect and try again.';
			sending = false;
			return;
		}
		const result = (await response.json()) as Partial<FeedbackReceipt>;
		if (!receipt && result.id && result.replyToken) {
			saveReceipt(result as FeedbackReceipt);
			selectedConversationId = result.id;
		}
		sent = true;
		sending = false;
		message = '';
		await loadFeedbackHistory();
	}

	function savedReceipts() {
		if (!browser) return [];
		try {
			const parsed = JSON.parse(localStorage.getItem(LocalStorageKey.feedbackReceipts) ?? '[]');
			return Array.isArray(parsed)
				? parsed.filter(
						(item): item is FeedbackReceipt =>
							typeof item?.id === 'string' && typeof item?.replyToken === 'string'
					)
				: [];
		} catch {
			return [];
		}
	}

	function saveReceipt(receipt: FeedbackReceipt) {
		try {
			const receipts = [receipt, ...savedReceipts().filter((item) => item.id !== receipt.id)].slice(
				0,
				20
			);
			localStorage.setItem(LocalStorageKey.feedbackReceipts, JSON.stringify(receipts));
		} catch {
			// The feedback was still delivered when browser storage is unavailable.
		}
	}

	async function loadFeedbackHistory() {
		const receipts = savedReceipts();
		if (!receipts.length) return;
		loadingHistory = true;
		const results = await Promise.all(
			receipts.map(async (receipt) => {
				const response = await fetch(
					`/api/feedback/${encodeURIComponent(receipt.id)}?token=${encodeURIComponent(receipt.replyToken)}`,
					{ cache: 'no-store' }
				).catch(() => undefined);
				return response?.ok
					? await response.json().catch(() => undefined as FeedbackHistoryItem | undefined)
					: undefined;
			})
		);
		feedbackHistory = results.filter((item): item is FeedbackHistoryItem => Boolean(item));
		loadingHistory = false;
	}

	function startNewConversation() {
		selectedConversationId = 'new';
		message = '';
		sent = false;
		sendError = undefined;
	}

	function statusLabel(status: FeedbackHistoryItem['status']) {
		return {
			new: 'Received',
			reviewing: 'Reviewing',
			planned: 'Planned',
			resolved: 'Resolved',
			dismissed: 'Closed'
		}[status];
	}

	function dateTime(value: string) {
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	}

	onMount(() => {
		void loadFeedbackHistory().then(() => {
			if (sortedHistory[0] && window.matchMedia('(min-width: 1024px)').matches)
				selectedConversationId = sortedHistory[0].id;
			else if (feedbackHistory.length) selectedConversationId = 'inbox';
		});
		const timer = window.setInterval(() => void loadFeedbackHistory(), 45_000);
		return () => window.clearInterval(timer);
	});
</script>

<svelte:head><title>Feedback - {brand}</title></svelte:head>

<AppPageShell class="max-w-[75rem]">
	<div>
		<h1 class="font-heading text-2xl font-bold tracking-[-0.035em] sm:text-[1.875rem]">Feedback</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Your private conversations with the Grademaxxing team.
		</p>
	</div>

	<!-- HALLMARK: Inbox and selected conversation share a single workspace; messages are only records returned by the feedback API. -->
	<div
		class="border-border/70 bg-card mt-5 grid overflow-hidden rounded-2xl border lg:h-[calc(100dvh-10rem)] lg:max-h-[50rem] lg:min-h-[34rem] lg:grid-cols-[17rem_minmax(0,1fr)]"
	>
		<aside
			class="border-border/70 border-r {selectedConversationId === 'inbox'
				? 'block'
				: 'hidden lg:block'}"
			aria-labelledby="feedback-chats-heading"
		>
			<div class="border-border/70 flex items-center justify-between gap-2 border-b p-4">
				<div>
					<h2 id="feedback-chats-heading" class="font-heading font-semibold">Chats</h2>
					<p class="text-muted-foreground text-xs">Saved in this browser</p>
				</div>
				<Button size="sm" onclick={startNewConversation}
					><PlusIcon class="size-4" aria-hidden="true" />New chat</Button
				>
			</div>
			<div class="max-h-[65vh] min-h-44 overflow-y-auto lg:max-h-[calc(100%-8rem)]">
				{#each sortedHistory as item (item.id)}
					<button
						type="button"
						onclick={() => {
							selectedConversationId = item.id;
							sent = false;
							sendError = undefined;
							message = '';
						}}
						aria-pressed={selectedConversationId === item.id}
						class="border-border/50 hover:bg-accent/40 focus-visible:ring-ring flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none {selectedConversationId ===
						item.id
							? 'bg-primary/10'
							: ''}"
					>
						<span class="flex w-full items-center justify-between gap-2"
							><strong class="truncate text-sm">{item.kind}</strong><span
								class="text-muted-foreground shrink-0 text-[0.68rem]"
								>{dateTime(item.updatedAt)}</span
							></span
						>
						<span class="text-muted-foreground w-full truncate text-xs"
							>{item.messages.at(-1)?.message ?? item.message}</span
						>
						<span class="text-primary text-[0.68rem] font-medium">{statusLabel(item.status)}</span>
					</button>
				{:else}
					<div class="px-4 py-8 text-center">
						<MessageCircleIcon class="text-muted-foreground/60 mx-auto size-6" aria-hidden="true" />
						<p class="mt-2 text-sm font-semibold">No chats yet</p>
						<p class="text-muted-foreground mt-1 text-xs">Start one with the New button.</p>
					</div>
				{/each}
			</div>
			<div class="border-border/70 border-t p-3">
				<Button variant="ghost" size="sm" onclick={loadFeedbackHistory} disabled={loadingHistory}
					>{loadingHistory ? 'Checking…' : 'Check for replies'}</Button
				>
			</div>
		</aside>

		<section
			class="min-w-0 flex-col {selectedConversationId === 'inbox' ? 'hidden lg:flex' : 'flex'}"
			aria-label="Selected feedback chat"
		>
			<header
				class="border-border/70 flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
			>
				<div class="flex min-w-0 items-center gap-2">
					{#if feedbackHistory.length}<Button
							variant="ghost"
							size="icon"
							class="lg:hidden"
							aria-label="Back to chats"
							onclick={() => (selectedConversationId = 'inbox')}
							><ArrowLeftIcon class="size-4" aria-hidden="true" /></Button
						>{/if}
					<div class="min-w-0">
						<h2 class="font-heading truncate font-semibold">
							{selectedConversation?.kind ??
								(selectedConversationId === 'new' ? 'New chat' : 'Select a chat')}
						</h2>
						<p class="text-muted-foreground text-xs">
							{selectedConversation ? statusLabel(selectedConversation.status) : 'Private feedback'}
						</p>
					</div>
				</div>
				{#if selectedConversation}<Button
						variant="outline"
						size="sm"
						onclick={loadFeedbackHistory}
						disabled={loadingHistory}>{loadingHistory ? 'Checking…' : 'Check replies'}</Button
					>{/if}
			</header>

			<div
				class="max-h-[48vh] min-h-48 flex-1 overflow-y-auto px-4 py-5 sm:px-6 lg:max-h-none"
				aria-label="Feedback conversation"
			>
				{#if selectedConversation}
					<div class="space-y-5">
						{#each selectedConversation.messages as entry (entry.id)}
							<Message.Root align={entry.sender === 'student' ? 'end' : 'start'}>
								<Message.Content>
									<Message.Header class={entry.sender === 'student' ? 'justify-end' : ''}
										>{entry.sender === 'student' ? 'You' : 'Grademaxxing team'}</Message.Header
									>
									<Bubble.Root
										variant={entry.sender === 'student' ? 'default' : 'secondary'}
										class="max-w-[88%] sm:max-w-[70%]"
										><Bubble.Content class="whitespace-pre-wrap">{entry.message}</Bubble.Content
										></Bubble.Root
									>
									<Message.Footer>{dateTime(entry.createdAt)}</Message.Footer>
								</Message.Content>
							</Message.Root>
						{/each}
					</div>
				{:else if selectedConversationId === 'new'}
					<div class="flex min-h-36 flex-col items-center justify-center text-center">
						<MessageCircleIcon class="text-muted-foreground/60 size-7" aria-hidden="true" />
						<p class="mt-3 text-sm font-semibold">Start a conversation</p>
						<p class="text-muted-foreground mt-1 max-w-xs text-xs leading-5">
							Choose a topic, write a note, and return here to read the team's reply.
						</p>
					</div>
				{:else}
					<div class="flex min-h-36 items-center justify-center text-center">
						<p class="text-muted-foreground text-sm">Select a chat or start a new one.</p>
					</div>
				{/if}
			</div>

			{#if selectedConversation || selectedConversationId === 'new'}
				<form
					class="border-border/70 space-y-3 border-t p-4 sm:p-5"
					onsubmit={(event) => {
						event.preventDefault();
						submitFeedback();
					}}
				>
					{#if sent}<div class="text-primary text-xs" role="status">
							<h2 class="font-semibold">Feedback sent</h2>
							<p>Your message was delivered privately.</p>
						</div>{/if}
					{#if !selectedConversation}
						<Field.Set
							><legend class="sr-only">What is this about?</legend>
							<div class="flex flex-wrap gap-2" role="group" aria-label="Feedback type">
								{#each feedbackKinds as kind (kind.value)}{@const Icon = kind.icon}<button
										type="button"
										aria-pressed={feedbackKind === kind.value}
										title={kind.description}
										onclick={() => (feedbackKind = kind.value)}
										class="border-border/70 hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none {feedbackKind ===
										kind.value
											? 'border-primary/60 bg-primary/10 text-primary'
											: 'bg-background/30'}"
										><Icon class="size-3.5" aria-hidden="true" />{kind.label}</button
									>{/each}
							</div></Field.Set
						>
					{/if}
					<Field.Field
						><Field.Label for="feedback-message" class="sr-only">Your message</Field.Label><Textarea
							id="feedback-message"
							bind:value={message}
							oninput={() => (sent = false)}
							autocomplete="off"
							aria-describedby="feedback-safety feedback-destination"
							placeholder={selectedConversation
								? 'Reply in this chat…'
								: 'Write a message to the team…'}
							maxlength={2000}
							rows={3}
							class="bg-background/40 min-h-20 resize-y rounded-xl px-4 py-3 text-sm"
						/></Field.Field
					>
					<p id="feedback-destination" class="sr-only">
						Your message is stored anonymously and is visible only in the private admin dashboard.
					</p>
					{#if sendError}<Field.Error>{sendError}</Field.Error>{/if}
					<div class="flex flex-wrap items-center justify-between gap-3">
						<p
							id="feedback-safety"
							class="text-muted-foreground flex max-w-xl items-start gap-1.5 text-xs leading-5"
						>
							<ShieldCheckIcon
								class="text-primary mt-0.5 size-3.5 shrink-0"
								aria-hidden="true"
							/>Leave out passwords, names, student IDs, grades, screenshots, and school records.
							<span class="shrink-0 tabular-nums">{message.length}/2,000</span>
						</p>
						<Button type="submit" class="ml-auto" disabled={!canReport || sending}
							>{sending ? 'Sending…' : 'Send feedback'}</Button
						>
					</div>
				</form>
			{/if}
		</section>
	</div>
	<p class="text-muted-foreground mt-3 text-xs leading-5">
		Your chat receipts are saved only in this browser and are removed when you sign out or clear
		site data.
	</p>
</AppPageShell>
