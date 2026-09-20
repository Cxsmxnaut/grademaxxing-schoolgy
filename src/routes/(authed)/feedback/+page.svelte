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
	import SendIcon from '@lucide/svelte/icons/send';
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
		if (sent) return 'Thanks — your feedback is now in the private admin inbox.';
		if (!message.trim()) return 'Pick a topic, then tell us what happened in your own words.';
		if (!canReport) return 'A couple more words will help us understand the issue.';
		return 'That is ready to send privately to the Grademaxxing team.';
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

	<section class="border-border/80 bg-card mt-5 overflow-hidden rounded-2xl border shadow-sm">
		<div class="border-border/70 flex items-center gap-3 border-b px-4 py-3 sm:px-5">
			<div
				class="bg-primary text-primary-foreground relative grid size-10 shrink-0 place-items-center rounded-full"
			>
				<MessageCircleIcon class="size-4" aria-hidden="true" />
				<span
					class="border-card absolute right-0 bottom-0 size-3 rounded-full border-2 bg-emerald-500"
					aria-hidden="true"
				></span>
			</div>
			<div class="min-w-0 flex-1">
				<p class="leading-5 font-semibold">Grademaxxing support</p>
				<p class="text-muted-foreground text-xs">
					Private conversation · replies usually arrive here
				</p>
			</div>
			<span
				class="bg-secondary text-muted-foreground hidden rounded-full px-2.5 py-1 text-xs sm:inline"
				>Anonymous</span
			>
		</div>

		<div class="bg-secondary/20 min-h-44 space-y-4 p-4 sm:p-6">
			<div class="flex max-w-[88%] items-end gap-2 sm:max-w-[72%]">
				<div
					class="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full"
				>
					<MessageCircleIcon class="size-3.5" aria-hidden="true" />
				</div>
				<div>
					<p
						class="border-border/70 bg-card rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm leading-5 shadow-sm"
					>
						{assistantReply}
					</p>
					<p class="text-muted-foreground mt-1 px-1 text-[0.68rem]">Grademaxxing support</p>
				</div>
			</div>
			{#if sent}
				<h2 class="sr-only">Feedback sent</h2>
			{/if}
		</div>

		<div class="border-border/70 border-t p-3 sm:p-4">
			{#if sent}
				<div class="flex items-center justify-between gap-3">
					<p class="text-muted-foreground text-xs">Delivered to the private admin inbox.</p>
					<Button variant="outline" size="sm" onclick={startAnother}>New message</Button>
				</div>
			{:else}
				<fieldset>
					<legend class="sr-only">What kind of feedback is this?</legend>
					<div class="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Feedback type">
						{#each feedbackKinds as kind (kind.value)}
							{@const Icon = kind.icon}
							<button
								type="button"
								aria-pressed={feedbackKind === kind.value}
								onclick={() => (feedbackKind = kind.value)}
								class="border-border hover:bg-accent/60 focus-visible:ring-ring flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none {feedbackKind ===
								kind.value
									? 'border-primary bg-primary/8'
									: 'bg-background'}"
							>
								<Icon class="text-primary size-3.5 shrink-0" aria-hidden="true" />
								<span class="text-xs font-semibold">{kind.label}</span>
							</button>
						{/each}
					</div>
				</fieldset>

				<div
					class="border-input bg-background focus-within:ring-ring mt-3 flex items-end gap-2 rounded-2xl border p-2 focus-within:ring-2"
				>
					<label for="feedback-message" class="sr-only">Your message</label>
					<textarea
						id="feedback-message"
						bind:value={message}
						autocomplete="off"
						aria-describedby="feedback-safety feedback-destination"
						placeholder="Message Grademaxxing support…"
						maxlength="2000"
						class="max-h-40 min-h-14 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm outline-none"
					></textarea>
					<Button
						class="size-10 shrink-0 rounded-full p-0"
						onclick={submitFeedback}
						disabled={!canReport || sending}
						title={canReport ? 'Send feedback privately' : 'Describe the issue first'}
						aria-label={sending ? 'Sending feedback' : 'Send feedback'}
						><SendIcon class="size-4" aria-hidden="true" /></Button
					>
				</div>
				<div
					class="text-muted-foreground mt-2 flex items-start justify-between gap-3 px-1 text-[0.68rem] leading-4"
				>
					<p id="feedback-safety" class="flex gap-1.5">
						<ShieldCheckIcon class="text-primary mt-0.5 size-3 shrink-0" aria-hidden="true" />
						<span
							>Do not include passwords, names, student IDs, grades, screenshots, or school records.</span
						>
					</p>
					<span class="shrink-0">{message.length}/2,000</span>
				</div>
				<p id="feedback-destination" class="sr-only">
					Your message is stored anonymously and is visible only in the private admin dashboard.
				</p>
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
			<div class="mt-3 space-y-4">
				{#each feedbackHistory as item (item.id)}
					<article class="border-border/80 bg-card overflow-hidden rounded-2xl border shadow-sm">
						<header
							class="border-border/70 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3"
						>
							<div>
								<p class="text-sm font-semibold">{item.kind}</p>
								<p class="text-muted-foreground text-xs">
									Conversation started {dateTime(item.createdAt)}
								</p>
							</div>
							<span
								class="bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-xs font-semibold"
							>
								{statusLabel(item.status)}
							</span>
						</header>
						<div class="bg-secondary/20 space-y-5 p-4 sm:p-5">
							<div class="ml-auto max-w-[88%] sm:max-w-[72%]">
								<p
									class="bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-5 whitespace-pre-wrap shadow-sm"
								>
									{item.message}
								</p>
								<p class="text-muted-foreground mt-1 px-1 text-right text-[0.68rem]">
									You · {dateTime(item.createdAt)}
								</p>
							</div>
							{#if item.adminReply}
								<div class="flex max-w-[88%] items-end gap-2 sm:max-w-[72%]">
									<div
										class="bg-primary text-primary-foreground grid size-7 shrink-0 place-items-center rounded-full"
									>
										<MessageCircleIcon class="size-3.5" aria-hidden="true" />
									</div>
									<div>
										<p
											class="border-border/70 bg-card rounded-2xl rounded-bl-sm border px-4 py-2.5 text-sm leading-5 whitespace-pre-wrap shadow-sm"
										>
											{item.adminReply}
										</p>
										<p class="text-muted-foreground mt-1 px-1 text-[0.68rem]">
											Grademaxxing support{item.repliedAt ? ` · ${dateTime(item.repliedAt)}` : ''}
										</p>
									</div>
								</div>
							{:else}
								<div class="text-muted-foreground flex items-center gap-2 px-1 text-xs">
									<span class="size-1.5 rounded-full bg-amber-500"></span>Waiting for a reply
								</div>
							{/if}
						</div>
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
