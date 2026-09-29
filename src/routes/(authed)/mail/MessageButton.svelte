<script lang="ts">
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import { fullDateFormatter, shortDateFormatter } from '$lib/format/date-time';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

	interface Props {
		message: InboxItemListingsMessageXML;
		selected?: boolean;
		disabled?: boolean;
		onclick?: () => void;
	}
	let { message, selected = false, disabled = false, onclick }: Props = $props();

	const domParser = new DOMParser();
	const doc = $derived(domParser.parseFromString(message._MessageText, 'text/html'));
	const linkCount = $derived(
		new Set(
			[...doc.querySelectorAll('a')]
				.map((a) => {
					try {
						const url = new URL(a.href);
						return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
					} catch {
						return undefined;
					}
				})
				.filter((url): url is string => url !== undefined)
		).size
	);
	const preview = $derived.by(() => {
		const body = doc.body.cloneNode(true) as HTMLElement;
		body.querySelectorAll('br, p, div, li').forEach((element) => element.after(' '));
		return (body.textContent ?? '').replace(/\s+/g, ' ').trim();
	});
	const senderName = $derived(message.From.RecipientXML._Details1 || 'School message');
	const unread = $derived(message._MailRead !== 'true');
	const sentDate = $derived(new Date(message._SendDateTime));
	const validDate = $derived(!Number.isNaN(sentDate.getTime()));
	let attachments = $derived(
		typeof message.Attachments !== 'string'
			? message.Attachments.AttachmentXML instanceof Array
				? message.Attachments.AttachmentXML
				: [message.Attachments.AttachmentXML]
			: undefined
	);
</script>

<button
	type="button"
	class="mail-entry"
	class:unread
	data-selected={selected}
	{disabled}
	{onclick}
	aria-label={`${unread ? 'Unread: ' : ''}${message._Subject || 'No subject'} from ${senderName}`}
	aria-current={selected ? 'true' : undefined}
	data-testid="mail-message"
>
	<span class="entry-topline">
		<span class="sender">
			{#if unread}<span class="unread-dot" aria-label="Unread"></span>{/if}
			{senderName}
		</span>
		<time
			datetime={validDate ? sentDate.toISOString() : undefined}
			title={validDate ? fullDateFormatter.format(sentDate) : 'Date unavailable'}
			>{validDate ? shortDateFormatter.format(sentDate) : 'Date unavailable'}</time
		>
	</span>
	<span class="subject">{message._Subject || '(No subject)'}</span>
	{#if preview}<span class="preview">{preview}</span>{/if}
	{#if linkCount > 0 || attachments}
		<span class="message-meta">
			{#if linkCount > 0}
				<span><LinkIcon class="size-3.5" /> {linkCount} {linkCount === 1 ? 'link' : 'links'}</span>
			{/if}
			{#if attachments}
				<span
					><PaperclipIcon class="size-3.5" />
					{attachments.length}
					{attachments.length === 1 ? 'attachment' : 'attachments'}</span
				>
			{/if}
		</span>
	{/if}
</button>

<style>
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · genre: modern-minimal · component: mail list row · palette: Grademaxxing semantic tokens */
	.mail-entry {
		display: grid;
		width: 100%;
		min-width: 0;
		gap: 0.25rem;
		border: 0;
		border-bottom: 1px solid var(--sidebar-border);
		background: transparent;
		color: var(--foreground);
		padding: 1rem 1.25rem;
		text-align: left;
		cursor: pointer;
		transition: background-color 150ms ease-out;
	}
	.mail-entry:hover:not(:disabled),
	.mail-entry[data-selected='true'] {
		background: var(--sidebar-accent);
	}
	.mail-entry:focus-visible {
		position: relative;
		z-index: 1;
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	.mail-entry:disabled {
		cursor: wait;
		opacity: 0.65;
	}
	.entry-topline {
		display: flex;
		min-width: 0;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
	}
	.sender {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
		overflow: hidden;
		font-size: 0.8125rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mail-entry.unread .sender,
	.mail-entry.unread .subject {
		font-weight: 750;
	}
	.unread-dot {
		width: 0.375rem;
		height: 0.375rem;
		flex: none;
		border-radius: 50%;
		background: var(--sidebar-primary);
	}
	time {
		flex: none;
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.subject {
		overflow: hidden;
		font-family: var(--font-heading);
		font-size: 0.91rem;
		font-weight: 550;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.preview {
		display: -webkit-box;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.76rem;
		line-height: 1.45;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
	}
	.message-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.25rem;
		color: var(--muted-foreground);
		font-size: 0.68rem;
		font-weight: 550;
	}
	.message-meta > span {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	@media (max-width: 39rem) {
		.mail-entry {
			padding: 0.875rem 1rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.mail-entry {
			transition: none;
		}
	}
</style>
