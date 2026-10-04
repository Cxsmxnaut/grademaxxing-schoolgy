import { dev } from '$app/environment';
import { recordStudentVueUpstreamFailure } from '$lib/server/analytics/usage';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import { Pxp2InputError, Pxp2SessionExpiredError, Pxp2TimeoutError } from '$lib/server/pxp2';
import { RequestTiming, timingRequestHeader } from '$lib/server/request-timing';
import {
	clientSessionHeader,
	getStudentSession,
	requireStudentSessionContext,
	runStudentOperation,
	serializeStudentSession,
	sessionCookie,
	sessionMaxAge,
	StudentOperationAbortedError,
	StudentServiceBusyError,
	StudentSessionBusyError
} from '$lib/server/student-session';
import { adaptAttendance, adaptStudentInfo } from '$lib/server/studentvue-adapters';
import { adaptDocuments, adaptMessages } from '$lib/server/studentvue-api/legacy-adapters';
import { optionalInteger } from '$lib/server/studentvue-api/params';
import { capabilities, resources, type Resource } from '$lib/server/studentvue-api/resources';
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, cookies, request, url, platform, locals }) => {
	if (!resources.includes(params.resource as Resource))
		throw error(404, 'Unknown StudentVUE API resource.');
	let session: ReturnType<typeof getStudentSession>;
	const wantsTiming = request.headers.get(timingRequestHeader) === 'true';
	let timing: RequestTiming | undefined;
	const sessionStartedAt = wantsTiming ? performance.now() : 0;
	try {
		session = getStudentSession(
			cookies.get(sessionCookie),
			wantsTiming ? (span) => timing?.record(span) : undefined
		);
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
	} catch (cause) {
		throw error(401, cause instanceof Error ? cause.message : 'Sign in to StudentVUE first.');
	}
	if (wantsTiming) {
		timing = new RequestTiming();
		timing.record({ name: 'session_decode', durationMs: performance.now() - sessionStartedAt });
		locals.requestTiming = timing;
	}
	const respond: typeof json = (data, init) =>
		timing ? timing.measureSync('response_encode', () => json(data, init)) : json(data, init);
	const finishQueue = timing?.start('queue');
	try {
		const response = await runStudentOperation(
			session,
			async () => {
				finishQueue?.();
				switch (params.resource as Resource) {
					case 'capabilities':
						return respond(capabilities);
					case 'gradebook': {
						const reportPeriod = optionalInteger(
							url.searchParams.get('reportPeriod'),
							0,
							999,
							'reportPeriod'
						);
						const fresh = url.searchParams.get('fresh') === 'true';
						const summary = !fresh && url.searchParams.get('summary') === 'true';
						const gradebook = await session.client.gradebook(reportPeriod, summary, fresh);
						return respond({
							xml: timing
								? timing.measureSync('gradebook_xml', () => gradebookXml(gradebook))
								: gradebookXml(gradebook),
							detailed: gradebook.detailed !== false
						});
					}
					case 'attendance':
						return respond(adaptAttendance(await session.client.attendanceDetails()));
					case 'attendance-details':
						return respond(await session.client.attendanceDetails());
					case 'calendar': {
						const month = optionalInteger(url.searchParams.get('month'), 1, 12, 'month');
						const year = optionalInteger(url.searchParams.get('year'), 2000, 2200, 'year');
						if ((month === undefined) !== (year === undefined))
							throw error(400, 'month and year must be supplied together.');
						return respond(await session.client.calendar(month, year));
					}
					case 'student-info':
						return respond(adaptStudentInfo(await session.client.studentInfo()));
					case 'student-profile':
						return respond(await session.client.studentInfo());
					case 'documents':
						return respond(adaptDocuments(await session.client.documents()));
					case 'document': {
						const id = url.searchParams.get('id');
						if (!id) throw error(400, 'A document identifier is required.');
						const file = await session.client.document(id);
						return respond({
							Base64Code: file.base64,
							_DocumentGU: id,
							_FileName: file.fileName,
							_DocFileName: file.fileName,
							_DocType: file.mimeType
						});
					}
					case 'report-cards':
						return respond(await session.client.reportCards());
					case 'schedule':
						return respond(await session.client.schedule());
					case 'school-info':
						return respond(await session.client.schoolInfo());
					case 'messages':
						return respond(adaptMessages(await session.client.messages()));
					case 'mailbox':
						return respond(await session.client.mailbox());
					case 'message': {
						const id = url.searchParams.get('id');
						if (!id) throw error(400, 'A message identifier is required.');
						const detail = await session.client.messageDetails(
							id,
							url.searchParams.get('system') === 'true'
						);
						return respond(
							url.searchParams.get('legacy') === 'true'
								? adaptMessages([detail]).InboxItemListings.MessageXML[0]
								: detail
						);
					}
					case 'attachment': {
						const id = url.searchParams.get('id');
						if (!id) throw error(400, 'An attachment identifier is required.');
						const file = await session.client.attachment(id);
						return respond({
							Base64Code: file.base64,
							_SmAttachmentGU: id,
							_DocumentName: file.fileName,
							_MimeType: file.mimeType
						});
					}
				}
				throw error(404, 'Unknown StudentVUE API resource.');
			},
			request.signal
		);
		const token = timing
			? timing.measureSync('session_encode', () => serializeStudentSession(session))
			: serializeStudentSession(session);
		cookies.set(sessionCookie, token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: !dev,
			maxAge: sessionMaxAge
		});
		return response;
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		if (cause instanceof StudentOperationAbortedError) throw error(499, cause.message);
		if (cause instanceof StudentSessionBusyError) throw error(429, cause.message);
		if (cause instanceof StudentServiceBusyError) throw error(503, cause.message);
		if (cause instanceof Pxp2InputError) throw error(400, cause.message);
		if (cause instanceof Pxp2SessionExpiredError) {
			// Preserve the encrypted app identity long enough to offer a password-only
			// reconnect. It contains StudentVUE cookies, never the student's password.
			return respond(
				{
					code: 'UPSTREAM_SESSION_EXPIRED',
					message: 'Reconnect to StudentVUE to update your school data.'
				},
				{ status: 401 }
			);
		}
		if (cause instanceof Pxp2TimeoutError) {
			recordStudentVueUpstreamFailure(platform, params.resource, 'portal_timeout');
			throw error(504, cause.message);
		}
		recordStudentVueUpstreamFailure(platform, params.resource, 'portal_error');
		throw error(502, cause instanceof Error ? cause.message : 'StudentVUE request failed.');
	} finally {
		finishQueue?.();
	}
};
