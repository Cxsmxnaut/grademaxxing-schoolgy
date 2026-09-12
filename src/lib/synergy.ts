import type { AttachmentResult } from '$lib/types/Attachment';
import type { AttendanceResult } from '$lib/types/Attendance';
import type { DocumentsResult } from '$lib/types/Documents';
import type { MailResult } from '$lib/types/MailData';
import type { StudentInfoResult } from '$lib/types/StudentInfo';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { TranscriptImport } from './grades/transcript';
import { markPortalConnected, markPortalOffline, markPortalReconnect } from './session.svelte';
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
	private silentReconnectPromise?: Promise<boolean>;

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

	async keepAlive() {
		const result = await this.request<{ signedIn: true; updatedAt: number }>(
			'/api/session/keepalive'
		);
		markPortalConnected(result.updatedAt);
		return result;
	}

	async gradebookRequest(reportPeriod?: number, summary = false) {
		const parameters = new URLSearchParams();
		if (reportPeriod !== undefined) parameters.set('reportPeriod', String(reportPeriod));
		if (summary) parameters.set('summary', 'true');
		const result = await this.request<{ xml: string; detailed: boolean }>(
			`/api/studentvue/gradebook${parameters.size ? `?${parameters}` : ''}`
		);
		return new Response(wrapEnvelope(result.xml, Operation.Request), {
			headers: { 'X-Grademaxxing-Gradebook-Detail': String(result.detailed) }
		});
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

	async transcript() {
		return this.request<{ transcript: TranscriptImport }>('/api/studentvue/report-cards');
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

	private request<T>(path: string, init: RequestInit = {}) {
		if (!this.sessionId)
			return Promise.reject(
				new Error('Your StudentVUE session has expired. Please sign in again.')
			);
		const initialSessionId = this.sessionId;
		return serializedStudentVueRequest(initialSessionId, async () => {
			const requestWithCurrentSession = () => {
				const sessionId = this.sessionId;
				if (!sessionId)
					return Promise.reject(
						new Error('Your StudentVUE session has expired. Please sign in again.')
					);
				return apiRequest<T>(
					path,
					{
						...init,
						headers: { 'X-Grademaxxing-Session': sessionId, ...init.headers }
					},
					true,
					sessionId
				);
			};

			try {
				return await requestWithCurrentSession();
			} catch (cause) {
				if (!(cause instanceof StudentVueSessionExpiredError)) throw cause;
				const reconnected = await this.silentlyReconnect(initialSessionId).catch(() => false);
				if (!reconnected) {
					// Do not show the reconnect banner until the device-vault recovery has
					// actually failed. The first 401 is expected during silent recovery.
					if (typeof window !== 'undefined') markPortalReconnect(cause.message);
					throw cause;
				}
				return requestWithCurrentSession();
			}
		});
	}

	private silentlyReconnect(failedSessionId: string) {
		if (this.sessionId !== failedSessionId) return Promise.resolve(true);
		if (this.silentReconnectPromise) return this.silentReconnectPromise;
		this.silentReconnectPromise = this.performSilentReconnect(failedSessionId).finally(() => {
			this.silentReconnectPromise = undefined;
		});
		return this.silentReconnectPromise;
	}

	private async performSilentReconnect(failedSessionId: string) {
		if (typeof window === 'undefined') return false;
		const { loadStoredCredentials } = await import('./auth/credential-vault');
		const stored = await loadStoredCredentials();
		if (
			!stored ||
			stored.username.toLowerCase() !== this.userID.toLowerCase() ||
			normalizedDomain(stored.domain) !== normalizedDomain(this.domain)
		)
			return false;

		const session = await apiRequest<{ username: string; domain: string; sessionId: string }>(
			'/api/session',
			{
				method: 'POST',
				body: JSON.stringify({
					domain: stored.domain,
					username: stored.username,
					password: stored.password
				})
			},
			false
		);
		this.userID = session.username;
		this.domain = session.domain;
		this.sessionId = session.sessionId;
		try {
			const current = JSON.parse(window.localStorage.getItem('token') ?? '') as {
				username?: unknown;
				domain?: unknown;
				sessionId?: unknown;
			};
			if (current.sessionId === failedSessionId)
				window.localStorage.setItem(
					'token',
					JSON.stringify({
						username: this.userID,
						domain: this.domain,
						sessionId: this.sessionId
					})
				);
		} catch {
			// The active account can still use the replacement session when storage is unavailable.
		}
		markPortalConnected();
		return true;
	}
}

export class StudentVueSessionExpiredError extends Error {
	readonly code = 'UPSTREAM_SESSION_EXPIRED';
}

const localSessionRequestTails = new Map<string, Promise<void>>();

function serializedStudentVueRequest<T>(sessionId: string, operation: () => Promise<T>) {
	// StudentVUE mutates server-side focus while loading gradebook details. A Web Lock
	// keeps requests ordered across tabs and prevents an older encrypted session response
	// from overwriting a newer one. The promise queue covers browsers without Web Locks.
	if (typeof navigator !== 'undefined' && navigator.locks) {
		return navigator.locks.request(`grademaxxing-studentvue-${sessionId}`, operation);
	}
	const previous = localSessionRequestTails.get(sessionId) ?? Promise.resolve();
	const result = previous.catch(() => undefined).then(operation);
	const tail = result.then(
		() => undefined,
		() => undefined
	);
	localSessionRequestTails.set(sessionId, tail);
	void tail.finally(() => {
		if (localSessionRequestTails.get(sessionId) === tail)
			localSessionRequestTails.delete(sessionId);
	});
	return result;
}

export async function apiRequest<T>(
	path: string,
	init: RequestInit = {},
	redirectOnUnauthorized = true,
	expectedSessionId?: string
): Promise<T> {
	const method = (init.method ?? 'GET').toUpperCase();
	// A Worker/platform 500 is sometimes transient during a cold start or a
	// short-lived upstream failure. Safe read requests may retry it; mutations
	// (including sign-in) never do.
	const retryableStatuses = new Set([429, 500, 502, 503, 504]);
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
			{ message?: string; code?: string } | undefined;
		if (attempt < maximumRetries && retryableStatuses.has(response.status)) {
			await retryDelay(attempt, response.headers.get('retry-after'));
			continue;
		}
		if (
			redirectOnUnauthorized &&
			response.status === 401 &&
			payload?.code === 'UPSTREAM_SESSION_EXPIRED'
		) {
			throw new StudentVueSessionExpiredError(
				payload.message ?? 'Reconnect to StudentVUE to update your school data.'
			);
		}
		if (
			redirectOnUnauthorized &&
			response.status === 401 &&
			payload?.code === 'APP_SESSION_INVALID' &&
			typeof window !== 'undefined'
		) {
			// An expired or invalid portal session must clear every cached client store. Use a
			// full navigation so module-level Svelte state cannot survive into the next account.
			if (!expectedSessionId || storedSessionId() === expectedSessionId)
				localStorage.removeItem('token');
			window.location.assign('/login?sessionExpired=true');
		}
		// Unknown 401s must not erase local data. Only the explicit app-session code above
		// proves this browser cannot resume; portal outages and proxy failures can otherwise
		// look deceptively similar.
		if (response.status === 0 || response.status >= 500 || response.status === 401)
			markPortalOffline();
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
