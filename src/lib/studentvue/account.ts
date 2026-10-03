import type { AttachmentResult } from '$lib/contracts/studentvue/attachment';
import type { AttendanceResult } from '$lib/contracts/studentvue/attendance';
import type { DocumentsResult } from '$lib/contracts/studentvue/documents';
import type { MailResult } from '$lib/contracts/studentvue/mail';
import type { ReportCardResult } from '$lib/contracts/studentvue/report-card';
import type { Schedule } from '$lib/contracts/studentvue/schedule';
import type { SchoolInfo } from '$lib/contracts/studentvue/school-info';
import type {
	StudentInfoResult,
	StudentProfileResult
} from '$lib/contracts/studentvue/student-info';
import type { TranscriptImport } from '$lib/grades/transcript';
import {
	beginSessionRecovery,
	finishSessionRecovery,
	getSessionRecoverySignal,
	isSessionRecoveryCurrent,
	markPortalConnected,
	markPortalReconnect,
	markSessionRecoveryRefreshing
} from '$lib/session.svelte';
import {
	apiRequest,
	normalizedDomain,
	serializedStudentVueRequest,
	StudentVueAppSessionInvalidError,
	StudentVueAuthenticationError,
	StudentVueSessionExpiredError
} from './api';
import {
	isActiveSessionRecoveryAccount,
	refreshGradesAfterSessionRestore
} from './session-recovery';
import { Operation, wrapEnvelope } from './xml';

export class StudentAccount {
	domain: string;
	userID: string;
	password: string;
	sessionId?: string;
	private silentReconnectPromise?: Promise<boolean>;
	private pendingSessionRecovery?: number;
	private sessionRecoveryPromise?: Promise<void>;

	constructor(domain: string, userID: string, password: string, sessionId?: string) {
		this.domain = domain;
		this.userID = userID;
		this.password = password;
		this.sessionId = sessionId;
	}

	async checkLogin(signal?: AbortSignal) {
		if (!this.password) {
			if (!this.sessionId)
				throw new StudentVueAppSessionInvalidError(
					'Your StudentVUE session has expired. Please sign in again.'
				);
			const status = await this.request<{
				signedIn: boolean;
				username?: string;
				domain?: string;
			}>('/api/session/status', { signal });
			if (!status.signedIn)
				throw new StudentVueAppSessionInvalidError(
					'Your StudentVUE session has expired. Please sign in again.'
				);
			if (
				status.username?.toLowerCase() !== this.userID.toLowerCase() ||
				status.domain?.toLowerCase() !== normalizedDomain(this.domain)
			)
				throw new StudentVueAppSessionInvalidError(
					'This browser tab belongs to a different StudentVUE session. Sign in again.'
				);
			return;
		}
		const session = await apiRequest<{ username: string; domain: string; sessionId: string }>(
			'/api/session',
			{
				method: 'POST',
				signal,
				body: JSON.stringify({
					domain: this.domain,
					username: this.userID,
					password: this.password
				})
			},
			false
		);
		signal?.throwIfAborted();
		this.userID = session.username;
		this.domain = session.domain;
		this.sessionId = session.sessionId;
		this.password = '';
	}

	async keepAlive() {
		const result = await this.request<{ signedIn: true; updatedAt: number }>(
			'/api/session/keepalive'
		);
		if (this.sessionId && this.ownsStoredSession(this.sessionId))
			markPortalConnected(result.updatedAt);
		return result;
	}

	async gradebookRequest(reportPeriod?: number, summary = false, fresh = false) {
		const parameters = new URLSearchParams();
		if (reportPeriod !== undefined) parameters.set('reportPeriod', String(reportPeriod));
		if (fresh) parameters.set('fresh', 'true');
		else if (summary) parameters.set('summary', 'true');
		const result = await this.request<{ xml: string; detailed: boolean }>(
			`/api/studentvue/gradebook${parameters.size ? `?${parameters}` : ''}`,
			{ cache: 'no-store' }
		);
		return new Response(wrapEnvelope(result.xml, Operation.Request), {
			headers: { 'X-Grademaxxing-Gradebook-Detail': String(result.detailed) }
		});
	}

	async attendance() {
		return this.request<AttendanceResult['Attendance']>('/api/studentvue/attendance');
	}

	async schedule() {
		return this.request<Schedule>('/api/studentvue/schedule');
	}

	async studentInfo() {
		return this.request<StudentInfoResult['StudentInfo']>('/api/studentvue/student-info');
	}

	async studentProfile() {
		return this.request<StudentProfileResult>('/api/studentvue/student-profile');
	}

