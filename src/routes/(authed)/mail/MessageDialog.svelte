<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import LinkIcon from '@lucide/svelte/icons/link';
	import PaperclipIcon from '@lucide/svelte/icons/paperclip';
	import { srcdoc } from './message';

	interface Props {
		open: boolean;
		touchscreen?: boolean;
		message: InboxItemListingsMessageXML;
		content?: string;
		links?: Set<string>;
	}

	let {
		open = $bindable(),
		touchscreen = false,
		message,
		content = '',
		links = new Set()
	}: Props = $props();

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

<Dialog.Root bind:open>
	<Dialog.Content
		class="flex h-[calc(100%-2rem)] w-[calc(100%-2rem)] flex-col overflow-hidden p-0 sm:max-w-4xl"
	>
		<Dialog.Header class="border-border border-b px-5 py-5 text-start sm:px-7 sm:py-6">
			<Dialog.Title class="font-heading pr-8 text-xl tracking-tight sm:text-2xl"
				>{message._Subject || '(No subject)'}</Dialog.Title
			>

			<Dialog.Description class="border-primary mt-4 border-l-2 pl-3">
				<div class="min-w-0">
					<p class="text-foreground text-sm font-semibold">{from._Details1}</p>
					<p class="mt-0.5 text-xs">{from._Details2} · {message._SendDateTimeFormattedLong}</p>

					{#if recipients}
						{#if recipients.length > 1}
							<p class="mt-2 text-xs">To:</p>

							<ul class="list-inside list-disc text-xs">
								{#each recipients as recipient (recipient._GU)}
									<li>{recipient._Details1} ({recipient._Details2})</li>
								{/each}
							</ul>
						{:else if recipients[0]}
							<p class="mt-2 text-xs">To: {recipients[0]._Details1} ({recipients[0]._Details2})</p>
						{/if}
					{/if}
				</div>
			</Dialog.Description>
		</Dialog.Header>

		<iframe
			srcdoc={srcdoc(content, openNewTabInstruction)}
			sandbox=""
			class="h-full min-h-0 bg-white sm:mx-7 sm:my-5 sm:border"
			title="Message Content"
		></iframe>

		{#if attachments || links.size > 0}
			<Dialog.Footer class="border-border flex-wrap border-t px-5 py-4 sm:justify-start sm:px-7">
				{#each links as link (link)}
					<Button
						href={link}
						target="_blank"
						rel="noopener noreferrer"
						variant="outline"
						title="Link"
					>
						<LinkIcon class="h-5 w-5 shrink-0" />
						<span class="truncate">{new URL(link).hostname}</span>
					</Button>
				{/each}

				{#each attachments ?? [] as attachment (attachment._SmAttachmentGU)}
					<Button
						href="/mail/attachment?attachmentGU={attachment._SmAttachmentGU}"
						target="_blank"
						rel="noopener noreferrer"
						variant="outline"
						title="Attachment"
					>
						<PaperclipIcon class="h-5 w-5 shrink-0" />
						<span class="truncate">{attachment._DocumentName}</span>
					</Button>
				{/each}
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
