<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
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

	function startAnother() {
		message = '';
		sent = false;
		sendError = undefined;
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
			What can we make better?
		</h1>
		<p class="text-muted-foreground mt-2 text-sm leading-6">
			Tell us what happened or what you would like to see. Your note goes privately to the
			Grademaxxing team.
		</p>
	</div>

	<!-- HALLMARK: A direct feedback form uses the official Field + Textarea pattern; receipts remain a separate, scannable record. -->
	<section
		class="border-border/70 bg-card mt-6 overflow-hidden rounded-2xl border"
		aria-labelledby="feedback-form-heading"
	>
		<div
			class="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4 sm:px-6"
		>
			<div>
				<h2 id="feedback-form-heading" class="font-heading text-lg font-semibold">Send feedback</h2>
				<p class="text-muted-foreground mt-0.5 text-xs">
					Choose a topic and describe it in your own words.
				</p>
			</div>
			<span
				class="text-muted-foreground hidden text-[0.68rem] font-semibold tracking-[0.12em] uppercase sm:inline"
				>Private</span
			>
		</div>

		{#if sent}
			<div class="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6" role="status">
				<div>
					<h2 class="font-heading text-lg font-semibold">Feedback sent</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						Your note reached the private admin inbox. Replies will appear below.
					</p>
				</div>
				<Button variant="outline" size="sm" onclick={startAnother}>Send another</Button>
			</div>
		{:else}
			<form
				class="space-y-5 p-5 sm:p-6"
				onsubmit={(event) => {
					event.preventDefault();
					submitFeedback();
				}}
			>
				<Field.Set>
					<legend class="mb-3 text-sm font-semibold">What is this about?</legend>
					<div class="grid gap-2 sm:grid-cols-3" role="group" aria-label="Feedback type">
						{#each feedbackKinds as kind (kind.value)}
							{@const Icon = kind.icon}
							<button
								type="button"
								aria-pressed={feedbackKind === kind.value}
								onclick={() => (feedbackKind = kind.value)}
								class="border-border/70 hover:bg-accent/50 focus-visible:ring-ring flex min-h-12 items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-20 sm:items-start {feedbackKind ===
								kind.value
									? 'border-primary/60 bg-primary/10'
									: 'bg-background/30'}"
							>
								<Icon class="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span class="min-w-0">
									<span class="block text-sm font-semibold">{kind.label}</span>
									<span class="text-muted-foreground mt-1 hidden text-xs leading-4 sm:block"
										>{kind.description}</span
									>
								</span>
							</button>
						{/each}
					</div>
				</Field.Set>

				<Field.Field>
					<Field.Label for="feedback-message" class="text-sm font-semibold"
						>Your message</Field.Label
					>
					<Textarea
						id="feedback-message"
						bind:value={message}
						autocomplete="off"
						aria-describedby="feedback-safety feedback-destination"
						placeholder="What happened? What would make this better?"
						maxlength={2000}
						rows={5}
						class="bg-background/40 min-h-32 resize-y rounded-xl px-4 py-3 text-sm"
					/>
					<div
						class="text-muted-foreground flex items-start justify-between gap-3 text-xs leading-5"
					>
						<Field.Description id="feedback-safety" class="flex gap-2 text-xs">
							<ShieldCheckIcon class="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
							<span
								>Leave out passwords, names, student IDs, grades, screenshots, and school records.</span
							>
						</Field.Description>
						<span class="shrink-0 tabular-nums">{message.length}/2,000</span>
					</div>
				</Field.Field>
				<p id="feedback-destination" class="sr-only">
					Your message is stored anonymously and is visible only in the private admin dashboard.
				</p>
				{#if sendError}<Field.Error>{sendError}</Field.Error>{/if}
				<div
					class="border-border/70 flex flex-wrap items-center justify-between gap-3 border-t pt-4"
				>
					<p class="text-muted-foreground text-xs">
						StudentVUE remains the official school record.
					</p>
					<Button type="submit" disabled={!canReport || sending}
						>{sending ? 'Sending…' : 'Send feedback'}</Button
					>
				</div>
			</form>
		{/if}
	</section>

	{#if loadingHistory || feedbackHistory.length}
		<section class="mt-8" aria-labelledby="feedback-history-heading">
			<div class="flex flex-wrap items-end justify-between gap-3">
				<div>
					<p class="text-primary text-[0.68rem] font-bold tracking-[0.2em] uppercase">Updates</p>
					<h2 id="feedback-history-heading" class="font-heading mt-1 text-xl font-bold">
						Your feedback
					</h2>
				</div>
				<Button variant="outline" size="sm" onclick={loadFeedbackHistory} disabled={loadingHistory}
					>{loadingHistory ? 'Checking…' : 'Check for replies'}</Button
				>
			</div>
			<div class="border-border/70 bg-card mt-3 overflow-hidden rounded-2xl border">
				{#each feedbackHistory as item (item.id)}
					<article class="border-border/70 border-b p-5 last:border-b-0 sm:p-6">
						<header class="flex flex-wrap items-start justify-between gap-2">
							<div>
								<h3 class="text-sm font-semibold">{item.kind}</h3>
								<p class="text-muted-foreground mt-0.5 text-xs">Sent {dateTime(item.createdAt)}</p>
							</div>
							<span
								class="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-semibold"
								>{statusLabel(item.status)}</span
							>
						</header>
						<p class="mt-4 text-sm leading-6 whitespace-pre-wrap">{item.message}</p>
						{#if item.adminReply}
							<div class="border-primary/50 bg-primary/5 mt-4 border-l-2 py-2 pr-3 pl-4">
								<p class="text-primary text-xs font-semibold">
									Grademaxxing reply{item.repliedAt ? ` · ${dateTime(item.repliedAt)}` : ''}
								</p>
								<p class="mt-1 text-sm leading-6 whitespace-pre-wrap">{item.adminReply}</p>
							</div>
						{:else}
							<p class="text-muted-foreground mt-4 text-xs">Awaiting a reply</p>
						{/if}
					</article>
				{/each}
			</div>
			<p class="text-muted-foreground mt-3 text-xs leading-5">
				Reply receipts stay in this browser and are removed when you sign out or clear site data.
			</p>
		</section>
	{/if}
</AppPageShell>
