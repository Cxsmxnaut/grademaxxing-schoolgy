import { chromium, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gradebookXml } from '../src/lib/server/gradebook-adapter';
import { Pxp2Client } from '../src/lib/server/pxp2';
import { parseGradebookXML } from '../src/lib/synergy';

const username = process.env.STUDENTVUE_USERNAME;
const password = process.env.STUDENTVUE_PASSWORD;
const district = process.env.DISTRICT_URL;
const appUrl = process.env.GRADEMAXXING_URL ?? 'http://127.0.0.1:5173';

if (!username || !password || !district)
	throw new Error('StudentVUE environment variables are required.');

type JsonRecord = Record<string, unknown>;
type Result = { resource: string; records: number; durationMs: number };
const results: Result[] = [];

function count(value: unknown): number {
	if (Array.isArray(value)) return value.length;
	if (value && typeof value === 'object') return Object.keys(value).length;
	return value === null || value === undefined ? 0 : 1;
}

function assertParity(resource: string, direct: unknown, app: unknown, startedAt: number) {
	if (!isDeepStrictEqual(direct, app)) {
		const paths = differencePaths(direct, app).slice(0, 12);
		throw new Error(
			`${resource} differs between StudentVUE and Grademaxxing at: ${paths.join(', ') || '<root>'}.`
		);
	}
	results.push({ resource, records: count(direct), durationMs: Date.now() - startedAt });
	console.log(`PASS ${resource} (${count(direct)} records, ${Date.now() - startedAt} ms)`);
}

function differencePaths(left: unknown, right: unknown, path = '$'): string[] {
	if (isDeepStrictEqual(left, right)) return [];
	if (Array.isArray(left) && Array.isArray(right)) {
		const paths = left.length === right.length ? [] : [`${path}.length`];
		for (let index = 0; index < Math.max(left.length, right.length); index += 1)
			paths.push(...differencePaths(left[index], right[index], `${path}[${index}]`));
		return paths;
	}
	if (left && right && typeof left === 'object' && typeof right === 'object') {
		return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap((key) =>
			differencePaths((left as JsonRecord)[key], (right as JsonRecord)[key], `${path}.${key}`)
		);
	}
	return [path];
}

function hash(value: string) {
	return createHash('sha256').update(value).digest('hex');
}

function documentSignature(file: { base64: string; mimeType: string; fileName: string }) {
	return { hash: hash(file.base64), mimeType: file.mimeType, fileName: file.fileName };
}

function messageId(message: JsonRecord) {
	const value = message.messagePersonId ?? message.messageId;
	return typeof value === 'string' ? value : '';
}

function attachmentIds(value: unknown, parentKey = ''): string[] {
	if (Array.isArray(value)) return value.flatMap((item) => attachmentIds(item, parentKey));
	if (!value || typeof value !== 'object') {
		return parentKey === 'attachmentId' &&
			typeof value === 'string' &&
			/^[0-9a-f-]{36}$/i.test(value)
			? [value]
			: [];
	}
	return Object.entries(value as JsonRecord).flatMap(([key, item]) => attachmentIds(item, key));
}

async function appGet<T>(page: Page, path: string): Promise<T> {
	return page.evaluate(async (resource) => {
		const stored = localStorage.getItem('token');
		if (!stored) throw new Error('The app session is missing.');
		const token = JSON.parse(stored) as { sessionId?: string };
		if (!token.sessionId) throw new Error('The app session identifier is missing.');
		const response = await fetch(resource, {
			headers: { 'X-Grademaxxing-Session': token.sessionId }
		});
		if (!response.ok)
			throw new Error(
				`${new URL(resource, location.origin).pathname} returned HTTP ${response.status}.`
			);
		return response.json();
	}, path) as Promise<T>;
}

async function retry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
		}
	}
	throw lastError;
}

