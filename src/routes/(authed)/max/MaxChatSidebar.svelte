<script lang="ts">
	import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
	import SquarePen from '@lucide/svelte/icons/square-pen';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash-2';
	import type { SavedConversation } from '$lib/max/conversations';

	let {
		conversations,
		activeChatId,
		namingIds = [],
		busy,
		historyLoading,
		onClose,
		onNewChat,
		onOpenChat,
		onDeleteChat,
		onClearChats
	}: {
		conversations: SavedConversation[];
		activeChatId: string;
		namingIds?: string[];
		busy: boolean;
		historyLoading: boolean;
		onClose: () => void;
		onNewChat: () => void;
		onOpenChat: (id: string) => void;
		onDeleteChat?: (id: string) => void;
		onClearChats?: () => void;
	} = $props();
	let confirmClear = $state(false);
	const visibleChats = $derived(
		conversations.some((chat) => chat.id === activeChatId)
			? conversations
			: [{ id: activeChatId, title: 'New chat', messages: [], updatedAt: 0 }, ...conversations]
	);
</script>

<aside
	aria-label="Chat history"
	class="chat-sidebar bg-sidebar border-border text-foreground flex h-full w-[260px] shrink-0 flex-col border-r"
>
	<div class="flex items-center justify-between gap-1.5 px-2.5 pt-2.5 pb-1.5">
		<button type="button" class="icon-button" aria-label="Close chat sidebar" onclick={onClose}
			><PanelLeftClose size={18} /></button
		>
		<button
			type="button"
			class="icon-button"
			aria-label="Start new chat"
			onclick={onNewChat}
			disabled={busy}><SquarePen size={18} /></button
		>
	</div>
	<div class="px-2.5 pt-1 pb-2">
		<button
			type="button"
			class="new-chat hover:bg-sidebar-accent focus-visible:outline-ring flex min-h-10 w-full items-center justify-between gap-2.5 rounded-md px-[11px] py-[9px] text-sm font-medium focus-visible:outline-2 disabled:opacity-40"
			onclick={onNewChat}
			disabled={busy}
		>
			<span class="flex items-center gap-2.5"
				><span
					aria-hidden="true"
					class="bg-primary/15 text-primary grid size-6 place-items-center rounded-full text-xs font-semibold"
					>M</span
				>New chat</span
			><Plus size={16} />
		</button>
	</div>
	<div class="text-muted-foreground px-[18px] pt-3 pb-1.5 text-[11.5px] font-semibold">Recents</div>
	<nav aria-label="Recent chats" class="min-h-0 flex-1 overflow-y-auto px-2 pb-3.5">
		{#if historyLoading}<p role="status" class="text-muted-foreground p-3 text-xs">
				Loading chats…
			</p>
		{:else}
			<ul class="flex min-w-0 flex-col gap-0.5">
				{#each visibleChats as chat (chat.id)}
					<li
						class="chat-row hover:bg-sidebar-accent flex min-w-0 items-center gap-1.5 rounded-md pl-3"
						class:active={chat.id === activeChatId}
					>
						<button
							type="button"
							disabled={busy}
							aria-current={chat.id === activeChatId ? 'page' : undefined}
							onclick={() => onOpenChat(chat.id)}
							class="focus-visible:outline-ring min-w-0 flex-1 rounded-sm py-2.5 text-left text-[13.5px] leading-[1.35] focus-visible:outline-2 disabled:opacity-50"
							title={chat.title}
						>
							<span class="block truncate" class:is-naming={namingIds.includes(chat.id)}
								>{chat.title}</span
							>
						</button>
						{#if chat.messages.length}<button
								type="button"
								class="delete-chat icon-button mr-0.5"
								aria-label={`Delete chat: ${chat.title}`}
								disabled={busy}
								onclick={() => onDeleteChat?.(chat.id)}><Trash size={14} /></button
							>{/if}
					</li>
				{/each}
			</ul>
			{#if !conversations.length}<p class="text-muted-foreground px-3 pt-3 text-xs leading-relaxed">
					Your grade chats will show up here.
				</p>{/if}
		{/if}
	</nav>
	<div class="text-muted-foreground border-border border-t px-4 py-3 text-[11px] leading-relaxed">
		{#if confirmClear}
			<p>Delete all chats from this device?</p>
			<div class="flex gap-3">
				<button
					type="button"
					class="text-destructive min-h-9"
					disabled={busy}
					onclick={() => {
						onClearChats?.();
						confirmClear = false;
					}}>Delete all chats</button
				><button type="button" class="min-h-9" onclick={() => (confirmClear = false)}>Cancel</button
				>
			</div>
		{:else}
			<p>Saved on this device · 30 days</p>
			{#if conversations.length}<button
					type="button"
					class="hover:text-foreground focus-visible:outline-ring min-h-9 rounded-sm text-left focus-visible:outline-2"
					disabled={busy}
					onclick={() => (confirmClear = true)}>Clear chat history</button
				>{/if}
		{/if}
	</div>
</aside>

<style>
	/* Hallmark · component: user-owned Max sidebar · existing app tokens
	 * pre-emit critique: P5 H4 E5 S5 R5 V4 */
	.icon-button {
		display: grid;
		place-items: center;
		flex: none;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		color: var(--muted-foreground);
	}
	.icon-button:hover {
		background: var(--sidebar-accent);
		color: var(--foreground);
	}
	.icon-button:focus-visible {
		outline: 2px solid var(--ring);
	}
	.icon-button:disabled {
		opacity: 0.4;
	}
	.chat-row.active {
		background: var(--sidebar-accent);
		font-weight: 500;
	}
	.delete-chat {
		opacity: 0;
	}
	.chat-row:hover .delete-chat,
	.chat-row.active .delete-chat,
	.chat-row:focus-within .delete-chat {
		opacity: 1;
	}
	.is-naming {
		color: var(--primary);
		animation: naming 1.4s ease-in-out infinite;
	}
	@keyframes naming {
		50% {
			opacity: 0.4;
		}
	}
	@media (hover: none) {
		.delete-chat {
			opacity: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.is-naming {
			animation: none;
		}
	}
</style>
