<script lang="ts">
	import type { InboxItemListingsMessageXML } from '$lib/types/MailData';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';

	interface Props {
		message: InboxItemListingsMessageXML;
		disabled?: boolean;
		onclick?: () => void;
	}

	let { message, disabled = false, onclick }: Props = $props();
	let unread = $derived(message._MailRead.toLowerCase() !== 'true');
	let sender = $derived(message.From.RecipientXML._Details1 || 'School message');
	let initials = $derived(
		sender
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0])
			.join('')
			.toUpperCase()
	);
	let preview = $derived(
		message._MessageText
			.replace(/<style[\s\S]*?<\/style>/gi, ' ')
			.replace(/<[^>]*>/g, ' ')
			.replace(/&nbsp;|&#160;/gi, ' ')
			.replace(/&amp;/gi, '&')
			.replace(/\s+/g, ' ')
			.trim()
	);
	let hasAttachments = $derived(typeof message.Attachments !== 'string');

	function shortDate(value: string) {
		const date = new Date(value);
		if (!value || Number.isNaN(date.getTime())) return 'Date unavailable';
		const today = new Date();
		if (date.toDateString() === today.toDateString()) {
			return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
				date
			);
		}
		if (date.getFullYear() === today.getFullYear()) {
			return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
		}
		return new Intl.DateTimeFormat(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		}).format(date);
	}
</script>

<button
	type="button"
	{disabled}
	{onclick}
	class="group hover:bg-accent/55 focus-visible:outline-primary mb-1 grid w-full grid-cols-[2.5rem_minmax(0,1fr)_auto] gap-3 rounded-xl px-4 py-3.5 text-left transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] disabled:cursor-wait disabled:opacity-60 sm:grid-cols-[2.5rem_10.5rem_minmax(0,1fr)_auto] sm:items-center sm:px-5 {unread
		? 'bg-accent/25'
		: ''}"
	aria-label={`${unread ? 'Unread: ' : ''}${message._Subject} from ${sender}`}
>
	<span
		class="bg-primary/12 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
		aria-hidden="true"
	>
		{initials || 'M'}
	</span>
	<div class="min-w-0 sm:contents">
		<div class="flex min-w-0 items-center gap-2">
			{#if unread}<span class="bg-primary h-2 w-2 shrink-0 rounded-full" aria-hidden="true"
				></span>{/if}
			<span class:font-bold={unread} class="truncate text-sm">{sender}</span>
		</div>
		<div class="mt-0.5 min-w-0 sm:mt-0">
			<div class="flex min-w-0 items-center gap-1.5">
				<span class:font-semibold={unread} class="truncate text-sm"
					>{message._Subject || '(No subject)'}</span
				>
				{#if hasAttachments}<PaperclipIcon
						class="text-muted-foreground h-3.5 w-3.5 shrink-0"
						aria-label="Has attachment"
					/>{/if}
			</div>
			{#if preview}<p class="text-muted-foreground mt-0.5 truncate text-sm">{preview}</p>{/if}
		</div>
	</div>
	<time
		datetime={message._SendDateTime}
		class="text-muted-foreground mt-0.5 text-xs font-medium whitespace-nowrap sm:mt-0"
	>
		{shortDate(message._SendDateTime)}
	</time>
</button>
