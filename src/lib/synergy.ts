import type { AttachmentResult } from '$lib/types/Attachment';
import type { AttendanceResult } from '$lib/types/Attendance';
import type { DocumentsResult } from '$lib/types/Documents';
import type { MailResult } from '$lib/types/MailData';
import type { StudentInfoResult } from '$lib/types/StudentInfo';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { GradebookResult } from './types/Gradebook';
import type { ReportCardResult } from './types/ReportCard';

export const Operation = {
	Request: 'ProcessWebServiceRequest',
	RequestMultiWeb: 'ProcessWebServiceRequestMultiWeb'
} as const;

export type Operation = (typeof Operation)[keyof typeof Operation];

const alwaysArray = [
	'Gradebook.Courses.Course',
	'Gradebook.Courses.Course.Marks.Mark',
	'Gradebook.Courses.Course.Marks.Mark.Assignments.Assignment',
	'Gradebook.Courses.Course.Marks.Mark.Assignments.Assignment.Resources.Resource',
	'Gradebook.Courses.Course.Marks.Mark.GradeCalculationSummary.AssignmentGradeCalc',
	'Gradebook.ReportingPeriods.ReportPeriod',
	'Attendance.Absences.Absence'
];

const envelopeParser = new XMLParser({ ignoreDeclaration: true });

const resultParser = new XMLParser({
	ignoreAttributes: false,
	ignoreDeclaration: true,
	attributeNamePrefix: '_',
	isArray: (_name, jpath) => alwaysArray.includes(String(jpath)),
	attributeValueProcessor: (_name, value) =>
		value === 'true' ? true : value === 'false' ? false : value
});

/** For use only with output of xml parser; applies only to non-attributes */
function convertEmptyElementToNull<T>(obj: T): T {
	if (typeof obj !== 'object' || obj === null) return obj;

	if (Array.isArray(obj)) return obj.map(convertEmptyElementToNull) as T;

	const newObj: Record<string, unknown> = {};
	for (const [key, val] of Object.entries(obj)) {
		if (val === '' && !key.startsWith('_')) {
			newObj[key] = null;
		} else {
			newObj[key] = convertEmptyElementToNull(val);
		}
	}
	return newObj as T;
}

const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '_' });

export const unwrapEnvelope = (envelopeStr: string, operation: Operation): string =>
	envelopeParser.parse(envelopeStr)['soap:Envelope']['soap:Body'][`${operation}Response`][
		`${operation}Result`
	];

export const wrapEnvelope = (body: string, operation: Operation): string =>
	builder.build({
		'?xml': { _version: '1.0', _encoding: 'utf-8' },
		'soap:Envelope': {
			'_xmlns:soap': 'http://www.w3.org/2003/05/soap-envelope',
			'_xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
			'_xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
			'soap:Body': {
				[`${operation}Response`]: {
					_xmlns: 'http://edupoint.com/webservices/',
					[`${operation}Result`]: body
				}
			}
		}
	});

export function parseResult<T>(resultStr: string): T {
	const result = resultParser.parse(resultStr);

	if (result.RT_ERROR) throw new Error(result.RT_ERROR._ERROR_MESSAGE);

	return result;
}

export const parseGradebookXML = (resultStr: string) =>
	convertEmptyElementToNull(parseResult<GradebookResult>(resultStr).Gradebook);

export class StudentAccount {
	domain: string;
	userID: string;
	password: string;
	sessionId?: string;

	constructor(domain: string, userID: string, password: string, sessionId?: string) {
		this.domain = domain;
		this.userID = userID;
		this.password = password;
		this.sessionId = sessionId;
	}

	async checkLogin() {
		if (!this.password) {
			if (!this.sessionId)
				throw new Error('Your StudentVUE session has expired. Please sign in again.');
			const status = await this.request<{
				signedIn: boolean;
				username?: string;
				domain?: string;
			}>('/api/session/status');
			if (!status.signedIn)
				throw new Error('Your StudentVUE session has expired. Please sign in again.');
			if (
				status.username?.toLowerCase() !== this.userID.toLowerCase() ||
				status.domain?.toLowerCase() !== normalizedDomain(this.domain)
			)
				throw new Error(
					'This browser tab belongs to a different StudentVUE session. Sign in again.'
				);
			return;
		}
		const session = await apiRequest<{ username: string; domain: string; sessionId: string }>(
			'/api/session',
			{
				method: 'POST',
				body: JSON.stringify({
					domain: this.domain,
					username: this.userID,
					password: this.password
				})
			},
			false
		);
		this.userID = session.username;
		this.domain = session.domain;
		this.sessionId = session.sessionId;
		this.password = '';
	}

