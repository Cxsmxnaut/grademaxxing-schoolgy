import { createAdminSession } from '$lib/server/admin/auth';
import {
	clearMaxDiagnostics,
	createMaxDiagnostics,
	listMaxDiagnostics,
	redactSharedQuestion,
	reportMaxDiagnostic
} from '$lib/server/max/diagnostics';
import { TokenMesh, type MeshAttempt, type MeshResult } from '$lib/server/max/tokenMesh';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test, vi } from 'vitest';
import { DELETE, GET } from '../routes/api/admin/max/+server';
import { createDiagnosticDatabase } from './fixtures/max-database';

const databases: DatabaseSync[] = [];
afterEach(() => {
	databases.forEach((db) => db.close());
	databases.length = 0;
	vi.unstubAllEnvs();
	vi.useRealTimers();
});

function diagnosticDatabase() {
	const fixture = createDiagnosticDatabase();
	databases.push(fixture.db);
	return fixture;
}

const result = (text = 'Private synthetic AI reply'): MeshResult => ({
	text,
	provider: 'groq',
	model: 'test-model',
	slotId: 'synthetic',
	usage: null
});

test('migration-backed diagnostics retain only permitted metadata by default, never replies or tool results', async () => {
	const { platform } = diagnosticDatabase();
	const log = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'What is my GPA? Synthetic personal details.',
		shareQuestion: false
	});
	log.attempt({
		provider: 'groq',
		model: 'test-model',
		kind: 'rate_limit',
		status: 429,
		durationMs: 2
	});
	log.tool(
		'read_app_resource',
		{ notes: 'Private synthetic school record', auth: 'synthetic-token' },
		3
	);
	log.token('Private synthetic AI reply');
	await log.finish('success', result());
	const summary = await listMaxDiagnostics(platform);
	expect(summary?.items[0]).toMatchObject({
		topic: 'gpa',
		status: 'success',
		question: null,
		outputChars: 26,
		tokenFrames: 1
	});
	expect(summary?.items[0]?.events).toHaveLength(2);
	for (const secret of [
		'Private synthetic',
		'personal details',
		'synthetic-token',
		log.reportReceipt
	])
		if (secret) expect(JSON.stringify(summary)).not.toContain(secret);
});

test('only the explicit current-question choice permits bounded, best-effort redacted question storage', async () => {
	const { platform } = diagnosticDatabase();
	const question =
		'Ask synthetic-account at kid@example.test password=sample-password https://example.test/private ' +
		'x'.repeat(9000);
	const log = createMaxDiagnostics(platform, {
		action: 'chat',
		question,
		username: 'synthetic-account',
		shareQuestion: true
	});
	await log.finish('failed', undefined, 'PoolExhaustedError');
	const saved = (await listMaxDiagnostics(platform))!.items[0]!.question!;
	expect(saved.length).toBeLessThanOrEqual(8000);
	for (const value of ['synthetic-account', 'kid@example.test', 'sample-password', 'https://'])
		expect(saved).not.toContain(value);
	expect(saved).toContain('[email]');
	expect(redactSharedQuestion('api_key=synthetic-secret')).not.toContain('synthetic-secret');
	const title = createMaxDiagnostics(platform, {
		action: 'title',
		question: 'Private opening question',
		shareQuestion: true
	});
	await title.finish('success');
	expect(
		(await listMaxDiagnostics(platform))!.items.find((r) => r.id === title.id)?.question
	).toBeNull();
});

test('empty outputs, truncation, tool errors and partial failures produce flags without content', async () => {
	const { platform } = diagnosticDatabase();
	const empty = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	empty.attempt({ provider: 'groq', model: 'test', kind: 'empty', status: 200, durationMs: 2 });
	empty.tool('read_app_data', { error: 'Private synthetic detail' }, 4);
	await empty.finish('success', result('  '));
	const partial = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	partial.token('Secret partial text');
	await partial.finish('failed', undefined, 'UpstreamError');
	const outputLimit = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	outputLimit.token('Synthetic cut-off response');
	await outputLimit.finish('failed', undefined, 'MaxOutputLimitError');
	const limited = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	await limited.finish('success', {
		...result('answer【{"path":"private"}】'),
		finishReason: 'length'
	});
	const items = (await listMaxDiagnostics(platform))!.items;
	expect(items.find((i) => i.id === outputLimit.id)).toMatchObject({
		status: 'failed',
		errorCode: 'MaxOutputLimitError',
		flags: ['output_limit', 'partial_reply']
	});
	expect(items.find((i) => i.id === empty.id)).toMatchObject({
		status: 'empty',
		flags: expect.arrayContaining(['empty_provider_reply', 'tool_error', 'empty_reply'])
	});
	expect(items.find((i) => i.id === partial.id)?.flags).toContain('partial_reply');
	expect(items.find((i) => i.id === limited.id)?.flags).toEqual([
		'internal_citation',
		'output_limit'
	]);
	expect(JSON.stringify(items)).not.toContain('Secret partial text');
});

test('cancellation is terminal and late completions cannot overwrite it', async () => {
	const { platform } = diagnosticDatabase();
	const log = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	await log.finish('cancelled');
	await log.finish('success', result());
	expect((await listMaxDiagnostics(platform))!.items[0]?.status).toBe('cancelled');
});

