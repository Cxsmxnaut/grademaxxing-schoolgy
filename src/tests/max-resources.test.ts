import { getFeedbackForReceipt } from '$lib/server/feedback';
import * as maxFiles from '$lib/server/max/files';
import { readMaxFile } from '$lib/server/max/files';
import { maxAppKnowledge, sourceLinks, visibleSourceText } from '$lib/server/max/knowledge';
import { cleanMaxRecord, createMaxResourceAccess } from '$lib/server/max/resources';
import type { StudentSession } from '$lib/server/student-session';
import { afterEach, expect, test, vi } from 'vitest';

vi.mock('$lib/server/feedback', () => ({ getFeedbackForReceipt: vi.fn() }));
const accesses: ReturnType<typeof createMaxResourceAccess>[] = [];
afterEach(async () => {
	for (const access of accesses.splice(0)) await access.dispose();
	vi.clearAllMocks();
});
function setup(
	overrides: Record<string, unknown> = {},
	options: Parameters<typeof createMaxResourceAccess>[1] = {}
) {
	const assignments = Array.from({ length: 351 }, (_, i) => ({
		AssignmentID: String(i),
		Measure: `Assignment ${i}`,
		Notes: i === 350 ? 'Hidden rubric feedback: explain your reasoning.' : '',
		Point: '9',
		PointPossible: '10'
	}));
	const client = {
		gradebook: vi.fn(async (reportPeriod = 0) => ({
			selectedPeriod: { index: reportPeriod, name: `Quarter ${reportPeriod + 1}` },
			reportingPeriods: [
				{ index: 0, name: 'Quarter 1' },
				{ index: 1, name: 'Quarter 2' }
			],
			detailed: true,
			courses: [
				{
					id: 'bio',
					title: 'Biology',
					teacher: 'Synthetic teacher',
					score: 'A',
					scoreRaw: '94',
					categories: [],
					assignments
				}
			]
		})),
		messages: vi.fn(async () =>
			Array.from({ length: 151 }, (_, i) => ({
				messageId: String(i),
				subject: i === 150 ? 'Final laboratory directions' : `Message ${i}`,
				from: { contactDetails1: i === 150 ? 'Dr Synthetic Rivera' : 'School' },
				messageText: 'A synthetic preview.'
			}))
		),
		messageDetails: vi.fn(async () => ({
			from: { contactDetails1: 'Dr Synthetic Rivera' },
			to: [{ name: 'Synthetic student' }],
			messageText:
				'<p>Full laboratory instructions.</p><script>leak()</script>' +
				'Extra instructions. '.repeat(1100),
			attachments: [{ attachmentId: 'a1', name: 'rubric.txt' }],
			messageToken: 'must-not-reach-model'
		})),
		folders: vi.fn(async () => [
			{ id: 'inbox', name: 'Inbox', type: 0 },
			{ id: 'sent', name: 'Sent', type: 1 }
		]),
		schedule: vi.fn(async () => ({
			classes: [
				{ courseTitle: 'Biology', room: '101', teacher: 'Synthetic teacher', startTime: '08:30' }
			]
		})),
		calendar: vi.fn(async (month, year) => ({
			month,
			year,
			events: [{ title: 'Synthetic exam', description: 'Bring a calculator' }]
		})),
		documents: vi.fn(async () => [{ id: 'doc1', title: 'Laboratory rubric' }]),
		document: vi.fn(async () => ({
			fileName: 'rubric.txt',
			mimeType: 'text/plain',
			base64: btoa('Rubric: explain every claim with evidence.')
		})),
		attachment: vi.fn(async () => ({
			fileName: 'mail.txt',
			mimeType: 'text/plain',
			base64: btoa('Attachment instruction: bring goggles.')
		})),
		studentInfo: vi.fn(async () => ({
			name: 'Synthetic student',
			grade: 10,
			fields: { Counselor: 'Synthetic counselor' },
			photo: { base64: 'private-photo' },
			password: 'secret'
		})),
		schoolInfo: vi.fn(async () => ({ name: 'Synthetic school', phone: '555-0100' })),
		reportCards: vi.fn(async () => ({ transcript: [{ course: 'Biology', grade: 'A' }] })),
		...overrides
	};
	const session = {
		client,
		clientSessionId: 'synthetic',
		operationTail: Promise.resolve(),
		queuedOperations: 0
	} as unknown as StudentSession;
	const access = createMaxResourceAccess(session, options);
	accesses.push(access);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each resource has a different JSON result, asserted by the tests below.
	type ToolJson = Record<string, any>;
	const read = async (args: Record<string, unknown>, search = false) =>
		(await access.execute(args, search)) as ToolJson;
	return { access, client, read };
}

