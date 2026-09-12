<script lang="ts">
	import DateBadge from '$lib/components/DateBadge.svelte';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import { Badge } from '$lib/components/ui/badge';
	import { Button, type ButtonProps } from '$lib/components/ui/button';

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
	class="group hover:bg-primary/[0.045] relative flex h-auto w-full items-start gap-3 overflow-hidden rounded-none px-4 py-4 text-left transition-colors sm:gap-4 sm:px-5 {unread
		? 'bg-primary/[0.025]'
		: ''}"
	aria-label={`${unread ? 'Unread: ' : ''}${message._Subject || 'No subject'} from ${senderName}`}
	data-testid="mail-message"
>
	{#if unread}<span
			class="bg-primary absolute inset-y-3 left-0 w-0.5 rounded-r-full"
			aria-hidden="true"
		></span>{/if}
	<span
		class="bg-primary/10 text-primary ring-primary/10 flex size-10 shrink-0 items-center justify-center rounded-full font-bold ring-1"
	>
		{senderName.trim().charAt(0).toUpperCase() || 'S'}
	</span>

	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-3">
			<p class="truncate text-sm {unread ? 'font-bold' : 'font-semibold'}">{senderName}</p>
			<div class="flex shrink-0 items-center gap-2">
				{#if unread}<span class="bg-primary size-1.5 rounded-full" aria-label="Unread"></span>{/if}
				<DateBadge date={new Date(message._SendDateTime)} />
			</div>
		</div>
		<h2 class="mt-1 truncate text-base {unread ? 'font-bold' : 'font-semibold'}">
			{message._Subject || '(No subject)'}
		</h2>
		{#if preview}
			<p class="text-muted-foreground mt-1 line-clamp-1 text-sm font-normal">{preview}</p>
		{/if}
		<div class="mt-2 flex flex-row flex-wrap items-center gap-1.5">
			{#if linkCount > 0}
				<Badge variant="secondary">
					<LinkIcon class="mr-1 h-3.5 w-3.5" />
					{linkCount}
					{linkCount === 1 ? 'link' : 'links'}
				</Badge>
			{/if}

			{#if attachments}
				<Badge variant="secondary">
					<PaperclipIcon class="mr-1 h-3.5 w-3.5" />
					{attachments.length}
					{attachments.length === 1 ? 'attachment' : 'attachments'}
				</Badge>
			{/if}
		</div>
	</div>
</Button>
