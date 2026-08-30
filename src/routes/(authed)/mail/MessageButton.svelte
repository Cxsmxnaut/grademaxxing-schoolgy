<script lang="ts">
	import DateBadge from '$lib/components/DateBadge.svelte';
	import type { InboxItemListingsMessageXML } from '$lib/types/MailData';
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
	class="group flex h-auto w-full items-start gap-3 overflow-hidden rounded-none px-4 py-4 text-left sm:gap-4 sm:px-5"
>
	<span
		class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full font-bold"
	>
		{senderName.trim().charAt(0).toUpperCase() || 'S'}
	</span>

	<div class="min-w-0 flex-1">
		<div class="flex items-start justify-between gap-3">
			<p class="truncate text-sm font-semibold">{senderName}</p>
			<DateBadge date={new Date(message._SendDateTime)} />
		</div>
		<h2 class="mt-1 truncate text-base font-semibold">{message._Subject || '(No subject)'}</h2>
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
