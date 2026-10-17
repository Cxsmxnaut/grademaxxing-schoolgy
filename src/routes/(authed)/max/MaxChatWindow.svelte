<script lang="ts">
	/**
	 * MaxChatWindow — Svelte port of the sidebar and chat UI from the
	 * max-grademaxxing project (github.com/Cxsmxnaut/max-grademaxxing).
	 * Uses Grademaxxing colors, typography, and saved conversation state.
	 *
	 *   <MaxChatWindow
	 *     busy={pending}
	 *     messages={messages}                    // [{ id, role: 'user'|'max'|'error', text }]
	 *     onSend={(text) => askMax(text)}
	 *   />
	 *
	 * The component is pure UI: it owns no network logic and no state beyond
	 * the draft input. While `busy`, a typing pulse shows under the newest
	 * user message until Max's reply starts streaming in.
	 */
	import type { MaxReportReason } from '$lib/contracts/max-diagnostics';
	import 'katex/dist/katex.min.css';
	import { onMount, tick } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { SavedConversation, ChatMessageView } from '$lib/max/conversations';
	import PanelLeftOpen from '@lucide/svelte/icons/panel-left-open';
	import MaxChatSidebar from './MaxChatSidebar.svelte';
	import SquarePenIcon from '@lucide/svelte/icons/square-pen';
	import { renderMarkdown } from './markdown';

	let {
		messages = [],
		onSend,
		onReport,
		busy = false,
		conversations = [],
		activeChatId = '',
		namingIds = [],
		storageError = '',
		historyLoading = false,
		onNewChat,
		onOpenChat,
		onDeleteChat,
		onClearChats,
		placeholder = 'Ask Max anything…'
	}: {
		messages?: ChatMessageView[];
		onSend?: (text: string) => void;
		onReport?: (message: ChatMessageView, reason: MaxReportReason) => Promise<void>;
		busy?: boolean;
		conversations?: SavedConversation[];
		activeChatId?: string;
		namingIds?: string[];
		storageError?: string;
		historyLoading?: boolean;
		onNewChat?: () => void;
		onOpenChat?: (id: string) => void;
		onDeleteChat?: (id: string) => void;
		onClearChats?: () => void;
		placeholder?: string;
	} = $props();

	const DOTS = [0, 150, 300]; // ms stagger for the typing pulse

	let draft = $state('');
	let reportingIds = $state<number[]>([]);
	let sidebarOpen = $state(false);
	let compact = $state(true);
	let rootRef = $state<HTMLElement | null>(null);
	let openSidebarRef = $state<HTMLButtonElement | null>(null);
	let scrollRef = $state<HTMLElement | null>(null);
	let threadRef = $state<HTMLElement | null>(null);
	let followLatest = $state(true);
	let lastScrollShape = '';
	let inputRef = $state<HTMLTextAreaElement | null>(null);
	function pinLatest() {
		if (!scrollRef) return;
		if (followLatest) scrollRef.scrollTop = scrollRef.scrollHeight;
		lastScrollShape = `${scrollRef.clientWidth}:${scrollRef.clientHeight}:${scrollRef.scrollHeight}`;
	}
	const canSend = $derived(draft.trim() !== '' && !busy);
	const showTyping = $derived(busy && messages[messages.length - 1]?.role === 'user');

	// auto-grow the borderless textarea (OWUI composer behaviour)
	$effect(() => {
		void draft;
		const el = inputRef;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
	});

	// pin the thread to the newest message, instantly (re-pins per streamed token)
	$effect.pre(() => {
		const last = messages[messages.length - 1];
		void last?.text;
		void busy;
		const el = scrollRef;
		if (el && followLatest) void tick().then(pinLatest);
	});

	function startChat() {
		if (busy) return;
		draft = '';
		followLatest = true;
		onNewChat?.();
		if (compact) sidebarOpen = false;
	}
	function selectChat(id: string) {
		if (busy) return;
		draft = '';
		followLatest = true;
		onOpenChat?.(id);
		if (compact) sidebarOpen = false;
	}
	onMount(() => {
		const layoutObserver = new ResizeObserver(([entry]) => {
			if (!entry) return;
			const nextCompact = entry.contentRect.width < 720;
			if (nextCompact !== compact) {
				compact = nextCompact;
				sidebarOpen = !compact;
			}
		});
		if (rootRef) layoutObserver.observe(rootRef);
		const observer = new ResizeObserver(pinLatest);
		if (scrollRef) observer.observe(scrollRef);
		if (threadRef) observer.observe(threadRef);
		return () => {
			observer.disconnect();
			layoutObserver.disconnect();
		};
	});

	function submit() {
		const text = draft.trim();
		if (!text || busy) return;
		followLatest = true;
		draft = '';
		onSend?.(text);
	}
