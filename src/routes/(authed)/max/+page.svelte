<script lang="ts">
	import type { MaxReportReason } from '$lib/contracts/max-diagnostics';
	import { onDestroy, onMount, untrack } from 'svelte';
	import {
		maxChatOwner,
		loadMaxChatArchive,
		updateMaxChatArchive,
		clearMaxChatArchive
	} from '$lib/max/chat-vault';
	import {
		prepareMaxHistory,
		selectConversationMemory,
		type SavedConversation,
		type ChatMessageView,
		type ChatRole
	} from '$lib/max/conversations';
	import { acc } from '$lib/account.svelte';
	import MaxChatWindow from './MaxChatWindow.svelte';
	import { buildMaxStudentContext, loadMaxAppData, maxFeedbackReceipts } from './max-context';

	interface StreamFrame {
		diagnosticId?: unknown;
		reportReceipt?: unknown;
		t?: unknown;
		done?: unknown;
		text?: unknown;
		provider?: unknown;
		model?: unknown;
		error?: unknown;
	}

	let messages = $state<ChatMessageView[]>([]);
	let busy = $state(false);
	let conversations = $state<SavedConversation[]>([]);
	let activeChatId = $state('');
	let historyLoading = $state(false);
	let storageError = $state('');
	let owner = $state<string | null>(null);
	let namingIds = $state<string[]>([]);
	const titleRequests = new Map<string, AbortController>();
	let generation = 0;
	let disposed = false;
	const newId = () => window.crypto.randomUUID();

	async function initializeHistory(domain?: string, userID?: string) {
		const current = ++generation;
		for (const request of titleRequests.values()) request.abort();
		titleRequests.clear();
		namingIds = [];
		activeRequest?.abort();
		busy = false;
		messages = [];
		conversations = [];
		owner = null;
		activeChatId = newId();
		storageError = '';
		if (!domain || !userID) {
			historyLoading = false;
			return;
		}
		historyLoading = true;
		try {
			const identity = await maxChatOwner(domain, userID);
			if (current !== generation || disposed) return;
			owner = identity;
			const archive = await loadMaxChatArchive(identity, () => current === generation && !disposed);
			if (current !== generation || disposed) return;
			conversations = archive.conversations;
			activeChatId = archive.activeId ?? newId();
			messages = conversations.find((chat) => chat.id === activeChatId)?.messages ?? [];
			nextId = Math.max(0, ...messages.map((message) => message.id)) + 1;
		} catch {
			if (current === generation)
				storageError = 'Chats could not be saved on this device. You can continue chatting.';
		} finally {
			if (current === generation) historyLoading = false;
		}
	}
	$effect(() => {
		const account = acc.studentAccount;
		const domain = account?.domain;
		const userID = account?.userID;
		untrack(() => {
			void initializeHistory(domain, userID);
		});
	});

	async function saveCurrent() {
		const account = acc.studentAccount;
		if (!account || !activeChatId || !messages.length) return;
		const existing = conversations.find((chat) => chat.id === activeChatId);
		const saved: SavedConversation = {
			id: activeChatId,
			title:
				existing?.title ??
				(messages.find((message) => message.role === 'user')?.text ?? 'Conversation')
					.replace(/\s+/g, ' ')
					.slice(0, 80),
			titled: existing?.titled,
			updatedAt: Date.now(),
			messages: messages.map((message) => ({ ...message }))
		};
		conversations = [saved, ...conversations.filter((chat) => chat.id !== saved.id)].slice(0, 20);
		const scope = owner;
		if (!scope) return;
		try {
			await updateMaxChatArchive(
				scope,
				(archive) => ({
					activeId: saved.id,
					conversations: [saved, ...archive.conversations.filter((chat) => chat.id !== saved.id)]
				}),
				() =>
					owner === scope &&
					acc.studentAccount?.userID === account.userID &&
					acc.studentAccount?.domain === account.domain
			);
			if (!disposed && owner === scope) storageError = '';
		} catch {
			if (!disposed && owner === scope)
				storageError = 'Chats could not be saved on this device. You can continue chatting.';
		}
	}
	async function nameChat(id: string) {
		const chat = conversations.find((entry) => entry.id === id);
		const scope = owner;
		const account = acc.studentAccount;
		if (!chat || chat.titled || titleRequests.has(id) || !account) return;
		const opening = chat.messages.find((message) => message.role === 'user');
		const reply = chat.messages.find(
			(message) => message.role === 'max' && message.complete !== false
		);
		if (!opening || !reply) return;
		const controller = new AbortController();
		titleRequests.set(id, controller);
		namingIds = [...namingIds, id];
		const isCurrent = () =>
			!disposed &&
			!controller.signal.aborted &&
			owner === scope &&
			acc.studentAccount?.userID === account.userID &&
			acc.studentAccount?.domain === account.domain;
		let title = chat.title;
		try {
			const response = await fetch('/api/max', {
				method: 'POST',
				signal: controller.signal,
				headers: {
					'content-type': 'application/json',
					'x-grademaxxing-session': account.sessionId ?? ''
				},
				body: JSON.stringify({
					action: 'title',
					userQuery: opening.text.slice(0, 300),
					assistantReply: reply.text.slice(0, 300)
				})
			});
			const result = await response.json();
			if (response.ok && typeof result.title === 'string' && result.title.trim())
				title = result.title.trim().slice(0, 48);
		} catch {
			/* Keep the opening-message title if the naming provider is unavailable. */
		}
		try {
			if (!isCurrent() || !conversations.some((entry) => entry.id === id)) return;
			conversations = conversations.map((entry) =>
				entry.id === id ? { ...entry, title, titled: true } : entry
			);
			if (scope)
				await updateMaxChatArchive(
					scope,
					(archive) => ({
						...archive,
						conversations: archive.conversations.map((entry) =>
							entry.id === id ? { ...entry, title, titled: true } : entry
						)
					}),
					isCurrent
				);
		} catch {
			if (isCurrent()) storageError = 'The chat title could not be saved on this device.';
		} finally {
			if (titleRequests.get(id) === controller) {
				titleRequests.delete(id);
				namingIds = namingIds.filter((entry) => entry !== id);
			}
		}
	}
	function newChat() {
		if (busy || historyLoading) return;
		activeChatId = newId();
		messages = [];
		nextId = 1;
		void persistSelection();
	}
	async function persistSelection() {
		const scope = owner;
		const selected = activeChatId;
		if (!scope) return;
		try {
			await updateMaxChatArchive(
				scope,
				(archive) => ({ ...archive, activeId: selected }),
				() => owner === scope
			);
		} catch {
			storageError = 'Chats could not be saved on this device. You can continue chatting.';
		}
	}
	function openChat(id: string) {
		if (busy || historyLoading) return;
		const chat = conversations.find((entry) => entry.id === id);
		if (!chat) return;
		activeChatId = id;
		messages = chat.messages.map((message) => ({ ...message }));
		nextId = Math.max(0, ...messages.map((message) => message.id)) + 1;
		void persistSelection();
	}
	async function deleteChat(id: string) {
		if (busy) return;
		titleRequests.get(id)?.abort();
		conversations = conversations.filter((chat) => chat.id !== id);
		if (activeChatId === id) {
			activeChatId = newId();
			messages = [];
			nextId = 1;
		}
		const scope = owner;
		const selected = activeChatId;
		if (!scope) return;
		try {
			await updateMaxChatArchive(
				scope,
				(archive) => ({
					activeId: selected,
					conversations: archive.conversations.filter((chat) => chat.id !== id)
				}),
				() => owner === scope
			);
		} catch {
			storageError = 'Could not delete the saved chat. Please try again.';
		}
	}
	async function clearChats() {
		if (busy) return;
		for (const request of titleRequests.values()) request.abort();
		const scope = owner;
		try {
			if (scope) await clearMaxChatArchive(scope);
			if (owner !== scope) return;
			conversations = [];
			activeChatId = newId();
			messages = [];
			nextId = 1;
			storageError = '';
		} catch {
			storageError = 'Could not clear saved chats. Please try again.';
		}
	}
	let nextId = 1;
	let activeRequest: AbortController | undefined;
	onDestroy(() => {
		disposed = true;
		for (const request of titleRequests.values()) request.abort();
		generation++;
		if (busy) {
			activeRequest?.abort();
			messages = [...messages, withMessage('error', 'Reply interrupted when you left this chat.')];
			void saveCurrent();
		}
	});
	onMount(() => {
		void loadMaxAppData();
	});

	function withMessage(role: ChatRole, text: string): ChatMessageView {
		return { id: nextId++, role, text };
	}

	async function askMax(userQuery: string) {
		if (busy) return;
		busy = true;
		const controller = new AbortController();
		activeRequest = controller;
		const account = acc.studentAccount;

		const requestChatId = activeChatId;
		const requestOwner = owner;
		const history = prepareMaxHistory(messages);
		const conversationMemory = selectConversationMemory(
			conversations,
			activeChatId,
			userQuery,
			messages
		);
		messages = [...messages, withMessage('user', userQuery)];

		let reply: ChatMessageView | undefined;
		let raw = '';
		let diagnostic: Pick<ChatMessageView, 'diagnosticId' | 'reportReceipt'> = {};
		const captureDiagnostic = (frame: StreamFrame) => {
			if (
				typeof frame.diagnosticId === 'string' &&
				/^[a-f0-9-]{36}$/i.test(frame.diagnosticId) &&
				typeof frame.reportReceipt === 'string' &&
				/^[\w-]{43}$/.test(frame.reportReceipt)
			)
				diagnostic = { diagnosticId: frame.diagnosticId, reportReceipt: frame.reportReceipt };
		};
		try {
			await loadMaxAppData();
			if (controller.signal.aborted || acc.studentAccount !== account) return;
			const body = {
				studentDataContext: null as ReturnType<typeof buildMaxStudentContext>,
				userQuery,
				history,
				conversationMemory,
				feedbackReceipts: maxFeedbackReceipts(),
				stream: true
			};
			const availableBytes = 32 * 1024 - new TextEncoder().encode(JSON.stringify(body)).byteLength;
			body.studentDataContext = buildMaxStudentContext(
				userQuery,
				Math.min(16 * 1024, availableBytes)
			);
			if (!body.studentDataContext)
				throw new Error('Please shorten your question so Max can include your app records.');
			const response = await fetch('/api/max', {
				method: 'POST',
				signal: controller.signal,
				headers: {
					'content-type': 'application/json',
					accept: 'text/event-stream',
					'x-grademaxxing-session': account?.sessionId ?? ''
				},
				body: JSON.stringify(body)
			});

			const contentType = response.headers.get('content-type') ?? '';
			if (!response.ok || !contentType.includes('text/event-stream')) {
				const data = (await response.json().catch(() => ({}))) as StreamFrame;
				captureDiagnostic(data);
				throw new Error(
					typeof data.error === 'string' && data.error !== ''
						? data.error
						: `request failed (${response.status})`
				);
			}
			if (!response.body) throw new Error('no response stream');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let final: StreamFrame | null = null;
			let failure: Error | null = null;

			const handleLine = (line: string) => {
				if (!line.startsWith('data:')) return;
				let frame: StreamFrame;
				try {
					frame = JSON.parse(line.slice(5)) as StreamFrame;
				} catch {
					return;
				}
				if (!frame || typeof frame !== 'object') return;
				captureDiagnostic(frame);
				if (typeof frame.t === 'string' && frame.t !== '') {
					raw += frame.t;
					if (reply)
						messages = [...messages.slice(0, -1), { ...reply, text: raw, complete: false }];
					else {
						reply = { ...withMessage('max', raw), complete: false };
						messages = [...messages, reply];
					}
					reply = messages[messages.length - 1];
				} else if (frame.done) final = frame;
				else if (typeof frame.error === 'string' && frame.error !== '')
					failure = new Error(frame.error);
			};
			try {
				for (;;) {
					const { done, value } = await reader.read();
					if (done) break;
					buffer += decoder.decode(value, { stream: true });
					let newline: number;
					while ((newline = buffer.indexOf('\n')) !== -1) {
						handleLine(buffer.slice(0, newline).trim());
						buffer = buffer.slice(newline + 1);
					}
				}
				handleLine((buffer + decoder.decode()).trim());
			} finally {
				reader.releaseLock();
			}

			if (failure) throw failure;
			if (!final) throw new Error('The reply was interrupted. Please try again.');
			const completed = final as StreamFrame;
			const text =
				typeof completed?.text === 'string' && completed.text !== '' ? completed.text : raw;
			if (!text.trim()) throw new Error('empty response');
			if (reply)
				messages = [...messages.slice(0, -1), { ...reply, ...diagnostic, text, complete: true }];
			else messages = [...messages, { ...withMessage('max', text), ...diagnostic }];
		} catch (error) {
			if (controller.signal.aborted) return;
			const message = error instanceof Error ? error.message : String(error);
			messages = [
				...messages,
				{ ...withMessage('error', message || "max didn't answer — try again."), ...diagnostic }
			];
		} finally {
			if (activeRequest === controller) busy = false;
			if (
				account === acc.studentAccount &&
				activeChatId === requestChatId &&
				owner === requestOwner
			) {
				await saveCurrent();
				void nameChat(requestChatId);
			}
		}
	}
	async function reportReply(message: ChatMessageView, reason: MaxReportReason) {
		const account = acc.studentAccount;
		const chatId = activeChatId;
		try {
			const response = await fetch('/api/max/report', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'x-grademaxxing-session': account?.sessionId ?? ''
				},
				body: JSON.stringify({ id: message.diagnosticId, receipt: message.reportReceipt, reason })
			});
			if (!response.ok) throw new Error('Reporting failed. Please try again.');
			if (account !== acc.studentAccount || chatId !== activeChatId) return;
			messages = messages.map((m) =>
				m.id === message.id ? { ...m, reported: true, reportError: undefined } : m
			);
			await saveCurrent();
		} catch {
			if (account === acc.studentAccount && chatId === activeChatId)
				messages = messages.map((m) =>
					m.id === message.id ? { ...m, reportError: 'Reporting failed. Please try again.' } : m
				);
		}
	}
</script>

<svelte:head><title>Max AI · Grademaxxing</title></svelte:head>

<!-- The tab is the Max UI itself: the chat window fills the whole content
     area edge to edge (viewport minus the mobile top/bottom bars). -->
<div class="h-[calc(100svh-6.84375rem)] w-full overflow-hidden md:h-svh" data-testid="max-ai-panel">
	<MaxChatWindow
		{messages}
		busy={busy || historyLoading}
		{conversations}
		{namingIds}
		{activeChatId}
		{storageError}
		{historyLoading}
		onNewChat={newChat}
		onOpenChat={openChat}
		onDeleteChat={(id) => void deleteChat(id)}
		onClearChats={() => void clearChats()}
		onReport={reportReply}
		onSend={(text) => void askMax(text)}
	/>
</div>