test('search covers every assignment beyond both old summary caps and exposes teacher notes', async () => {
	const { read, client } = setup();
	const found = await read({ resource: 'gradebook', query: 'Hidden rubric' }, true);
	expect(found.matches[0].path).toBe('/courses/0/assignments/350/Notes');
	const assignment = await read({
		resource: 'gradebook',
		path: '/courses/0/assignments/350',
		limit: 20
	});
	expect(assignment.records).toMatchObject({
		Measure: 'Assignment 350',
		Notes: 'Hidden rubric feedback: explain your reasoning.',
		Point: '9'
	});
	const page = await read({
		resource: 'gradebook',
		path: '/courses/0/assignments',
		offset: 340,
		limit: 5
	});
	expect(page).toMatchObject({ total: 351, nextOffset: 345 });
	await read({ resource: 'gradebook', reportPeriod: 1 });
	expect(client.gradebook).toHaveBeenCalledTimes(2);
	expect(client.gradebook).toHaveBeenLastCalledWith(1, false);
});

test('default individual-record reads include feedback beyond the first five fields while arrays stay paginated', async () => {
	const { read } = setup({
		gradebook: async () => ({
			courses: [
				{
					assignments: [
						{
							AssignmentID: 'synthetic',
							Measure: 'Evidence response',
							category: 'Reading',
							Point: '4',
							PointPossible: '10',
							graded: true,
							Notes: 'Use two quotes and explain how each supports the narrator claim.'
						}
					]
				}
			]
		})
	});
	const assignment = await read({ resource: 'gradebook', path: '/courses/0/assignments/0' });
	expect(assignment.records.Notes).toContain('two quotes');
	expect(assignment.nextOffset).toBeNull();
	const { read: readMany } = setup();
	expect(await readMany({ resource: 'gradebook', path: '/courses/0/assignments' })).toMatchObject({
		total: 351,
		nextOffset: 5
	});
});

test('mail folders, every sender and full bodies are accessible with text pagination', async () => {
	const { read, client } = setup();
	const found = await read(
		{ resource: 'mail', folderId: 'sent', folderType: 1, query: 'Rivera' },
		true
	);
	expect(found.matches[0].path).toBe('/messages/150/from/contactDetails1');
	expect(client.messages).toHaveBeenCalledWith('sent', 1);
	const body = await read({
		resource: 'message',
		recordId: '150',
		system: true,
		path: '/message/messageText',
		offset: 6000,
		limit: 6000
	});
	expect(body.content).toContain('Extra instructions');
	expect(body.nextOffset).toBe(12000);
	const message = await read({
		resource: 'message',
		recordId: '150',
		system: true,
		path: '/message',
		limit: 20
	});
	expect(JSON.stringify(message)).not.toContain('must-not-reach-model');
	expect(JSON.stringify(message)).not.toContain('leak()');
	expect(client.messageDetails).toHaveBeenCalledWith('150', true);
	expect((await read({ resource: 'mail_folders', path: '/folders' })).records['1'].name).toBe(
		'Sent'
	);
});

