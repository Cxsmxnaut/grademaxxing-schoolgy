<script lang="ts">
	import * as Item from '$lib/components/ui/item';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import { fullDateFormatter, shortDateFormatter } from '$lib/format/date-time';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import LinkIcon from '@lucide/svelte/icons/link';
	import MailIcon from '@lucide/svelte/icons/mail';
	import MailOpenIcon from '@lucide/svelte/icons/mail-open';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

	interface Props {
		message: InboxItemListingsMessageXML;
		disabled?: boolean;
		onclick?: () => void;
	}
	let { message, disabled = false, onclick }: Props = $props();

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

<Item.Root size="sm" class="mail-row" data-unread={unread}>
	{#snippet child({ props })}
		<button
			{...props}
			type="button"
			{disabled}
			{onclick}
			aria-label={`${unread ? 'Unread: ' : ''}${message._Subject || 'No subject'} from ${senderName}`}
			data-testid="mail-message"
		>
			<Item.Media class="message-media">
				{#if unread}<MailIcon class="size-4.5" />{:else}<MailOpenIcon class="size-4.5" />{/if}
				{#if unread}<span class="unread-indicator" aria-label="Unread"></span>{/if}
			</Item.Media>
			<Item.Content class="message-body">
				<div class="message-topline">
					<span class="sender" class:unread>{senderName}</span>
					<time
						datetime={validDate ? sentDate.toISOString() : undefined}
						title={validDate ? fullDateFormatter.format(sentDate) : 'Date unavailable'}
						>{validDate ? shortDateFormatter.format(sentDate) : 'Date unavailable'}</time
					>
				</div>
				<Item.Title class="subject">{message._Subject || '(No subject)'}</Item.Title>
				{#if preview}<Item.Description class="preview">{preview}</Item.Description>{/if}
				{#if linkCount > 0 || attachments}
					<div class="message-meta">
						{#if linkCount > 0}
							<span
								><LinkIcon class="size-3.5" />
								{linkCount}
								{linkCount === 1 ? 'link' : 'links'}</span
							>
						{/if}
						{#if attachments}
							<span
								><PaperclipIcon class="size-3.5" />
								{attachments.length}
								{attachments.length === 1 ? 'attachment' : 'attachments'}</span
							>
						{/if}
					</div>
				{/if}
			</Item.Content>
			<Item.Actions class="row-action" aria-hidden="true">
				<ChevronRightIcon class="size-4" />
			</Item.Actions>
		</button>
	{/snippet}
</Item.Root>

<style>
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · genre: modern-minimal · component: inbox row · palette: Grademaxxing semantic tokens */
	:global(.mail-row[data-slot='item']) {
		display: grid;
		width: 100%;
		grid-template-columns: 2.25rem minmax(0, 1fr) 1rem;
		align-items: start;
		gap: 0.875rem;
		min-height: 6.25rem;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--foreground);
		padding: 0.875rem 1rem;
		text-align: left;
		cursor: pointer;
	}
	:global(.mail-row:hover:not(:disabled)) {
		background: var(--sidebar-accent);
	}
	:global(.mail-row:active:not(:disabled)) {
		background: var(--sidebar-accent);
	}
	:global(.mail-row:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	:global(.mail-row:disabled) {
		cursor: wait;
		opacity: 0.65;
	}
	:global(.mail-row [data-slot='item-media']) {
		position: relative;
		width: 2.25rem;
		height: 2.25rem;
		align-self: start;
		border-radius: var(--radius-sm);
		background: var(--sidebar-accent);
		color: var(--muted-foreground);
	}
	:global(.mail-row[data-unread='true'] [data-slot='item-media']) {
		color: var(--sidebar-primary);
	}
	.unread-indicator {
		position: absolute;
		top: 0.1rem;
		right: 0.1rem;
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 50%;
		background: var(--sidebar-primary);
	}
	:global(.mail-row [data-slot='item-content']) {
		display: grid;
		min-width: 0;
		gap: 0.2rem;
	}
	.message-topline {
		display: flex;
		min-width: 0;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
	}
	.sender {
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.8rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sender.unread {
		color: var(--sidebar-foreground);
		font-weight: 750;
	}
	time {
		flex: none;
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.69rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	:global(.mail-row [data-slot='item-title']) {
		max-width: 100%;
		overflow: hidden;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 0.98rem;
		font-weight: 550;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.mail-row[data-unread='true'] [data-slot='item-title']) {
		font-weight: 700;
	}
	:global(.mail-row [data-slot='item-description']) {
		display: block;
		max-width: 100%;
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.78rem;
		line-height: 1.45;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.message-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-top: 0.15rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-weight: 550;
	}
	.message-meta > span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	:global(.mail-row [data-slot='item-actions']) {
		align-self: center;
		color: var(--muted-foreground);
	}
	:global(.mail-row:hover [data-slot='item-actions']) {
		color: var(--sidebar-accent-foreground);
	}
	@media (max-width: 39rem) {
		:global(.mail-row[data-slot='item']) {
			gap: 0.625rem;
			min-height: 6rem;
			padding: 0.75rem 0.5rem;
		}
		:global(.mail-row [data-slot='item-media']) {
			width: 2rem;
			height: 2rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.mail-row[data-slot='item']) {
			transition: none;
		}
	}
</style>