	async gradebookRequest(reportPeriod?: number) {
		const result = await this.request<{ xml: string }>(
			`/api/studentvue/gradebook${reportPeriod === undefined ? '' : `?reportPeriod=${reportPeriod}`}`
		);
		return new Response(wrapEnvelope(result.xml, Operation.Request));
	}

	async attendance() {
		return this.request<AttendanceResult['Attendance']>('/api/studentvue/attendance');
	}

	async studentInfo() {
		return this.request<StudentInfoResult['StudentInfo']>('/api/studentvue/student-info');
	}

	async documents() {
		return this.request<DocumentsResult['StudentDocuments']>('/api/studentvue/documents');
	}

	async reportCard(documentGU: string) {
		return this.request<ReportCardResult['DocumentData']>(
			`/api/studentvue/document?id=${encodeURIComponent(documentGU)}`
		);
	}

	async mailData() {
		return this.request<MailResult['SynergyMailDataXML']>('/api/studentvue/messages');
	}

	async calendar(month: number, year: number) {
		return this.request<{
			events: Array<{
				id: string;
				type: string;
				title: string;
				description: string;
				details: string;
				date: string;
				time: string;
			}>;
		}>(`/api/studentvue/calendar?month=${month}&year=${year}`);
	}

	async message(messagePersonGU: string, isSystemMessage = false) {
		return this.request<
			MailResult['SynergyMailDataXML']['InboxItemListings']['MessageXML'][number]
		>(
			`/api/studentvue/message?id=${encodeURIComponent(messagePersonGU)}&system=${isSystemMessage}&legacy=true`
		);
	}

	async attachment(attachmentGU: string) {
		return this.request<AttachmentResult['AttachmentXML']>(
			`/api/studentvue/attachment?id=${encodeURIComponent(attachmentGU)}`
		);
	}

	private request<T>(path: string) {
		if (!this.sessionId)
			return Promise.reject(
				new Error('Your StudentVUE session has expired. Please sign in again.')
			);
		return apiRequest<T>(
			path,
			{ headers: { 'X-Grademaxxing-Session': this.sessionId } },
			true,
			this.sessionId
		);
	}
}

export async function apiRequest<T>(
	path: string,
	init: RequestInit = {},
	redirectOnUnauthorized = true,
	expectedSessionId?: string
): Promise<T> {
	const method = (init.method ?? 'GET').toUpperCase();
	const retryableStatuses = new Set([429, 502, 503, 504]);
	const maximumRetries = method === 'GET' ? 2 : 0;
	for (let attempt = 0; ; attempt += 1) {
		let response: Response;
		try {
			response = await fetch(path, {
				...init,
				headers: {
					Accept: 'application/json',
					...(init.body ? { 'Content-Type': 'application/json' } : {}),
					...init.headers
				}
			});
		} catch (error) {
			if (attempt < maximumRetries) {
				await retryDelay(attempt);
				continue;
			}
			throw error;
		}

		if (response.ok) return response.json() as Promise<T>;
		const payload = (await response.json().catch(() => undefined)) as
			{ message?: string } | undefined;
		if (attempt < maximumRetries && retryableStatuses.has(response.status)) {
			await retryDelay(attempt, response.headers.get('retry-after'));
			continue;
		}
		if (redirectOnUnauthorized && response.status === 401 && typeof window !== 'undefined') {
			// A restarted deployment or expired server-side portal session invalidates every
			// cached client store at once. Use a full navigation so module-level Svelte state
			// cannot survive into the next authenticated account.
			if (!expectedSessionId || storedSessionId() === expectedSessionId)
				localStorage.removeItem('token');
			window.location.assign('/login?sessionExpired=true');
		}
		throw new Error(payload?.message ?? `StudentVUE API request failed (HTTP ${response.status}).`);
	}
}

function normalizedDomain(value: string) {
	try {
		return new URL(value.includes('://') ? value : `https://${value}`).host.toLowerCase();
	} catch {
		return value.trim().toLowerCase();
	}
}

function storedSessionId() {
	try {
		const value = JSON.parse(localStorage.getItem('token') ?? '') as { sessionId?: unknown };
		return typeof value.sessionId === 'string' ? value.sessionId : undefined;
	} catch {
		return undefined;
	}
}

const retryDelay = (attempt: number, retryAfter?: string | null) => {
	const fallback = attempt === 0 ? 250 : 750;
	let delay = fallback;
	if (retryAfter) {
		const seconds = Number(retryAfter);
		const dateDelay = Date.parse(retryAfter) - Date.now();
		const requested = Number.isFinite(seconds) ? seconds * 1000 : dateDelay;
		if (Number.isFinite(requested) && requested >= 0) delay = Math.min(5_000, requested);
	}
	return new Promise<void>((resolve) => setTimeout(resolve, delay));
};
