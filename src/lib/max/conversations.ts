export type ChatRole = 'user' | 'max' | 'error';
export interface ChatMessageView {
	id: number;
	role: ChatRole;
	text: string;
	complete?: boolean;
	diagnosticId?: string;
	reportReceipt?: string;
	reported?: boolean;
	reportError?: string;
}
export interface SavedConversation {
	id: string;
	title: string;
	titled?: boolean;
	updatedAt: number;
	messages: ChatMessageView[];
	trimmed?: boolean;
}
export interface ChatArchive {
	activeId: string | null;
	conversations: SavedConversation[];
}
export interface MemoryChat {
	title: string;
	updatedAt: number;
	messages: { role: 'user' | 'assistant'; text: string }[];
}
export const MAX_HISTORY_TURNS = 24;
export const MAX_HISTORY_TURN_CHARS = 2000;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const terms = (text: string) =>
	new Set(
		(text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []).filter(
			(word) =>
				![
					'the',
					'and',
					'what',
					'was',
					'were',
					'that',
					'this',
					'have',
					'with',
					'could',
					'would',
					'about',
					'please',
					'from',
					'last',
					'chat',
					'previous'
				].includes(word)
		)
	);
const overlap = (query: Set<string>, text: string) =>
	[...terms(text)].filter((word) => query.has(word)).length;

export function prepareMaxHistory(messages: ChatMessageView[], budget = 10 * 1024) {
	const result: { role: 'user' | 'assistant'; text: string }[] = [];
	for (const message of messages
		.filter((entry) => entry.role !== 'error' && entry.complete !== false)
		.slice(-MAX_HISTORY_TURNS)
		.toReversed()) {
		const turn = {
			role: message.role === 'user' ? ('user' as const) : ('assistant' as const),
			text: message.text.slice(0, MAX_HISTORY_TURN_CHARS)
		};
		if (bytes([turn, ...result]) > budget) break;
		result.unshift(turn);
	}
	return result;
}

/** Retrieve verbatim excerpts; never summarize old records into new "facts". */
export function selectConversationMemory(
	conversations: SavedConversation[],
	activeId: string,
	question: string,
	activeMessages: ChatMessageView[] = []
): MemoryChat[] {
	const query = terms(question);
	const candidates = [
		...conversations.filter((chat) => chat.id !== activeId),
		...(activeMessages.length > MAX_HISTORY_TURNS
			? [
					{
						id: activeId,
						title: 'Earlier in this conversation',
						updatedAt: Date.now(),
						messages: activeMessages.slice(0, -MAX_HISTORY_TURNS)
					}
				]
			: [])
	]
		.map((chat) => ({
			chat,
			score: overlap(
				query,
				chat.title + ' ' + chat.messages.map((message) => message.text).join(' ')
			)
		}))
		.toSorted((a, b) => b.score - a.score || b.chat.updatedAt - a.chat.updatedAt);
	const selected: MemoryChat[] = [];
	for (const { chat } of candidates.slice(0, 4)) {
		const eligible = chat.messages.filter(
			(message) => message.role !== 'error' && message.complete !== false
		);
		const ranked = eligible
			.map((message, index) => ({ index, score: overlap(query, message.text) }))
			.toSorted((a, b) => b.score - a.score || b.index - a.index);
		const indices = new Set<number>();
		for (const entry of ranked.slice(0, 2)) {
			indices.add(entry.index);
			if (entry.index > 0) indices.add(entry.index - 1);
			if (entry.index + 1 < eligible.length) indices.add(entry.index + 1);
		}
		const memory: MemoryChat = {
			title: chat.title.slice(0, 80),
			updatedAt: chat.updatedAt,
			messages: [...indices]
				.sort((a, b) => a - b)
				.map((index) => ({
					role: eligible[index]!.role === 'user' ? 'user' : 'assistant',
					text: eligible[index]!.text.slice(0, 1000)
				}))
		};
		while (memory.messages.length && bytes([...selected, memory]) > 4 * 1024) memory.messages.pop();
		if (memory.messages.length) selected.push(memory);
	}
	return selected;
}

export function sanitizeConversationMemory(value: unknown): MemoryChat[] {
	if (!Array.isArray(value)) return [];
	const result: MemoryChat[] = [];
	for (const entry of value.slice(0, 4)) {
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Partial<MemoryChat>;
		if (
			typeof item.title !== 'string' ||
			typeof item.updatedAt !== 'number' ||
			!Number.isFinite(item.updatedAt) ||
			!Array.isArray(item.messages)
		)
			continue;
		const chat: MemoryChat = {
			title: item.title.slice(0, 80),
			updatedAt: item.updatedAt,
			messages: item.messages
				.slice(0, 4)
				.flatMap((message) =>
					message &&
					(message.role === 'user' || message.role === 'assistant') &&
					typeof message.text === 'string'
						? [{ role: message.role, text: message.text.slice(0, 1000) }]
						: []
				)
		};
		while (chat.messages.length && bytes([...result, chat]) > 4 * 1024) chat.messages.pop();
		if (chat.messages.length) result.push(chat);
	}
	return result;
}

export function pruneChatArchive(value: unknown, now = Date.now()): ChatArchive {
	const input = value && typeof value === 'object' ? (value as Partial<ChatArchive>) : {};
	const conversations = (Array.isArray(input.conversations) ? input.conversations : [])
		.flatMap((chat) => {
			if (
				!chat ||
				typeof chat.id !== 'string' ||
				chat.id.length > 100 ||
				typeof chat.updatedAt !== 'number' ||
				!Number.isFinite(chat.updatedAt) ||
				chat.updatedAt < now - 30 * 86400_000 ||
				chat.updatedAt > now + 60_000 ||
				!Array.isArray(chat.messages)
			)
				return [];
			const messages = chat.messages.slice(-120).flatMap((message) =>
				typeof message?.text === 'string' && ['user', 'max', 'error'].includes(message.role)
					? [
							{
								id: Number.isSafeInteger(message.id) ? message.id : 0,
								role: message.role,
								text: message.text.slice(0, 12000),
								complete: message.complete !== false,
								reported: message.reported === true,
								...(/^[a-f0-9-]{36}$/i.test(message.diagnosticId ?? '') &&
								/^[\w-]{43}$/.test(message.reportReceipt ?? '')
									? { diagnosticId: message.diagnosticId, reportReceipt: message.reportReceipt }
									: {})
							}
						]
					: []
			);
			return messages.length
				? [
						{
							id: chat.id,
							title: typeof chat.title === 'string' ? chat.title.slice(0, 80) : 'Conversation',
							titled: chat.titled === true,
							updatedAt: chat.updatedAt,
							messages,
							trimmed: chat.trimmed || chat.messages.length > 120
						}
					]
				: [];
		})
		.toSorted((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 20);
	while (conversations.length > 1 && bytes(conversations) > 1024 * 1024) conversations.pop();
	const latest = conversations[0];
	if (latest)
		while (latest.messages.length > 1 && bytes(conversations) > 1024 * 1024) {
			latest.messages.shift();
			latest.trimmed = true;
		}
	return {
		activeId: typeof input.activeId === 'string' ? input.activeId.slice(0, 100) : null,
		conversations
	};
}