test('only saved, validated feedback receipts authorize private thread reads; tokens stay server-side', async () => {
	vi.mocked(getFeedbackForReceipt).mockResolvedValue({
		id: '12345678-1234-1234-1234-123456789abc',
		kind: 'Feature idea',
		messages: [{ sender: 'admin', message: 'Your request is planned.' }]
	} as never);
	const receipt = { id: '12345678-1234-1234-1234-123456789abc', replyToken: 'a'.repeat(43) };
	const { read } = setup(
		{},
		{ platform: {}, feedbackReceipts: [receipt, { id: 'other', replyToken: 'invalid' }] }
	);
	const result = await read({ resource: 'feedback', query: 'planned' }, true);
	expect(result.matches[0].excerpt).toContain('planned');
	expect(getFeedbackForReceipt).toHaveBeenCalledTimes(1);
	expect(getFeedbackForReceipt).toHaveBeenCalledWith({}, receipt.id, receipt.replyToken);
	expect(JSON.stringify(result)).not.toContain(receipt.replyToken);
	const foreign = await read({
		resource: 'feedback',
		recordId: '00000000-0000-0000-0000-000000000000'
	});
	expect(foreign.records.threads.count).toBe(0);
});

test('product knowledge searches the actual landing page, privacy policy and feature instructions without portal traffic', async () => {
	const { read, client, access } = setup();
	expect(maxAppKnowledge.pages.some((page) => page.path === '/privacy')).toBe(true);
	const policy = await read({ resource: 'app_info', query: 'non-exportable' }, true);
	expect(
		policy.matches.some((item: { excerpt: string }) => item.excerpt.includes('non-exportable'))
	).toBe(true);
	const landing = await read({ resource: 'app_info', query: 'Connect StudentVUE' }, true);
	expect(landing.matches.length).toBeGreaterThan(0);
	expect(access.usedPortal).toBe(false);
	expect(client.gradebook).not.toHaveBeenCalled();
	expect(
		visibleSourceText(
			'<script>const key="internal";</script><p>Read grades.</p><style>p{color:red}</style>'
		)
	).toBe('Read grades.');
});

test.each(['schedule', 'calendar', 'documents', 'report_cards', 'profile', 'school'] as const)(
	'reads the complete %s source with no credentials',
	async (resource) => {
		const { read } = setup();
		const result = await read({
			resource,
			...(resource === 'calendar' ? { month: 10, year: 2026 } : {})
		});
		expect(result.error).toBeUndefined();
		expect(JSON.stringify(result)).not.toContain('private-photo');
		expect(JSON.stringify(result)).not.toContain('secret');
	}
);

test('document and mail attachment text are readable through exact record ids', async () => {
	const { read } = setup();
	expect(
		(await read({ resource: 'document', recordId: 'doc1', path: '/content' })).content
	).toContain('explain every claim');
	expect(
		(await read({ resource: 'attachment', recordId: 'a1', path: '/content' })).content
	).toContain('bring goggles');
});

test('unsupported file formats are explicit, not invented visual interpretations', async () => {
	const file = await readMaxFile({
		fileName: 'image.png',
		mimeType: 'image/png',
		base64: btoa('synthetic placeholder')
	});
	expect(file).toMatchObject({ readable: false });
	expect(file).not.toHaveProperty('base64');
});

test('JSON pointers cannot traverse prototypes and arbitrary operations never reach the portal', async () => {
	const { read, client } = setup();
	for (const args of [
		{ resource: 'send_mail' },
		{ resource: 'gradebook', path: '/__proto__' },
		{ resource: 'gradebook', reportPeriod: -1 },
		{ resource: 'message' },
		{ resource: 'calendar', month: 10 }
	]) {
		expect(await read(args)).toHaveProperty('error');
	}
	expect(client.messages).not.toHaveBeenCalled();
	expect(
		cleanMaxRecord({
			sessionId: 'secret',
			replyToken: 'secret',
			cookies: { auth: 'secret' },
			profile: { name: 'Synthetic' },
			body: 'Read https://example.test/?token=hidden'
		})
	).toEqual({
		profile: { name: 'Synthetic' },
		body: 'Read https://example.test/?token=[redacted]'
	});
});

