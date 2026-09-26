<script lang="ts">
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import { Button, type ButtonProps } from '$lib/components/ui/button';
	import { fullDateFormatter, shortDateFormatter } from '$lib/format/date-time';

	interface Props extends ButtonProps {
		message: InboxItemListingsMessageXML;
		onclick?: () => void;
	}
	let { message, onclick, ...props }: Props = $props();

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
	const preview = $derived((doc.body.textContent ?? '').replace(/\s+/g, ' ').trim());
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

<Button
	{...props}
	{onclick}
	variant="ghost"
	class="mail-row"
	aria-label={`${unread ? 'Unread: ' : ''}${message._Subject || 'No subject'} from ${senderName}`}
	data-testid="mail-message"
>
	<span
		class="message-marker"
		class:unread
		aria-label={unread ? 'Unread' : undefined}
		aria-hidden={!unread}
	></span>
	<span class="message-body">
		<span class="message-topline">
			<span class="sender" class:unread>{senderName}</span>
			<time
				datetime={validDate ? sentDate.toISOString() : undefined}
				title={validDate ? fullDateFormatter.format(sentDate) : 'Date unavailable'}
				>{validDate ? shortDateFormatter.format(sentDate) : 'Date unavailable'}</time
			>
		</span>
		<span class="subject" class:unread>{message._Subject || '(No subject)'}</span>
		{#if preview}<span class="preview">{preview}</span>{/if}
		{#if linkCount > 0 || attachments}
			<span class="message-meta">
				{#if linkCount > 0}
					<span><LinkIcon class="size-3.5" /> {linkCount} {linkCount === 1 ? 'link' : 'links'}</span
					>
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
	</span>
</Button>

<style>
	/* Hallmark · genre: modern-minimal · macrostructure: inbox index · palette: Grademaxxing semantic tokens */
	:global(.mail-row) {
		display: flex;
		width: 100%;
		height: auto;
		min-height: 6.3rem;
		align-items: flex-start;
		gap: var(--space-sm);
		border-radius: 0;
		padding: var(--space-md) var(--space-xs);
		text-align: left;
		white-space: normal;
	}
	:global(.mail-row:hover) {
		background: var(--accent);
	}
	:global(.mail-row:active) {
		background: var(--accent);
	}
	:global(.mail-row:focus-visible) {
		outline: 2px solid var(--focus);
		outline-offset: -2px;
	}
	:global(.mail-row:disabled) {
		cursor: not-allowed;
	}
	.message-marker {
		width: 0.45rem;
		height: 0.45rem;
		flex: none;
		margin-top: 0.45rem;
		border-radius: 50%;
	}
	.message-marker.unread {
		background: var(--primary);
	}
	.message-body {
		display: grid;
		min-width: 0;
		flex: 1;
		gap: 0.22rem;
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
		color: var(--foreground);
		font-size: 0.8rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sender.unread {
		font-weight: 800;
	}
	time {
		flex: none;
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.69rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.subject {
		overflow: hidden;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 1rem;
		font-weight: 550;
		line-height: 1.35;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.subject.unread {
		font-weight: 750;
	}
	.preview {
		overflow: hidden;
		color: var(--muted-foreground);
		font-size: 0.78rem;
		font-weight: 400;
		line-height: 1.45;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.message-meta {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin-top: 0.18rem;
		color: var(--muted-foreground);
		font-size: 0.7rem;
		font-weight: 550;
	}
	.message-meta > span {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	@media (max-width: 39rem) {
		:global(.mail-row) {
			min-height: 5.8rem;
			gap: var(--space-xs);
		}
	}
</style>
