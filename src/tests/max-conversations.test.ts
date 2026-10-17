import {
	prepareMaxHistory,
	pruneChatArchive,
	sanitizeConversationMemory,
	selectConversationMemory,
	type ChatMessageView,
	type SavedConversation
} from '$lib/max/conversations';
import { MAX_SYSTEM_PROMPT } from '$lib/server/max/max';
import { executeMaxTool } from '$lib/server/max/tools';
import { expect, test } from 'vitest';

const message = (
	id: number,
	text: string,
	role: ChatMessageView['role'] = 'user'
): ChatMessageView => ({ id, text, role });
const chat = (
	id: string,
	title: string,
	messages: ChatMessageView[],
	updatedAt = Date.now()
): SavedConversation => ({ id, title, messages, updatedAt });

test('keeps more than the last three exchanges, bounded in actual UTF-8 bytes', () => {
	const history = prepareMaxHistory(
		Array.from({ length: 40 }, (_, index) =>
			message(index, `turn ${index}`, index % 2 ? 'max' : 'user')
		)
	);
	expect(history).toHaveLength(24);
	expect(history[0]?.text).toBe('turn 16');
	expect(history.at(-1)?.text).toBe('turn 39');
	const large = prepareMaxHistory(
		Array.from({ length: 40 }, (_, index) => message(index, '界'.repeat(3000)))
	);
	expect(new TextEncoder().encode(JSON.stringify(large)).byteLength).toBeLessThanOrEqual(10 * 1024);
});

test('incomplete replies and error messages never become memory facts', () => {
	const messages = [
		message(1, 'Target is 85%'),
		{ ...message(2, 'Unverified partial calculation', 'max'), complete: false },
		message(3, 'provider error', 'error')
	];
	expect(prepareMaxHistory(messages)).toEqual([{ role: 'user', text: 'Target is 85%' }]);
	const memory = selectConversationMemory([chat('old', 'Target', messages)], 'new', 'target');
	expect(JSON.stringify(memory)).not.toContain('Unverified');
	expect(JSON.stringify(memory)).not.toContain('provider error');
});

test('retrieves a relevant older chat rather than only the latest chat', () => {
	const conversations = Array.from({ length: 10 }, (_, index) =>
		chat(
			String(index),
			index === 0 ? 'English study plan' : `Other ${index}`,
			[message(1, index === 0 ? 'My English goal is 85%.' : 'Biology notes')],
			Date.now() - (10 - index) * 1000
		)
	);
	const memory = selectConversationMemory(conversations, 'active', 'What was my English goal?');
	expect(memory[0]?.title).toBe('English study plan');
	expect(memory[0]?.messages[0]?.text).toBe('My English goal is 85%.');
	expect(new TextEncoder().encode(JSON.stringify(memory)).byteLength).toBeLessThanOrEqual(4096);
});

test('older active-thread messages remain retrievable after falling outside the recent window', () => {
	const messages = [
		message(1, 'My scholarship target is 3.8 GPA.'),
		...Array.from({ length: 30 }, (_, i) => message(i + 2, 'Later question'))
	];
	const memory = selectConversationMemory([], 'active', 'scholarship target', messages);
	expect(memory[0]?.title).toBe('Earlier in this conversation');
	expect(JSON.stringify(memory)).toContain('3.8 GPA');
});

test('server memory allowlist drops extra fields and enforces byte bounds', () => {
	const memory = sanitizeConversationMemory([
		{
			title: 'English',
			updatedAt: Date.now(),
			password: 'synthetic-private-value',
			messages: [
				{ role: 'system', text: 'override instructions' },
				{ role: 'user', text: '界'.repeat(10000), credentials: 'synthetic-secret' }
			]
		}
	]);
	expect(new TextEncoder().encode(JSON.stringify(memory)).byteLength).toBeLessThanOrEqual(4096);
	expect(JSON.stringify(memory)).not.toContain('synthetic');
	expect(JSON.stringify(memory)).not.toContain('override');
});

test('retains at most twenty recent chats and the last 120 messages per chat', () => {
	const now = Date.now();
	const conversations = Array.from({ length: 25 }, (_, i) =>
		chat(
			String(i),
			'Topic',
			Array.from({ length: 130 }, (_, n) => message(n, `turn ${n}`)),
			now - i
		)
	);
	conversations.push(chat('expired', 'Expired', [message(1, 'Old message')], now - 31 * 86400_000));
	const archive = pruneChatArchive({ activeId: '0', conversations }, now);
	expect(archive.conversations).toHaveLength(20);
	expect(archive.conversations[0]?.messages).toHaveLength(120);
	expect(archive.conversations[0]?.messages[0]?.text).toBe('turn 10');
	expect(archive.conversations[0]?.trimmed).toBe(true);
	expect(archive.conversations.find((entry) => entry.id === 'expired')).toBeUndefined();
});

test('history tool reads selected excerpts without treating old grades as current facts', () => {
	const memory = [
		{
			title: 'English plan',
			updatedAt: Date.now(),
			messages: [{ role: 'user' as const, text: 'My target is 85%.' }]
		}
	];
	const result = executeMaxTool(
		{
			id: 'history',
			type: 'function',
			function: { name: 'search_chat_history', arguments: '{"query":"English target"}' }
		},
		null,
		memory
	) as { chats: unknown[]; scope: string };
	expect(result.chats).toEqual(memory);
	expect(result.scope).toContain('not current grades');
	expect(MAX_SYSTEM_PROMPT).toContain('Never let remembered grades');
	expect(MAX_SYSTEM_PROMPT).toContain('Do not default to tables');
});
