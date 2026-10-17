import type { MaxReportReason } from '$lib/contracts/max-diagnostics';
import { reportMaxDiagnostic } from '$lib/server/max/diagnostics';
import {
	clientSessionHeader,
	getStudentSession,
	requireStudentSessionContext,
	sessionCookie
} from '$lib/server/student-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = { maxDiagnostics: true };

export const POST: RequestHandler = async ({ request, cookies, platform }) => {
	try {
		requireStudentSessionContext(
			getStudentSession(cookies.get(sessionCookie)),
			request.headers.get(clientSessionHeader)
		);
	} catch {
		return json({ error: 'Sign in before reporting a reply.' }, { status: 401 });
	}
	let input: { id?: unknown; receipt?: unknown; reason?: unknown };
	try {
		input = await request.json();
	} catch {
		return json({ error: 'Invalid report.' }, { status: 400 });
	}
	if (
		!input ||
		typeof input.id !== 'string' ||
		!/^[a-f0-9-]{36}$/i.test(input.id) ||
		typeof input.receipt !== 'string' ||
		!/^[\w-]{43}$/.test(input.receipt) ||
		!['empty', 'incorrect', 'unhelpful', 'formatting'].includes(String(input.reason))
	)
		return json({ error: 'Invalid report.' }, { status: 400 });
	try {
		const saved = await reportMaxDiagnostic(
			platform,
			input.id,
			input.receipt,
			input.reason as MaxReportReason
		);
		if (saved === undefined) return json({ error: 'Reporting is unavailable.' }, { status: 503 });
		if (!saved) return json({ error: 'This report link is expired or invalid.' }, { status: 404 });
		return new Response(null, { status: 204 });
	} catch {
		return json({ error: 'Reporting is unavailable.' }, { status: 503 });
	}
};
