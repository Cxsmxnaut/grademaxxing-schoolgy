import { getSchoologyConnectorOptions, getSchoologyDistrict } from '$lib/server/schoology-config';
import { createSchoologyDemoGradebook } from '$lib/server/schoology-demo';
import { getSchoologyCookie, readSchoologySession } from '$lib/server/schoology-session';
import { error, redirect } from '@sveltejs/kit';
import {
	SchoologyClient,
	SchoologyError,
	type RawRecord
} from '../../../packages/schoology-connector/dist/index.js';
import type { PageServerLoad } from './$types';

const safeFailure = (cause: unknown) => {
	if (cause instanceof SchoologyError && cause.code === 'AUTH')
		return 'Schoology authorization expired. Reconnect to continue.';
	if (cause instanceof SchoologyError && cause.code === 'PERMISSION')
		return 'This Schoology account does not have permission to read this information.';
	if (cause instanceof SchoologyError && cause.code === 'RATE_LIMIT')
		return 'Schoology is limiting requests. Try again in a little while.';
	return 'Schoology did not return this information. Try again later.';
};

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
	setHeaders({ 'cache-control': 'private, no-store' });
	const session = await readSchoologySession(getSchoologyCookie(cookies));
	if (!session || session.kind === 'pending') redirect(303, '/schoology/login');
	const district = session.kind === 'demo' ? null : getSchoologyDistrict(session.districtId);
	if (session.kind === 'oauth' && !district)
		error(503, 'The configured Schoology district is no longer available.');
	const view = url.searchParams.get('view') ?? 'grades';
	if (!['grades', 'calendar', 'documents', 'mail', 'profile', 'attendance'].includes(view))
		error(404, 'Schoology page not found.');
	try {
		const gradebook =
			session.kind === 'demo'
				? await createSchoologyDemoGradebook()
				: await new SchoologyClient(
						getSchoologyConnectorOptions(district!, session.token)
					).getGradebook();
		const extras: {
			events?: RawRecord[];
			calendarAvailable?: boolean;
			calendarError?: string;
			documents?: { id: string; title: string; course: string; published: boolean }[];
			documentsAvailable?: boolean;
			documentsError?: string;
			messages?: RawRecord[];
			selectedMessage?: RawRecord | null;
			mailAvailable?: boolean;
			mailError?: string;
		} = {};
		if (view === 'calendar' && session.kind === 'oauth') {
			try {
				const startDate = new Date();
				startDate.setUTCDate(startDate.getUTCDate() - 30);
				const endDate = new Date();
				endDate.setUTCDate(endDate.getUTCDate() + 180);
				const events = await new SchoologyClient(
					getSchoologyConnectorOptions(district!, session.token)
				).getEvents(gradebook.user.id, {
					start_date: startDate.toISOString().slice(0, 10),
					end_date: endDate.toISOString().slice(0, 10),
					limit: 100
				});
				extras.events = events.map((item) => ({
					id: String(item.id ?? ''),
					title: String(item.title ?? 'Untitled event'),
					start: String(item.start ?? ''),
					all_day: item.all_day
				}));
				extras.calendarAvailable = true;
			} catch (cause) {
				extras.calendarAvailable = false;
				extras.calendarError = safeFailure(cause);
			}
		}
		if (view === 'calendar' && session.kind === 'demo') {
			extras.events = [
				{
					id: 'demo-event-1',
					title: 'Algebra II · Review quiz',
					start: '2026-10-21 15:30:00',
					all_day: 0
				},
				{
					id: 'demo-event-2',
					title: 'Biology · Cell lab report',
					start: '2026-10-23 23:59:00',
					all_day: 1
				}
			];
			extras.calendarAvailable = true;
		}
		if (view === 'documents' && session.kind === 'oauth') {
			try {
				const client = new SchoologyClient(getSchoologyConnectorOptions(district!, session.token));
				const courseDocuments = await Promise.all(
					gradebook.courses.map(async (course) => ({
						course: course.title,
						items: await client.getDocuments(course.id, { limit: 100 })
					}))
				);
				extras.documents = courseDocuments.flatMap((entry) =>
					entry.items.map((item) => ({
						id: String(item.id ?? ''),
						title: String(item.title ?? 'Untitled course document'),
						course: entry.course,
						published: item.published !== 0 && item.published !== '0'
					}))
				);
				extras.documentsAvailable = true;
			} catch (cause) {
				extras.documentsAvailable = false;
				extras.documentsError = safeFailure(cause);
			}
		}
		if (view === 'documents' && session.kind === 'demo') {
			extras.documents = [
				{ id: 'demo-doc-1', title: 'Course outline', course: 'Algebra II', published: true },
				{ id: 'demo-doc-2', title: 'Lab safety guide', course: 'Biology', published: true }
			];
			extras.documentsAvailable = true;
		}
		if (view === 'mail' && session.kind === 'oauth') {
			try {
				const client = new SchoologyClient(getSchoologyConnectorOptions(district!, session.token));
				const messages = await client.getInbox({ limit: 100 });
				extras.messages = messages.map((item) => ({
					id: String(item.id ?? ''),
					subject: String(item.subject ?? 'No subject'),
					last_updated: item.last_updated,
					message: typeof item.message === 'string' ? item.message.slice(0, 300) : ''
				}));
				const messageId = url.searchParams.get('message');
				if (messageId && messages.some((item) => String(item.id) === messageId)) {
					const message = await client.getInboxMessage(messageId);
					extras.selectedMessage = {
						id: String(message.id ?? messageId),
						subject: String(message.subject ?? 'No subject'),
						last_updated: message.last_updated,
						message: typeof message.message === 'string' ? message.message.slice(0, 12_000) : ''
					};
				}
				extras.mailAvailable = true;
			} catch (cause) {
				extras.mailAvailable = false;
				extras.mailError = safeFailure(cause);
			}
		}
		if (view === 'mail' && session.kind === 'demo') {
			extras.messages = [
				{
					id: 'demo-message-1',
					subject: 'Welcome to the course',
					from: 'Teacher Example',
					body: 'This fictional message demonstrates the Schoology inbox view.'
				},
				{
					id: 'demo-message-2',
					subject: 'Review materials posted',
					from: 'Teacher Example',
					body: 'The practice guide is available in the fictional course documents.'
				}
			];
			const messageId = url.searchParams.get('message');
			extras.selectedMessage =
				extras.messages.find((item) => String(item.id) === messageId) ?? null;
			extras.mailAvailable = true;
		}
		return {
			view,
			demo: session.kind === 'demo',
			districtName: district?.name ?? 'Fictional demo district',
			gradebook,
			capabilities: {
				grades: true,
				profile: true,
				calendar: session.kind === 'demo' ? false : (extras.calendarAvailable ?? null),
				documents: session.kind === 'demo' ? false : (extras.documentsAvailable ?? null),
				mail: session.kind === 'demo' ? false : (extras.mailAvailable ?? null),
				attendance: false
			},
			...extras
		};
	} catch (cause) {
		return {
			view,
			demo: session.kind === 'demo',
			districtName: district?.name ?? 'Fictional demo district',
			gradebook: null,
			capabilities: {
				grades: false,
				profile: false,
				calendar: false,
				documents: false,
				mail: false,
				attendance: false
			},
			providerError: safeFailure(cause)
		};
	}
};
