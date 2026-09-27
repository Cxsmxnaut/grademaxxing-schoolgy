<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import { srcdoc } from './message';

	interface Props {
		message: InboxItemListingsMessageXML;
		content: string;
		links: Set<string>;
		touchscreen?: boolean;
	}
	let { message, content, links, touchscreen = false }: Props = $props();

	let from = $derived(message.From.RecipientXML);
	let recipients = $derived(
		typeof message.To !== 'string'
			? message.To.RecipientXML instanceof Array
				? message.To.RecipientXML
				: [message.To.RecipientXML]
			: undefined
	);
	let attachments = $derived(
		typeof message.Attachments !== 'string'
			? message.Attachments.AttachmentXML instanceof Array
				? message.Attachments.AttachmentXML
				: [message.Attachments.AttachmentXML]
			: undefined
	);
	const openNewTabInstruction = $derived(
		touchscreen
			? 'Tap and hold the link to open it in a new tab'
			: 'Ctrl+click or right-click the link to open it in a new tab'
	);
</script>

<article class="message-reader">
	<header class="reader-header">
		<h2>{message._Subject || '(No subject)'}</h2>
		<div class="reader-details">
			<p class="reader-sender">{from._Details1}</p>
			<p>{from._Details2} · {message._SendDateTimeFormattedLong}</p>
			{#if recipients}
				{#if recipients.length > 1}
					<p class="reader-recipient">To:</p>
					<ul>
						{#each recipients as recipient (recipient._GU)}
							<li>{recipient._Details1} ({recipient._Details2})</li>
						{/each}
					</ul>
				{:else if recipients[0]}
					<p class="reader-recipient">
						To: {recipients[0]._Details1} ({recipients[0]._Details2})
					</p>
				{/if}
			{/if}
		</div>
	</header>

	<iframe srcdoc={srcdoc(content, openNewTabInstruction)} sandbox="" title="Message Content"
	></iframe>

	{#if attachments || links.size > 0}
		<footer class="reader-attachments" aria-label="Message links and attachments">
			{#each links as link (link)}
				<Button
					href={link}
					target="_blank"
					rel="noopener noreferrer"
					variant="secondary"
					size="sm"
					class="max-w-full"
					title="Link"
				>
					<LinkIcon class="size-4 shrink-0" />
					<span class="truncate">{new URL(link).hostname}</span>
				</Button>
			{/each}
			{#each attachments ?? [] as attachment (attachment._SmAttachmentGU)}
				<Button
					href="/mail/attachment?attachmentGU={attachment._SmAttachmentGU}"
					target="_blank"
					rel="noopener noreferrer"
					variant="secondary"
					size="sm"
					class="max-w-full"
					title="Attachment"
				>
					<PaperclipIcon class="size-4 shrink-0" />
					<span class="truncate">{attachment._DocumentName}</span>
				</Button>
			{/each}
		</footer>
	{/if}
</article>

<style>
	/* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V4 · genre: modern-minimal · component: mail reader · palette: Grademaxxing semantic tokens */
	.message-reader {
		display: flex;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
	}
	.reader-header {
		flex: none;
		border-bottom: 1px solid var(--sidebar-border);
		padding: 1.25rem 1.5rem;
	}
	.reader-header h2 {
		margin: 0;
		padding-right: 1.75rem;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.125rem, 1.5vw, 1.5rem);
		font-weight: 700;
		line-height: 1.25;
		letter-spacing: -0.025em;
		overflow-wrap: anywhere;
	}
	.reader-details {
		margin-top: 1rem;
		color: var(--muted-foreground);
		font-size: 0.75rem;
		line-height: 1.55;
	}
	.reader-details p {
		margin: 0;
	}
	.reader-details .reader-sender {
		color: var(--foreground);
		font-size: 0.875rem;
		font-weight: 700;
	}
	.reader-recipient {
		margin-top: 0.375rem !important;
	}
	.reader-details ul {
		margin: 0;
		padding-left: 1.25rem;
	}
	iframe {
		width: calc(100% - 3rem);
		min-height: 0;
		flex: 1;
		align-self: center;
		margin: 1.25rem 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--foreground);
	}
	.reader-attachments {
		display: flex;
		max-height: 8rem;
		flex: none;
		flex-wrap: wrap;
		gap: 0.5rem;
		overflow-y: auto;
		border-top: 1px solid var(--sidebar-border);
		padding: 0.75rem 1.5rem;
	}
	@media (max-width: 39rem) {
		.reader-header {
			padding: 1.125rem 1.25rem;
		}
		iframe {
			width: 100%;
			margin: 0;
			border-radius: 0;
		}
		.reader-attachments {
			padding: 0.75rem 1.25rem;
		}
	}
</style>
