<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Button } from '$lib/components/ui/button';
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
	const assistantReply = $derived.by(() => {
		if (!message.trim()) return 'Pick a topic, then tell us what happened in your own words.';
		if (!canReport) return 'A couple more words will help us understand the issue.';
		return sent
			? 'Thanks — your feedback is now in the private admin inbox.'
			: 'That is ready to send privately to the Grademaxxing team.';
	});

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
	<p class="text-primary text-[0.68rem] font-bold tracking-[0.2em] uppercase">Feedback chat</p>
	<h1
		class="font-heading mt-2 text-2xl leading-[1.5] font-bold tracking-[-0.035em] sm:text-[1.875rem] sm:leading-[1.2]"
	>
		What can we make better?
	</h1>
	<p class="text-muted-foreground mt-2 max-w-5xl text-sm leading-5">
		Send a private note directly to the Grademaxxing team. StudentVUE remains the official record;
		please leave school records and personal information out of your message.
	</p>

	<section class="border-border/80 bg-card mt-5 overflow-hidden rounded-xl border shadow-sm">
		<div class="border-border/70 flex items-start gap-3 border-b px-4 py-4 sm:px-5">
			<div
				class="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-full"
			>
				<MessageCircleIcon class="size-4" aria-hidden="true" />
			</div>
			<div>
				<p class="font-semibold">Grademaxxing support</p>
				<p class="text-muted-foreground mt-1 text-sm leading-5">{assistantReply}</p>
			</div>
		</div>

		<div class="space-y-5 p-4 sm:p-5">
			{#if sent}
				<div class="border-primary/30 bg-primary/8 rounded-xl border p-5" role="status">
					<h2 class="font-heading text-lg font-bold">Feedback sent</h2>
					<p class="text-muted-foreground mt-1 text-sm">
						It landed in the private admin inbox. Thanks for helping improve the beta.
					</p>
					<Button class="mt-4" variant="outline" onclick={startAnother}>Send another</Button>
				</div>
			{:else}
				<fieldset>
					<legend class="text-sm font-semibold">What kind of feedback is this?</legend>
					<div class="mt-3 grid gap-2 sm:grid-cols-3" role="group" aria-label="Feedback type">
						{#each feedbackKinds as kind (kind.value)}
							{@const Icon = kind.icon}
							<button
								type="button"
								aria-pressed={feedbackKind === kind.value}
								onclick={() => (feedbackKind = kind.value)}
								class="border-border hover:bg-accent/60 focus-visible:ring-ring flex min-h-24 items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none {feedbackKind ===
								kind.value
									? 'border-primary bg-primary/8'
									: 'bg-background'}"
							>
								<Icon class="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
								<span>
									<span class="block text-sm font-semibold">{kind.label}</span>
									<span class="text-muted-foreground mt-1 block text-xs leading-4"
										>{kind.description}</span
									>
								</span>
							</button>
						{/each}
					</div>
				</fieldset>

				<div class="border-border/70 bg-secondary/35 rounded-xl border p-3 sm:p-4">
					<label for="feedback-message" class="text-sm font-semibold">Your message</label>
					<textarea
						id="feedback-message"
						bind:value={message}
						autocomplete="off"
						aria-describedby="feedback-safety feedback-destination"
						placeholder="What happened, what did you expect, and which page were you on?"
						maxlength="2000"
						class="border-input bg-background mt-2 min-h-28 w-full resize-y rounded-lg border px-3 py-2 font-mono text-sm"
					></textarea>
					<p class="text-muted-foreground mt-1 text-right text-xs">{message.length}/2,000</p>
				</div>

				<div
					id="feedback-safety"
					class="border-border/70 bg-secondary/35 text-muted-foreground flex gap-3 rounded-lg border p-3 text-sm leading-5"
				>
					<ShieldCheckIcon class="text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" />
					<p>
						Do not include a password, student ID, full name, grade, screenshot, or other school
						record. Use a class nickname and report period instead.
					</p>
				</div>

				<div
					class="flex flex-col items-start justify-between gap-3 border-t pt-4 sm:flex-row sm:items-center"
				>
					<p id="feedback-destination" class="text-muted-foreground max-w-xl text-xs leading-4">
						Your message is stored without your name, username, student ID, IP address, or grades
						and is visible only in the private admin dashboard.
					</p>
					<Button
						onclick={submitFeedback}
						disabled={!canReport || sending}
						title={canReport ? 'Send feedback privately' : 'Describe the issue first'}
						>{sending ? 'Sending…' : 'Send feedback'}</Button
					>
				</div>
				{#if sendError}<p class="text-destructive text-sm" role="alert">{sendError}</p>{/if}
			{/if}
		</div>
	</section>

	{#if loadingHistory || feedbackHistory.length}
		<section class="mt-6" aria-labelledby="feedback-history-heading">
			<div class="flex items-end justify-between gap-4">
				<div>
					<p class="text-primary text-[0.68rem] font-bold tracking-[0.2em] uppercase">
						Private thread
					</p>
					<h2 id="feedback-history-heading" class="font-heading mt-1 text-xl font-bold">
						Your feedback
					</h2>
				</div>
				<Button variant="outline" size="sm" onclick={loadFeedbackHistory} disabled={loadingHistory}
					>{loadingHistory ? 'Checking…' : 'Check for replies'}</Button
				>
			</div>
			<div class="mt-3 space-y-3">
				{#each feedbackHistory as item (item.id)}
					<article class="border-border/80 bg-card rounded-xl border p-4 shadow-sm sm:p-5">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<p class="text-sm font-semibold">{item.kind}</p>
								<p class="text-muted-foreground mt-0.5 text-xs">Sent {dateTime(item.createdAt)}</p>
							</div>
							<span
								class="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-semibold"
							>
								{statusLabel(item.status)}
							</span>
						</div>
						<p class="text-foreground mt-3 text-sm leading-5 whitespace-pre-wrap">{item.message}</p>
						{#if item.adminReply}
							<div class="border-primary/25 bg-primary/7 mt-4 rounded-lg border p-3">
								<p class="text-primary text-xs font-bold tracking-wide uppercase">
									Reply from Grademaxxing
								</p>
								<p class="mt-2 text-sm leading-5 whitespace-pre-wrap">{item.adminReply}</p>
								{#if item.repliedAt}<p class="text-muted-foreground mt-2 text-xs">
										{dateTime(item.repliedAt)}
									</p>{/if}
							</div>
						{:else}
							<p class="text-muted-foreground mt-4 text-xs">No reply yet. Check back here later.</p>
						{/if}
					</article>
				{/each}
			</div>
			<p class="text-muted-foreground mt-3 text-xs leading-4">
				Reply receipts stay only in this browser and are removed when you sign out or clear site
				data.
			</p>
		</section>
	{/if}
</AppPageShell>