	async schoolInfo() {
		return this.request<SchoolInfo>('/api/studentvue/school-info');
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

	private async request<T>(path: string, init: RequestInit = {}) {
		if (!this.sessionId)
			return Promise.reject(
				new Error('Your StudentVUE session has expired. Please sign in again.')
			);
		const initialSessionId = this.sessionId;
		try {
			return await serializedStudentVueRequest(initialSessionId, async () => {
				const requestWithCurrentSession = () => {
					const sessionId = this.sessionId;
					if (!sessionId)
						return Promise.reject(
							new Error('Your StudentVUE session has expired. Please sign in again.')
						);
					const operation = () =>
						apiRequest<T>(
							path,
							{
								...init,
								headers: { 'X-Grademaxxing-Session': sessionId, ...init.headers }
							},
							true
						);
					// A queued operation may still hold the retired session's lock after
					// vault renewal. Join the current session queue before touching focus.
					return sessionId === initialSessionId
						? operation()
						: serializedStudentVueRequest(sessionId, operation);
				};

				try {
					return await requestWithCurrentSession();
				} catch (cause) {
					if (
						!(cause instanceof StudentVueSessionExpiredError) &&
						!(cause instanceof StudentVueAppSessionInvalidError)
					)
						throw cause;
					// The freshly authenticated session must not recursively restore itself
					// if the recovery grade request also fails with an expired-session error.
					if (this.sessionRecoveryPromise) throw cause;
					const reconnected = await this.silentlyReconnect(initialSessionId).catch(() => false);
					if (!reconnected) {
						// Do not show the reconnect banner until the device-vault recovery has
						// actually failed. The first 401 is expected during silent recovery.
						if (typeof window !== 'undefined' && this.ownsStoredSession(initialSessionId)) {
							if (cause instanceof StudentVueAppSessionInvalidError)
								this.returnToLoginAfterInvalidSession(initialSessionId);
							else markPortalReconnect(cause.message);
						}
						throw cause;
					}
					return requestWithCurrentSession();
				}
			});
		} finally {
			// Release the old session's Web Lock before issuing the recovery grade read.
			await this.refreshRecoveredSessionGrades();
		}
	}

	private returnToLoginAfterInvalidSession(failedSessionId: string) {
		if (!this.ownsStoredSession(failedSessionId)) return;
		try {
			const token = JSON.parse(window.localStorage.getItem('token') ?? 'null') as {
				sessionId?: unknown;
			} | null;
			// Another tab/account may have replaced the failed session while we waited.
			if (token?.sessionId && token.sessionId !== failedSessionId) return;
			window.localStorage.removeItem('token');
		} catch {
			// Managed storage can be unavailable; the unusable session still needs sign-in.
		}
		window.location.assign('/login?sessionExpired=true');
	}

	private ownsStoredSession(expectedSessionId: string) {
		if (!isActiveSessionRecoveryAccount(this)) return false;
		try {
			const token = JSON.parse(window.localStorage.getItem('token') ?? 'null') as {
				sessionId?: unknown;
			} | null;
			return token?.sessionId === expectedSessionId;
		} catch {
			// If storage becomes blocked after boot, keep using the known in-memory
			// account. An explicit clear or replacement above still cancels recovery.
			return true;
		}
	}

	private async refreshRecoveredSessionGrades() {
		const recovery = this.pendingSessionRecovery;
		if (recovery === undefined) return;
		// Consume the ticket before the nested grade request; it must not await itself.
		this.pendingSessionRecovery = undefined;
		if (!isSessionRecoveryCurrent(recovery) || !isActiveSessionRecoveryAccount(this)) {
			finishSessionRecovery(recovery);
			return;
		}
		markSessionRecoveryRefreshing(recovery);
		const completion = (async () => {
			try {
				const refreshed = await refreshGradesAfterSessionRestore(this);
				if (refreshed && isSessionRecoveryCurrent(recovery) && isActiveSessionRecoveryAccount(this))
					markPortalConnected();
			} catch {
				// Authentication succeeded. A grades outage keeps the renewed session
				// and the catalog's retryable error instead of requesting a password.
			} finally {
				finishSessionRecovery(recovery);
			}
		})();
		this.sessionRecoveryPromise = completion;
		try {
			await completion;
		} finally {
			if (this.sessionRecoveryPromise === completion) this.sessionRecoveryPromise = undefined;
		}
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
		if (typeof window === 'undefined' || !this.ownsStoredSession(failedSessionId)) return false;
		const { clearStoredCredentials, loadStoredCredentials } =
			await import('$lib/auth/credential-vault');
		const stored = await loadStoredCredentials();
		if (
			!this.ownsStoredSession(failedSessionId) ||
			!stored ||
			stored.username.toLowerCase() !== this.userID.toLowerCase() ||
			normalizedDomain(stored.domain) !== normalizedDomain(this.domain)
		)
			return false;

		const recovery = beginSessionRecovery();
		let session: { username: string; domain: string; sessionId: string };
		try {
			session = await apiRequest<{ username: string; domain: string; sessionId: string }>(
				'/api/session',
				{
					method: 'POST',
					signal: getSessionRecoverySignal(recovery),
					body: JSON.stringify({
						domain: stored.domain,
						username: stored.username,
						password: stored.password
					})
				},
				false
			);
		} catch (cause) {
			if (
				cause instanceof StudentVueAuthenticationError &&
				this.ownsStoredSession(failedSessionId) &&
				isSessionRecoveryCurrent(recovery)
			)
				await clearStoredCredentials(
					() => this.ownsStoredSession(failedSessionId) && isSessionRecoveryCurrent(recovery)
				).catch(() => undefined);
			finishSessionRecovery(recovery);
			throw cause;
		}
		if (!this.ownsStoredSession(failedSessionId) || !isSessionRecoveryCurrent(recovery)) {
			finishSessionRecovery(recovery);
			return false;
		}
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
		this.pendingSessionRecovery = recovery;
		return true;
	}
}