const browser = await chromium.launch({
	headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const context = await browser.newContext();
const page = await context.newPage();

try {
	await page.goto(`${appUrl}/login`);
	await page.getByLabel('StudentVUE Username').fill(username);
	await page.getByLabel('StudentVUE Password').fill(password);
	const domainInput = page.getByLabel('StudentVUE Domain');
	if (await domainInput.count()) await domainInput.fill(new URL(district).origin);
	await page.getByRole('checkbox', { name: /independent, unofficial tool/i }).check();
	await page.getByRole('button', { name: 'Log in', exact: true }).click();
	await page.waitForURL(/\/(?:grades|dashboard)$/, { timeout: 60_000 });

	const direct = await Pxp2Client.login(district, { username, password });

	if (process.env.PARITY_SKIP_GRADEBOOK !== '1') {
		const initialStartedAt = Date.now();
		const directInitialGradebook = await direct.gradebook();
		const appInitialGradebook = await appGet<{ xml: string }>(page, '/api/studentvue/gradebook');
		const directInitialParsed = parseGradebookXML(gradebookXml(directInitialGradebook));
		const appInitialParsed = parseGradebookXML(appInitialGradebook.xml);
		assertParity('gradebook/current', directInitialParsed, appInitialParsed, initialStartedAt);

		for (const period of directInitialGradebook.reportingPeriods) {
			const startedAt = Date.now();
			const directGradebook = parseGradebookXML(gradebookXml(await direct.gradebook(period.index)));
			const appGradebook = await appGet<{ xml: string }>(
				page,
				`/api/studentvue/gradebook?reportPeriod=${period.index}`
			);
			assertParity(
				`gradebook/reporting-period-${period.index}`,
				directGradebook,
				parseGradebookXML(appGradebook.xml),
				startedAt
			);
		}
	}

	for (const [resource, directLoader] of [
		['attendance-details', () => direct.attendanceDetails()],
		['student-profile', () => direct.studentInfo()],
		['schedule', () => direct.schedule()],
		['school-info', () => direct.schoolInfo()]
	] as const) {
		const startedAt = Date.now();
		const [directValue, appValue] = await Promise.all([
			directLoader(),
			appGet(page, `/api/studentvue/${resource}`)
		]);
		assertParity(resource, directValue, appValue, startedAt);
	}

	const reportCardsStartedAt = Date.now();
	const [directReportCards, appReportCards] = await Promise.all([
		direct.reportCards(),
		appGet<{ grades: unknown; documents: Array<JsonRecord> }>(page, '/api/studentvue/report-cards')
	]);
	const stableReportCards = (reportCards: { grades: unknown; documents: Array<JsonRecord> }) => ({
		grades: reportCards.grades,
		documents: reportCards.documents.map(({ id: _sessionScopedId, ...document }) => document)
	});
	assertParity(
		'report-cards',
		stableReportCards(directReportCards as { grades: unknown; documents: Array<JsonRecord> }),
		stableReportCards(appReportCards),
		reportCardsStartedAt
	);

	const calendarStartedAt = Date.now();
	const [directCalendar, appCalendar] = await Promise.all([
		direct.calendar(),
		appGet<{ events: Array<JsonRecord> }>(page, '/api/studentvue/calendar')
	]);
	const stableCalendar = (calendar: { events: Array<JsonRecord> } & JsonRecord) => ({
		...calendar,
		events: calendar.events.map(({ id: _sessionScopedId, ...event }) => event)
	});
	assertParity(
		'calendar',
		stableCalendar(directCalendar as { events: Array<JsonRecord> } & JsonRecord),
		stableCalendar(appCalendar as { events: Array<JsonRecord> } & JsonRecord),
		calendarStartedAt
	);

	if (process.env.PARITY_SKIP_DOCUMENTS !== '1') {
		const documentsStartedAt = Date.now();
		const [directDocuments, appDocuments] = await Promise.all([
			direct.documents(),
			appGet<{
				StudentDocumentDatas: {
					StudentDocumentData: Array<{
						_DocumentGU: string;
						_DocumentFileName: string;
						_DocumentDate: string;
						_DocumentType: string;
					}>;
				};
			}>(page, '/api/studentvue/documents')
		]);
		const normalizedAppDocuments = appDocuments.StudentDocumentDatas.StudentDocumentData.map(
			(item) => ({
				id: item._DocumentGU,
				title: item._DocumentFileName,
				date: item._DocumentDate,
				category: item._DocumentType
			})
		);
		assertParity(
			'documents/index',
			directDocuments.map(({ id: _sessionScopedId, ...document }) => document),
			normalizedAppDocuments.map(({ id: _sessionScopedId, ...document }) => document),
			documentsStartedAt
		);

		for (const [index, document] of directDocuments.entries()) {
			const appDocument = normalizedAppDocuments[index];
			if (!appDocument) throw new Error(`Grademaxxing is missing document ${index + 1}.`);
			const startedAt = Date.now();
			const [directFile, appFile] = await Promise.all([
				direct.document(document.id),
				appGet<{ Base64Code: string; _DocType: string; _FileName: string }>(
					page,
					`/api/studentvue/document?id=${encodeURIComponent(appDocument.id)}`
				)
			]);
			assertParity(
				`documents/file-${index + 1}`,
				documentSignature(directFile),
				{ hash: hash(appFile.Base64Code), mimeType: appFile._DocType, fileName: appFile._FileName },
				startedAt
			);
		}
	}

	const mailboxStartedAt = Date.now();
	const [directMailbox, appMailbox] = await Promise.all([
		direct.mailbox(),
		appGet<{ folders: JsonRecord[]; messages: JsonRecord[] }>(page, '/api/studentvue/mailbox')
	]);
	const mailboxSignature = (mailbox: { folders: JsonRecord[]; messages: JsonRecord[] }) => ({
		folders: mailbox.folders.map((folder) => ({
			id: folder.folderId ?? null,
			type: folder.folderType,
			name: folder.name
		})),
		messages: mailbox.messages.map((message) => ({
			id: messageId(message),
			folderId: message.portalFolderId ?? null,
			folderType: message.portalFolderType,
			subject: message.subject,
			sendDateTime: message.sendDateTime,
			isSystemMessage: Boolean(message.isSystemMessage)
		}))
	});
	assertParity(
		'mailbox/index',
		mailboxSignature(directMailbox as { folders: JsonRecord[]; messages: JsonRecord[] }),
		mailboxSignature(appMailbox),
		mailboxStartedAt
	);

	const inbox = await direct.messages();
	const stableMessageDetail = (detail: JsonRecord) => {
		const { translationError: _volatilePortalDiagnostic, ...stable } = detail;
		return stable;
	};
	for (const [index, message] of inbox.entries()) {
		const id = messageId(message);
		if (!id) throw new Error(`StudentVUE message ${index + 1} has no stable identifier.`);
		const isSystemMessage = Boolean(message.isSystemMessage);
		const startedAt = Date.now();
		const [directDetail, appDetail] = await Promise.all([
			direct.messageDetails(id, isSystemMessage),
			appGet<JsonRecord>(
				page,
				`/api/studentvue/message?id=${encodeURIComponent(id)}&system=${isSystemMessage}`
			)
		]);
		assertParity(
			`messages/detail-${index + 1}`,
			stableMessageDetail(directDetail),
			stableMessageDetail(appDetail),
			startedAt
		);

		const ids = [...new Set(attachmentIds(directDetail))];
		for (const [attachmentIndex, attachmentId] of ids.entries()) {
			const attachmentStartedAt = Date.now();
			const directFile = await retry(() => direct.attachment(attachmentId));
			const appFile = await retry(() =>
				appGet<{ Base64Code: string; _MimeType: string; _DocumentName: string }>(
					page,
					`/api/studentvue/attachment?id=${encodeURIComponent(attachmentId)}`
				)
			);
			assertParity(
				`messages/detail-${index + 1}/attachment-${attachmentIndex + 1}`,
				documentSignature(directFile),
				{
					hash: hash(appFile.Base64Code),
					mimeType: appFile._MimeType,
					fileName: appFile._DocumentName
				},
				attachmentStartedAt
			);
		}
	}

	console.log('StudentVUE parity audit passed.');
	console.log(`PASS total checks: ${results.length}`);
} finally {
	await context.close();
	await browser.close();
}
