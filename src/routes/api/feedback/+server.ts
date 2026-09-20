import { releaseVersion } from '$lib/brand';
import { createFeedback, feedbackKinds, type FeedbackKind } from '$lib/server/feedback';
import { getStudentSession, sessionCookie } from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_MESSAGE_LENGTH = 2_000;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMISSIONS = 10;
const submissions = new Map<string, { count: number; resetAt: number }>();

export const POST: RequestHandler = async ({ request, cookies, platform, getClientAddress }) => {
	try {
		getStudentSession(cookies.get(sessionCookie));
	} catch {
		return json({ message: 'Sign in before sending feedback.' }, { status: 401 });
	}

	const address = safeClientAddress(getClientAddress);
	const current = submissions.get(address);
	if (current && current.resetAt > Date.now() && current.count >= MAX_SUBMISSIONS)
		return json(
			{ message: 'You have sent several reports already. Please try again later.' },
			{
				status: 429,
				headers: { 'Retry-After': String(Math.ceil((current.resetAt - Date.now()) / 1000)) }
			}
		);

	let input: { kind?: unknown; message?: unknown; pagePath?: unknown };
	try {
		input = (await request.json()) as typeof input;
	} catch {
		return json({ message: 'Invalid feedback.' }, { status: 400 });
	}
	const message = typeof input.message === 'string' ? input.message.trim() : '';
	const kind = input.kind;
	const pagePath = sanitizePagePath(input.pagePath);
	if (!feedbackKinds.includes(kind as FeedbackKind) || message.length < 3)
		return json(
			{ message: 'Choose a feedback type and write at least three characters.' },
			{ status: 400 }
		);
	if (message.length > MAX_MESSAGE_LENGTH)
		return json(
			{ message: `Keep feedback under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.` },
			{ status: 400 }
		);

	const result = await createFeedback(platform, {
		kind: kind as FeedbackKind,
		message,
		pagePath,
		appVersion: releaseVersion
	});
	if (!result) return json({ message: 'Feedback storage is not configured.' }, { status: 503 });
	recordSubmission(address);
	return json(result, { status: 201 });
};

function sanitizePagePath(value: unknown) {
	if (typeof value !== 'string' || !value.startsWith('/') || value.length > 200) return '/feedback';
	return value.replace(/[\r\n]/g, '');
}

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}

function recordSubmission(address: string) {
	const now = Date.now();
	const current = submissions.get(address);
	submissions.set(
		address,
		current && current.resetAt > now
			? { ...current, count: current.count + 1 }
			: { count: 1, resetAt: now + WINDOW_MS }
	);
}