test('parallel resource reads remain serialized for the signed-in portal session and are cached per request', async () => {
	let active = 0,
		maxActive = 0;
	const execute = async () => {
		active++;
		maxActive = Math.max(maxActive, active);
		await new Promise((resolve) => setTimeout(resolve, 5));
		active--;
		return { classes: [] };
	};
	const { read, client } = setup({ schedule: vi.fn(execute), schoolInfo: vi.fn(execute) });
	await Promise.all([
		read({ resource: 'schedule' }),
		read({ resource: 'school' }),
		read({ resource: 'schedule' })
	]);
	expect(maxActive).toBe(1);
	expect(client.schedule).toHaveBeenCalledTimes(1);
});

test('raw upstream failures never leak records, identifiers or credentials through tool errors', async () => {
	const { read } = setup({
		schedule: vi.fn(async () => {
			throw new Error('private details secret-name session-token');
		})
	});
	const result = await read({ resource: 'schedule' });
	expect(result.code).toBe('UPSTREAM_ERROR');
	expect(JSON.stringify(result)).not.toContain('secret-name');
});

test('PDF text pages are extracted locally and binary data never reaches the model', async () => {
	const stream = 'BT /F1 12 Tf 72 700 Td (Synthetic report card: Biology A) Tj ET';
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
	];
	let source = '%PDF-1.4\n';
	const offsets = [0];
	objects.forEach((body, index) => {
		offsets.push(source.length);
		source += `${index + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xref = source.length;
	source += `xref\n0 6\n0000000000 65535 f \n${offsets
		.slice(1)
		.map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
		.join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	const file = await readMaxFile({
		fileName: 'synthetic.pdf',
		mimeType: 'application/pdf',
		base64: btoa(source)
	});
	try {
		expect(file).toHaveProperty('pageCount', 1);
		if (!('readPage' in file)) throw new Error('PDF reader missing');
		expect(await file.readPage(1)).toContain('Synthetic report card: Biology A');
		expect(file).not.toHaveProperty('base64');
	} finally {
		if ('dispose' in file) await file.dispose();
	}
});

test('native upstream TypeErrors are also sanitized and cancelled requests make no further portal calls', async () => {
	const { read, client, access } = setup({
		schedule: vi.fn(async () => {
			throw new TypeError('private student name in malformed portal data');
		})
	});
	expect(JSON.stringify(await read({ resource: 'schedule' }))).not.toContain(
		'private student name'
	);
	access.cancel();
	expect(await read({ resource: 'gradebook' })).toHaveProperty('error');
	expect(client.gradebook).not.toHaveBeenCalled();
});

test('a scanned PDF page explicitly reports unavailable visual content instead of claiming an empty record', async () => {
	const spy = vi.spyOn(maxFiles, 'readMaxFile').mockResolvedValueOnce({
		fileName: 'scan.pdf',
		mimeType: 'application/pdf',
		readable: true,
		pageCount: 1,
		readPage: async () => '',
		dispose: async () => undefined
	});
	try {
		const { read } = setup();
		const page = await read({ resource: 'document', recordId: 'scan' });
		expect(page.textAvailable).toBe(false);
		expect(page.limitation).toContain('cannot inspect');
	} finally {
		spy.mockRestore();
	}
});

test('mail body links and public page destinations remain accessible without leaking URL credentials', () => {
	const body = cleanMaxRecord(
		'<p>Read <a href="https://school.example.test/rubric?token=private-value">the rubric</a>.</p>'
	);
	expect(body).toContain('the rubric (https://school.example.test/rubric?token=[redacted])');
	expect(sourceLinks('<a href="/privacy">Privacy</a><a href="javascript:bad()">bad</a>')).toEqual([
		{ label: 'Privacy', href: '/privacy' }
	]);
	expect(
		cleanMaxRecord({
			apiKey: 'private-key',
			passwordHash: 'private-hash',
			message: 'Class instructions.'
		})
	).toEqual({ message: 'Class instructions.' });
});
