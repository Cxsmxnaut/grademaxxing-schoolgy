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
	import BugIcon from '@lucide/svelte/icons/bug';
	import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
	import MessageCircleIcon from '@lucide/svelte/icons/message-circle';
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

	const canReport = $derived(message.trim().length >= 3);
	const chronologicalHistory = $derived(
		[...feedbackHistory].sort((first, second) => first.createdAt.localeCompare(second.createdAt))
	);

	async function submitFeedback() {
		if (!canReport || sending) return;
		sending = true;
		sendError = undefined;
		const response = await fetch('/api/feedback', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				kind: feedbackKind,
				message: message.trim(),
				pagePath: page.url.pathname
			})
		}).catch(() => undefined);
		if (!response?.ok) {
			sendError = response
				? ((await response.json().catch(() => ({ message: 'Unable to send feedback.' }))).message ??
					'Unable to send feedback.')
				: 'You appear to be offline. Reconnect and try again.';
			sending = false;
			return;
		}
		const receipt = (await response.json()) as Partial<FeedbackReceipt>;
		if (receipt.id && receipt.replyToken) saveReceipt(receipt as FeedbackReceipt);
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

	onMount(loadFeedbackHistory);
</script>

<svelte:head><title>Feedback - {brand}</title></svelte:head>

<AppPageShell class="max-w-[67.5rem]">
	<div class="max-w-3xl">
		<p class="text-primary text-[0.68rem] font-bold tracking-[0.2em] uppercase">Feedback</p>
		<h1
			class="font-heading mt-2 text-2xl leading-tight font-bold tracking-[-0.035em] sm:text-[1.875rem]"
		>
			Talk to the Grademaxxing team
		</h1>
		<p class="text-muted-foreground mt-2 text-sm leading-6">
			Send a private note and check here for a reply. StudentVUE remains the official school record.
		</p>
	</div>

	<!-- HALLMARK: The real Message and Bubble components frame submitted feedback and actual replies; the empty state makes no promise of a live agent. -->
	<section
		class="border-border/70 bg-card mt-6 flex flex-col overflow-hidden rounded-2xl border lg:h-[calc(100dvh-11rem)] lg:max-h-[44rem] lg:min-h-[32rem]"
		aria-labelledby="feedback-history-heading"
	>
		<div
			class="border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6"
		>
			<div>
				<h2 id="feedback-history-heading" class="font-heading text-lg font-semibold">
					Your feedback
				</h2>
				<p class="text-muted-foreground mt-0.5 text-xs">
					Private messages and replies from the team
				</p>
			</div>
			<Button variant="outline" size="sm" onclick={loadFeedbackHistory} disabled={loadingHistory}
				>{loadingHistory ? 'Checking…' : 'Check for replies'}</Button
			>
		</div>

		<div
			class="max-h-[42vh] min-h-24 flex-1 overflow-y-auto px-5 py-5 sm:px-6 lg:max-h-none"
			aria-label="Feedback conversation"
		>
			{#if loadingHistory && !feedbackHistory.length}
				<p class="text-muted-foreground text-sm" role="status">Checking for your messages…</p>
			{:else if !feedbackHistory.length}
				<div class="flex min-h-24 flex-col items-center justify-center text-center lg:min-h-full">
					<MessageCircleIcon class="text-muted-foreground/60 size-7" aria-hidden="true" />
					<p class="mt-3 text-sm font-semibold">No messages yet</p>
					<p class="text-muted-foreground mt-1 max-w-xs text-xs leading-5">
						Choose a topic and write your first note below. Replies will show up here after the team
						responds.
					</p>
				</div>
			{:else}
				<div class="space-y-7">
					{#each chronologicalHistory as item (item.id)}
						<div class="space-y-4">
							<Message.Root align="end">
								<Message.Content>
									<Message.Header class="justify-end">You · {item.kind}</Message.Header>
									<Bubble.Root class="max-w-[88%] sm:max-w-[72%]">
										<Bubble.Content class="whitespace-pre-wrap">{item.message}</Bubble.Content>
									</Bubble.Root>
									<Message.Footer
										>{dateTime(item.createdAt)} · {statusLabel(item.status)}</Message.Footer
									>
								</Message.Content>
							</Message.Root>
							{#if item.adminReply}
								<Message.Root>
									<Message.Content>
										<Message.Header>Grademaxxing team</Message.Header>
										<Bubble.Root variant="secondary" class="max-w-[88%] sm:max-w-[72%]">
											<Bubble.Content class="whitespace-pre-wrap">{item.adminReply}</Bubble.Content>
										</Bubble.Root>
										{#if item.repliedAt}<Message.Footer>{dateTime(item.repliedAt)}</Message.Footer
											>{/if}
									</Message.Content>
								</Message.Root>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<form
			class="border-border/70 space-y-3 border-t p-4 sm:p-5"
			onsubmit={(event) => {
				event.preventDefault();
				submitFeedback();
			}}
		>
			{#if sent}
				<div class="text-primary text-xs" role="status">
					<h2 class="font-semibold">Feedback sent</h2>
					<p>Your message was delivered privately.</p>
				</div>
			{/if}
			<Field.Set>
				<legend class="sr-only">What is this about?</legend>
				<div class="flex flex-wrap gap-2" role="group" aria-label="Feedback type">
					{#each feedbackKinds as kind (kind.value)}
						{@const Icon = kind.icon}
						<button
							type="button"
							aria-pressed={feedbackKind === kind.value}
							title={kind.description}
							onclick={() => (feedbackKind = kind.value)}
							class="border-border/70 hover:bg-accent/50 focus-visible:ring-ring flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none {feedbackKind ===
							kind.value
								? 'border-primary/60 bg-primary/10 text-primary'
								: 'bg-background/30'}"
						>
							<Icon class="size-3.5" aria-hidden="true" />{kind.label}
						</button>
					{/each}
				</div>
			</Field.Set>
			<Field.Field>
				<Field.Label for="feedback-message" class="sr-only">Your message</Field.Label>
				<Textarea
					id="feedback-message"
					bind:value={message}
					oninput={() => (sent = false)}
					autocomplete="off"
					aria-describedby="feedback-safety feedback-destination"
					placeholder="Write a message to the team…"
					maxlength={2000}
					rows={3}
					class="bg-background/40 min-h-20 resize-y rounded-xl px-4 py-3 text-sm"
				/>
			</Field.Field>
			<p id="feedback-destination" class="sr-only">
				Your message is stored anonymously and is visible only in the private admin dashboard.
			</p>
			{#if sendError}<Field.Error>{sendError}</Field.Error>{/if}
			<div class="flex flex-wrap items-center justify-between gap-3">
				<p
					id="feedback-safety"
					class="text-muted-foreground flex max-w-xl items-start gap-1.5 text-xs leading-5"
				>
					<ShieldCheckIcon class="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Leave
					out passwords, names, student IDs, grades, screenshots, and school records.
					<span class="shrink-0 tabular-nums">{message.length}/2,000</span>
				</p>
				<Button type="submit" disabled={!canReport || sending}
					>{sending ? 'Sending…' : 'Send feedback'}</Button
				>
			</div>
		</form>
	</section>
	<p class="text-muted-foreground mt-3 text-xs leading-5">
		Reply receipts stay in this browser and are removed when you sign out or clear site data.
	</p>
</AppPageShell>