</script>

{#snippet sidebar()}
	<MaxChatSidebar
		{conversations}
		{activeChatId}
		{namingIds}
		{busy}
		{historyLoading}
		onClose={() => {
			sidebarOpen = false;
			void tick().then(() => openSidebarRef?.focus());
		}}
		onNewChat={startChat}
		onOpenChat={selectChat}
		{onDeleteChat}
		{onClearChats}
	/>
{/snippet}

<div
	bind:this={rootRef}
	class="max-shell bg-background text-foreground relative flex h-full min-h-0 min-w-0 overflow-hidden"
	data-testid="max-chat-window"
	data-chat-layout={compact ? 'drawer' : 'inline'}
>
	{#if !compact && sidebarOpen}{@render sidebar()}{/if}
	{#if compact}
		<Dialog.Root bind:open={sidebarOpen}>
			<Dialog.Content
				portalProps={{ to: rootRef ?? undefined }}
				showCloseButton={false}
				class="top-0 left-0 block h-full w-[260px] max-w-[calc(100%-2rem)] translate-x-0 translate-y-0 rounded-none border-0 p-0 sm:max-w-[260px]"
				onCloseAutoFocus={(event) => {
					event.preventDefault();
					void tick().then(() => openSidebarRef?.focus());
				}}
			>
				<Dialog.Title class="sr-only">Chat history</Dialog.Title>
				<Dialog.Description class="sr-only"
					>Start a new chat or continue a recent conversation with Max.</Dialog.Description
				>
				{@render sidebar()}
			</Dialog.Content>
		</Dialog.Root>
	{/if}
	<div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
		{#if !sidebarOpen}
			<div class="absolute top-2.5 left-2.5 z-10 flex gap-1" aria-label="Chat actions">
				<button
					bind:this={openSidebarRef}
					type="button"
					aria-label="Open chat sidebar"
					aria-expanded={sidebarOpen}
					onclick={() => (sidebarOpen = true)}
					class="bg-background/95 text-muted-foreground hover:bg-secondary focus-visible:outline-ring grid size-9 place-items-center rounded-md focus-visible:outline-2"
					><PanelLeftOpen size={18} /></button
				>
				<button
					type="button"
					aria-label="Start new chat"
					onclick={startChat}
					disabled={busy}
					class="bg-background/95 text-muted-foreground hover:bg-secondary focus-visible:outline-ring grid size-9 place-items-center rounded-md focus-visible:outline-2 disabled:opacity-40"
					><SquarePenIcon size={18} /></button
				>
			</div>
		{/if}

		<!-- scroll thread -->
		<div
			bind:this={scrollRef}
			class="min-h-0 flex-1 overflow-y-auto overscroll-contain"
			role="log"
			aria-label="Conversation with Max"
			aria-relevant="additions"
			onscroll={() => {
				if (!scrollRef) return;
				const shape = `${scrollRef.clientWidth}:${scrollRef.clientHeight}:${scrollRef.scrollHeight}`;
				// Reflow can generate a scroll before ResizeObserver pins the new
				// bottom. It must not be mistaken for the reader scrolling away.
				if (shape === lastScrollShape)
					followLatest = scrollRef.scrollHeight - scrollRef.clientHeight - scrollRef.scrollTop < 80;
				lastScrollShape = shape;
			}}
		>
			<div
				bind:this={threadRef}
				class="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-7 px-4 pt-16 pb-8 sm:px-6"
			>
				{#if storageError}<p role="status" class="text-warning text-xs">{storageError}</p>{/if}
				{#if messages.length === 0}
					<div class="py-[8vh] text-center">
						<div
							class="text-muted-foreground mb-3.5 font-mono text-[11px] tracking-[.18em] uppercase"
						>
							Grademaxxing
						</div>
						<h1
							class="font-heading mb-2.5 text-[clamp(26px,4vw,34px)] leading-tight font-semibold tracking-[-.03em]"
						>
							Ask Max
						</h1>
						<p class="text-muted-foreground text-[14.5px]">
							Ask about your grades, school records, or anything in Grademaxxing.
						</p>
					</div>
				{/if}

				{#each messages as m (m.id)}
					{#if m.role === 'user'}
						<div class="flex min-w-0 flex-col items-end">
							<div
								class="bg-secondary max-w-[82%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap"
							>
								{m.text}
							</div>
						</div>
					{:else}
						<div class="flex min-w-0 flex-col gap-1.5 text-left">
							<div class="text-muted-foreground font-mono text-[10.5px] tracking-[.16em] uppercase">
								{m.role === 'error' ? 'Something went wrong' : 'Max'}
							</div>
							{#if m.role === 'error'}
								<div
									class="text-warning text-[15px] leading-[1.65] break-words whitespace-pre-wrap"
								>
									{m.text}
								</div>
							{:else}
								<div class="max-reply min-w-0 text-[15px] leading-[1.68] break-words">
									<!-- eslint-disable-next-line svelte/no-at-html-tags -- required by markdown rendering; renderMarkdown (markdown.ts) is escape-first: every source character is escaped before its tags are generated, so model output can never inject HTML. Covered by src/tests/max-markdown.test.ts. -->
									{@html renderMarkdown(m.text)}
								</div>
							{/if}
							{#if m.diagnosticId && m.reportReceipt}
								<div class="text-muted-foreground mt-2 flex flex-wrap items-center gap-2 text-xs">
									{#if m.reported}<span>Issue reported. The reply text was not shared.</span>
									{:else}
										<select
											aria-label="Report a problem with this reply"
											class="border-border bg-background max-w-full rounded-sm border px-2 py-1"
											disabled={reportingIds.includes(m.id)}
											value=""
											onchange={async (e) => {
												const reason = e.currentTarget.value as MaxReportReason;
												e.currentTarget.value = '';
												if (!reason || !onReport) return;
												reportingIds = [...reportingIds, m.id];
												try {
													await onReport(m, reason);
												} finally {
													reportingIds = reportingIds.filter((id) => id !== m.id);
												}
											}}
										>
											<option value="">Report a problem…</option>
											<option value="empty">Empty or incomplete</option>
											<option value="incorrect">Incorrect answer</option>
											<option value="unhelpful">Unhelpful or off topic</option>
											<option value="formatting">Formatting problem</option>
										</select>
									{/if}
									{#if m.reportError}<span role="alert" class="text-warning">{m.reportError}</span
										>{/if}
								</div>
							{/if}
						</div>
					{/if}
				{/each}

				{#if showTyping}
					<div class="flex flex-col gap-1.5">
						<div class="text-muted-foreground font-mono text-[10.5px] tracking-[.16em] uppercase">
							Max
						</div>
						<div
							class="border-border bg-card inline-flex w-fit items-center gap-[5px] rounded-2xl rounded-tl-md border px-4 py-3"
						>
							{#each DOTS as delay (delay)}
								<span
									class="max-typing-dot bg-muted-foreground h-1.5 w-1.5 rounded-full"
									style="animation-delay: {delay}ms"
								></span>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- composer — borderless input in a soft rounded shell -->
		<footer class="flex-none px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-5">
			<form
				class="border-input bg-card focus-within:outline-ring mx-auto flex w-full max-w-3xl items-end gap-1 rounded-2xl border px-1.5 py-1.5 focus-within:outline-2 focus-within:outline-offset-2"
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<textarea
					bind:this={inputRef}
					rows="1"
					disabled={historyLoading}
					bind:value={draft}
					{placeholder}
					aria-label="message max"
					data-testid="max-chat-input"
					onkeydown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
							e.preventDefault();
							submit();
						}
					}}
					class="text-foreground caret-primary placeholder:text-muted-foreground max-h-[180px] min-h-[44px] min-w-0 flex-1 resize-none border-none bg-transparent px-4 py-2.5 text-[15px] leading-normal outline-none"
				></textarea>
				<button
					type="submit"
					disabled={!canSend}
					aria-label="send message"
					data-testid="max-chat-send"
					class="bg-primary text-primary-foreground enabled:hover:bg-primary/90 enabled:active:bg-primary/80 focus-visible:outline-ring disabled:bg-muted disabled:text-muted-foreground mx-0.5 grid h-11 w-11 flex-none place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed"
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="h-[17px] w-[17px]"
					>
						<path d="M12 19V5M5 12l7-7 7 7" />
					</svg>
				</button>
			</form>
		</footer>
	</div>
</div>

<!-- Markdown tags are generated by the escape-first renderer; style them inside the reply. -->
<style>
	.max-shell {
		contain: layout;
	}
	/* Hallmark · component: Max chat · existing Grademaxxing tokens
		 * pre-emit critique: P5 H4 E5 S5 R5 V4 */

	/* typing pulse — ported from max-grademaxxing public/index.html (.typing i):
		   dots breathe in place and lift slightly mid-cycle. */
	.max-typing-dot {
		animation: max-blink 1.2s infinite ease-in-out;
	}
	@keyframes max-blink {
		0%,
		80%,
		100% {
			opacity: 0.25;
			transform: translateY(0);
		}
		40% {
			opacity: 1;
			transform: translateY(-3px);
		}
	}

	.max-reply :global(p) {
		margin: 0 0 0.75em;
	}
	.max-reply :global(p:last-child) {
		margin-bottom: 0;
	}
	.max-reply :global(strong) {
		font-weight: 650;
		color: var(--foreground);
	}
	.max-reply :global(em) {
		font-style: italic;
	}
	.max-reply :global(del) {
		opacity: 0.65;
	}
	.max-reply :global(a) {
		color: var(--primary);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.max-reply :global(code) {
		font-family: var(--font-technical);
		font-size: 0.87em;
		background: var(--secondary);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.12em 0.42em;
		color: var(--success);
	}
	.max-reply :global(pre) {
		background: var(--surface-sunken);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 13px 16px;
		overflow-x: auto;
		margin: 0.65em 0;
	}
	.max-reply :global(pre code) {
		background: none;
		border: none;
		padding: 0;
		font-size: 13px;
		line-height: 1.55;
		color: var(--foreground);
	}
	.max-reply :global(ul),
	.max-reply :global(ol) {
		margin: 0.4em 0 0.8em;
		padding-left: 1.45em;
	}
	.max-reply :global(li) {
		margin: 0.28em 0;
	}
	.max-reply :global(li::marker) {
		color: var(--muted-foreground);
	}
	.max-reply :global(h3) {
		font-size: 16.5px;
		font-weight: 650;
		margin: 1.05em 0 0.4em;
		letter-spacing: -0.015em;
		color: var(--foreground);
	}
	.max-reply :global(h3:first-child) {
		margin-top: 0.1em;
	}
	.max-reply :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 1em 0;
	}
	.max-reply :global(blockquote) {
		margin: 0.75em 0;
		padding: 10px 14px;
		border: 1px solid var(--border);
		background: var(--accent);
		border-radius: var(--corner-md);
	}
	.max-reply :global(blockquote p) {
		margin: 0;
	}
	.max-reply :global(.table-wrap) {
		overflow-x: auto;
		margin: 0.75em 0 0.9em;
		border: none;
		border-radius: 0;
		background: transparent;
	}
	.max-reply :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 13.8px;
		line-height: 1.45;
	}
	.max-reply :global(th),
	.max-reply :global(td) {
		padding: 9px 13px;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}
	.max-reply :global(th) {
		background: transparent;
		font-weight: 650;
		color: var(--foreground);
		font-size: 12.5px;
		letter-spacing: 0.01em;
		white-space: nowrap;
	}
	.max-reply :global(tr:last-child td) {
		border-bottom: none;
	}
	.max-reply :global(tbody tr:hover) {
		background: var(--muted);
	}
	.max-reply :global(.katex-display) {
		overflow-x: auto;
		overflow-y: clip;
		padding-block: 0.25rem;
	}
	@media (prefers-reduced-motion: reduce) {
		.max-typing-dot {
			animation: none;
			opacity: 0.6;
		}
	}
</style>