test('reports require the per-request receipt and expose only a fixed issue category to admins', async () => {
	const { platform, db } = diagnosticDatabase();
	const log = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	await log.finish('success', result());
	expect(await reportMaxDiagnostic(platform, log.id, 'wrong', 'incorrect')).toBe(false);
	expect(await reportMaxDiagnostic(platform, log.id, log.reportReceipt!, 'incorrect')).toBe(true);
	const summary = await listMaxDiagnostics(platform, { issuesOnly: true });
	expect(summary?.totals.reported).toBe(1);
	expect(summary?.items[0]?.reportedReason).toBe('incorrect');
	expect(db.prepare('SELECT report_hash FROM max_diagnostics').get()?.report_hash).not.toBe(
		log.reportReceipt
	);
	expect(JSON.stringify(summary)).not.toContain('report_hash');
	expect(JSON.stringify(summary)).not.toContain(log.reportReceipt!);
});

test('expired rows are purged and abandoned requests appear incomplete', async () => {
	const { platform, db } = diagnosticDatabase();
	const log = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	await log.settled();
	db.prepare('UPDATE max_diagnostics SET created_at = ? WHERE id = ?').run(
		Date.now() - 11 * 60_000,
		log.id
	);
	expect((await listMaxDiagnostics(platform, { issuesOnly: true }))!.items[0]?.status).toBe(
		'incomplete'
	);
	db.prepare('UPDATE max_diagnostics SET created_at = ?').run(Date.now() - 8 * 86400_000);
	expect((await listMaxDiagnostics(platform))?.items).toHaveLength(0);
	expect(db.prepare('SELECT COUNT(*) AS count FROM max_diagnostics').get()?.count).toBe(0);
});

test('keyset pagination does not lose requests with the same millisecond timestamp', async () => {
	const { platform, db } = diagnosticDatabase();
	const now = Date.now();
	for (let i = 0; i < 53; i++)
		db.prepare(
			"INSERT INTO max_diagnostics (id, created_at, action, topic, status, report_hash) VALUES (?, ?, 'chat', 'other', 'success', 'hash')"
		).run(i.toString(16).padStart(36, '0'), now);
	const first = (await listMaxDiagnostics(platform))!;
	const second = (await listMaxDiagnostics(platform, { before: first.nextBefore! }))!;
	expect(first.items).toHaveLength(50);
	expect(second.items).toHaveLength(3);
	expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(53);
});

test('clear-all cannot be undone by a late in-flight flush', async () => {
	const { platform } = diagnosticDatabase();
	const log = createMaxDiagnostics(platform, {
		action: 'chat',
		question: 'hello',
		shareQuestion: false
	});
	await log.settled();
	await clearMaxDiagnostics(platform);
	await log.finish('success', result());
	expect((await listMaxDiagnostics(platform))?.items).toHaveLength(0);
});

test('missing or failed telemetry storage does not throw or advertise a usable report receipt', async () => {
	const missing = createMaxDiagnostics(undefined, {
		action: 'chat',
		question: 'hello',
		shareQuestion: true
	});
	await missing.finish('success', result());
	expect(missing.reportReceipt).toBeUndefined();
	const broken = createMaxDiagnostics(
		{
			env: {
				GRADEMAXXING_USAGE_DB: {
					prepare: () => {
						throw new Error('Storage unavailable');
					}
				}
			}
		},
		{ action: 'chat', question: 'hello', shareQuestion: false }
	);
	await broken.finish('failed', undefined, 'UpstreamError');
	expect(broken.reportReceipt).toBeUndefined();
});

test('attempt observers stay scoped to concurrent requests and observer failures do not affect routing', async () => {
	const a: MeshAttempt[] = [],
		b: MeshAttempt[] = [];
	const mesh = new TokenMesh({
		slots: [
			{
				id: 'test',
				key: 'synthetic-key',
				provider: 'groq',
				model: 'test',
				baseUrl: 'https://provider.test'
			}
		],
		fetchImpl: async () =>
			new Response(JSON.stringify({ choices: [{ message: { content: 'Synthetic answer' } }] })),
		benchJitterMs: 0
	});
	await Promise.all([
		mesh.complete({ messages: [] }, 0, (event) => a.push(event)),
		mesh.complete({ messages: [] }, 0, (event) => b.push(event))
	]);
	expect(a).toHaveLength(1);
	expect(b).toHaveLength(1);
	expect(JSON.stringify(a)).not.toContain('synthetic-key');
	await expect(
		mesh.complete({ messages: [] }, 0, () => {
			throw new Error('observer');
		})
	).resolves.toMatchObject({ text: 'Synthetic answer' });
});

test('administrator diagnostics and deletion require an administrator cookie, not a student cookie', async () => {
	const { platform } = diagnosticDatabase();
	const event = {
		cookies: { get: () => undefined },
		platform,
		url: new URL('https://example.test/api/admin/max')
	} as unknown as Parameters<typeof GET>[0];
	expect((await GET(event))?.status).toBe(401);
	expect((await DELETE(event))?.status).toBe(401);
	vi.stubEnv('GRADEMAXXING_ADMIN_SECRET', 'synthetic-admin-secret'.repeat(3));
	event.cookies.get = () => createAdminSession();
	const response = await GET(event);
	expect(response?.status).toBe(200);
	expect(response?.headers.get('cache-control')).toContain('no-store');
	expect((await DELETE(event))?.status).toBe(204);
});

test('a stalled diagnostics database cannot hold the chat open indefinitely', async () => {
	vi.useFakeTimers();
	const log = createMaxDiagnostics(
		{
			env: {
				GRADEMAXXING_USAGE_DB: {
					prepare: () => ({
						bind() {
							return this;
						},
						run: () => new Promise(() => {})
					})
				}
			}
		},
		{ question: 'synthetic hello', action: 'chat', shareQuestion: false }
	);
	const done = log.finish('success', result());
	await vi.advanceTimersByTimeAsync(1001);
	await done;
	expect(log.reportReceipt).toBeUndefined();
});
