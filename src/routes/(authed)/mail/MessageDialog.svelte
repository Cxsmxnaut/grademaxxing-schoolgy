<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import type { InboxItemListingsMessageXML } from '$lib/contracts/studentvue/mail';
	import MessageReader from './MessageReader.svelte';

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
</script>

<Dialog.Root bind:open>
	<Dialog.Content
		class="border-border flex h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0"
	>
		<Dialog.Title class="sr-only">{message._Subject || '(No subject)'}</Dialog.Title>
		<Dialog.Description class="sr-only">
			Message from {message.From.RecipientXML._Details1}, sent {message._SendDateTimeFormattedLong}
		</Dialog.Description>
		<MessageReader {message} {content} {links} {touchscreen} />
	</Dialog.Content>
</Dialog.Root>
