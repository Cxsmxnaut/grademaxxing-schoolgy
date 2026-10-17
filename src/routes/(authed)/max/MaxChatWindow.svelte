<script module lang="ts">
	export type ChatRole = 'user' | 'max' | 'error';

	export interface ChatMessageView {
		id: number;
		role: ChatRole;
		text: string;
	}
</script>

<script lang="ts">
	/**
	 * MaxChatWindow — Svelte port of `frontend/MaxChatWindow.jsx` from the
	 * max-grademaxxing project (github.com/Cxsmxnaut/max-grademaxxing).
	 * Open WebUI-inspired dark shell, folk.com typography.
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
	import 'katex/dist/katex.min.css';
	import { renderMarkdown } from './markdown';

	let {
		messages = [],
		onSend,
		busy = false,
		modelLabel = 'max · mesh',
		placeholder = 'ask max anything…',
		disclaimer = 'max can make mistakes — double-check the math.'
	}: {
		messages?: ChatMessageView[];
		onSend?: (text: string) => void;
		busy?: boolean;
		modelLabel?: string;
		placeholder?: string;
		disclaimer?: string;
	} = $props();

	const DOTS = [0, 150, 300]; // ms stagger for the typing pulse

	let draft = $state('');
	let scrollRef = $state<HTMLElement | null>(null);
	let inputRef = $state<HTMLTextAreaElement | null>(null);
	const canSend = $derived(draft.trim() !== '' && !busy);
	const showTyping = $derived(busy && messages[messages.length - 1]?.role === 'user');

	// auto-grow the borderless textarea (OWUI composer behaviour)
	$effect(() => {
		const el = inputRef;
		if (!el) return;
		el.style.height = 'auto';
		el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
	});

	// pin the thread to the newest message, instantly (re-pins per streamed token)
	$effect(() => {
		const last = messages[messages.length - 1];
		void last?.text;
		void busy;
		const el = scrollRef;
		if (el) el.scrollTop = el.scrollHeight; // pin instantly
	});

	function submit() {
		const text = draft.trim();
		if (!text || busy) return;
		draft = '';
		onSend?.(text);
	}
</script>

<div
	class="flex h-full flex-col overflow-hidden bg-[#171717] text-[#ececec]"
	style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
	data-testid="max-chat-window"
>
	<!-- top bar — hairline, translucent -->
	<header
		class="relative z-10 flex flex-none items-center justify-between gap-3 border-b border-white/[.08] bg-[#171717]/80 px-5 py-3.5 backdrop-blur-xl"
	>
		<div class="flex min-w-0 items-center gap-2.5">
			<div
				class="grid h-[22px] w-[22px] flex-none place-items-center rounded-lg bg-[#ececec] text-[12px] font-bold text-[#171717]"
			>
				m
			</div>
			<div class="truncate text-[13.5px] font-semibold tracking-[-.01em]">
				max <span class="font-medium text-[#9b9b9b]">· grademaxxing</span>
			</div>
		</div>
		<div
			class="inline-flex flex-none items-center gap-1.5 rounded-full border border-white/[.08] bg-[#212121] px-2.5 py-1 font-mono text-[12px] text-[#9b9b9b]"
		>
			<span class="h-1.5 w-1.5 rounded-full bg-[#57d982] shadow-[0_0_6px_rgba(87,217,130,.7)]"
			></span>
			{modelLabel}
		</div>
	</header>

	<!-- scroll thread -->
	<main bind:this={scrollRef} class="flex-1 overflow-y-auto overscroll-contain">
		<div class="mx-auto flex w-full max-w-3xl flex-col gap-7 px-6 py-9">
			{#if messages.length === 0}
				<div class="py-[9vh] text-center">
					<div class="mb-3.5 font-mono text-[11px] tracking-[.18em] text-[#6e6e6e] uppercase">
						grademaxxing
					</div>
					<div
						class="mb-2.5 text-[clamp(26px,4vw,34px)] leading-tight font-semibold tracking-[-.03em]"
					>
						ask max.
					</div>
					<p class="text-[14.5px] text-[#9b9b9b]">
						clear answers about your grades — with the math to back it up.
					</p>
				</div>
			{/if}

			{#each messages as m (m.id)}
				{#if m.role === 'user'}
					<div class="flex animate-[rise_.18s_ease-out] flex-col items-end">
						<div
							class="max-w-[82%] rounded-2xl rounded-br-md bg-[#303030] px-4 py-2.5 text-[15px] break-words whitespace-pre-wrap"
						>
							{m.text}
						</div>
					</div>
				{:else}
					<div class="flex animate-[rise_.18s_ease-out] flex-col gap-1.5 text-left">
						<div class="font-mono text-[10.5px] tracking-[.16em] text-[#6e6e6e] uppercase">
							{m.role === 'error' ? 'system' : 'max'}
						</div>
						{#if m.role === 'error'}
							<div
								class="text-[15px] leading-[1.65] break-words whitespace-pre-wrap text-[#d9a05b] opacity-90"
							>
								{m.text}
							</div>
						{:else}
							<div class="max-reply text-[15px] leading-[1.68] break-words">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -- required by markdown rendering; renderMarkdown (markdown.ts) is escape-first: every source character is escaped before its tags are generated, so model output can never inject HTML. Covered by src/tests/max-markdown.test.ts. -->
								{@html renderMarkdown(m.text)}
							</div>
						{/if}
					</div>
				{/if}
			{/each}

			{#if showTyping}
				<div class="flex flex-col gap-1.5">
					<div class="font-mono text-[10.5px] tracking-[.16em] text-[#6e6e6e] uppercase">max</div>
					<div
						class="inline-flex w-fit items-center gap-[5px] rounded-2xl rounded-tl-md border border-white/[.08] bg-[#212121] px-4 py-3"
					>
						{#each DOTS as delay (delay)}
							<span
								class="max-typing-dot h-1.5 w-1.5 rounded-full bg-[#9b9b9b]"
								style="animation-delay: {delay}ms"
							></span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</main>

	<!-- composer — borderless input in a soft rounded shell -->
	<footer class="flex-none px-3 pb-4 sm:px-5">
		<form
			class="mx-auto flex w-full max-w-3xl items-end gap-1 rounded-3xl border border-white/[.08] bg-[#212121] px-1.5 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,.35)] transition focus-within:border-white/[.16] focus-within:shadow-[0_8px_28px_rgba(0,0,0,.35),0_0_0_3px_rgba(255,255,255,.04)]"
			onsubmit={(e) => {
				e.preventDefault();
				submit();
			}}
		>
			<textarea
				bind:this={inputRef}
				rows="1"
				bind:value={draft}
				{placeholder}
				aria-label="message max"
				data-testid="max-chat-input"
				onkeydown={(e) => {
					if (e.key === 'Enter' && !e.shiftKey) {
						e.preventDefault();
						submit();
					}
				}}
				class="max-h-[180px] min-h-[44px] flex-1 resize-none border-none bg-transparent px-4 py-2.5 text-[15px] leading-normal text-[#ececec] caret-[#ececec] outline-none placeholder:text-[#6e6e6e]"
			></textarea>
			<button
				type="submit"
				disabled={!canSend}
				aria-label="send message"
				data-testid="max-chat-send"
				class="mx-0.5 my-1 grid h-9 w-9 flex-none place-items-center rounded-full bg-[#ececec] text-[#171717] transition-all duration-150 enabled:hover:-translate-y-px enabled:hover:bg-white enabled:active:scale-95 disabled:cursor-default disabled:bg-[#333] disabled:text-[#6b6b6b]"
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
		<p class="mx-auto mt-2.5 max-w-3xl text-center text-[11.5px] tracking-[.01em] text-[#6e6e6e]">
			{disclaimer}
		</p>
	</footer>

	<!-- keyframes referenced by Tailwind's animate-[rise_...] utility — kept global
	     so the unscoped utility name resolves (Svelte renames scoped keyframes).
	     Reply styles below are ported from max-grademaxxing public/index.html
	     ("Rich ChatGPT-style markdown inside Max replies"); selectors stay scoped
	     under .max-reply even though the tags come from {@html}. -->
	<style>
		:global(@keyframes rise) {
			from {
				opacity: 0;
				transform: translateY(6px);
			}
			to {
				opacity: 1;
				transform: none;
			}
		}

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
			color: #fff;
		}
		.max-reply :global(em) {
			font-style: italic;
		}
		.max-reply :global(del) {
			opacity: 0.65;
		}
		.max-reply :global(code) {
			font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
			font-size: 0.87em;
			background: rgba(255, 255, 255, 0.08);
			border: 1px solid rgba(255, 255, 255, 0.09);
			border-radius: 6px;
			padding: 0.12em 0.42em;
			color: #6ee7b7;
		}
		.max-reply :global(pre) {
			background: #141414;
			border: 1px solid rgba(255, 255, 255, 0.09);
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
			color: #ececec;
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
			color: #6e6e6e;
		}
		.max-reply :global(h3) {
			font-size: 16.5px;
			font-weight: 650;
			margin: 1.05em 0 0.4em;
			letter-spacing: -0.015em;
			color: #fff;
		}
		.max-reply :global(h3:first-child) {
			margin-top: 0.1em;
		}
		.max-reply :global(hr) {
			border: none;
			border-top: 1px solid rgba(255, 255, 255, 0.09);
			margin: 1em 0;
		}
		.max-reply :global(blockquote) {
			margin: 0.75em 0;
			padding: 10px 14px;
			border-left: 3px solid #10b981;
			background: rgba(16, 185, 129, 0.07);
			border-radius: 0 10px 10px 0;
		}
		.max-reply :global(blockquote p) {
			margin: 0;
		}
		.max-reply :global(.table-wrap) {
			overflow-x: auto;
			margin: 0.75em 0 0.9em;
			border: 1px solid rgba(255, 255, 255, 0.12);
			border-radius: 12px;
			background: #1a1a1a;
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
			border-bottom: 1px solid rgba(255, 255, 255, 0.09);
		}
		.max-reply :global(th) {
			background: rgba(255, 255, 255, 0.04);
			font-weight: 650;
			color: #fff;
			font-size: 12.5px;
			letter-spacing: 0.01em;
			white-space: nowrap;
		}
		.max-reply :global(tr:last-child td) {
			border-bottom: none;
		}
		.max-reply :global(tbody tr:hover) {
			background: rgba(255, 255, 255, 0.025);
		}
	</style>
</div>
