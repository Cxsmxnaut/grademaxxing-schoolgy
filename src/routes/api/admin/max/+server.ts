import { adminSessionCookie, validAdminSession } from '$lib/server/admin/auth';
import { clearMaxDiagnostics, listMaxDiagnostics } from '$lib/server/max/diagnostics';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const config = { maxDiagnostics: true };

export const GET: RequestHandler = async ({ cookies, platform, url }) => {
	if (!validAdminSession(cookies.get(adminSessionCookie)))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	const before = url.searchParams.get('before') ?? '';
	try {
		const result = await listMaxDiagnostics(platform, {
			before: /^\d{10,16}:[a-f0-9-]{36}$/i.test(before) ? before : undefined,
			issuesOnly: url.searchParams.get('issues') === '1'
		});
		if (!result)
			return json({ message: 'Max diagnostics storage is not configured.' }, { status: 503 });
		return json(result, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
	} catch {
		return json(
			{ message: 'Max diagnostics is unavailable. Check the database binding and migration 0007.' },
			{ status: 503 }
		);
	}
};
export const DELETE: RequestHandler = async ({ cookies, platform }) => {
	if (!validAdminSession(cookies.get(adminSessionCookie)))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	try {
		if (!(await clearMaxDiagnostics(platform)))
			return json({ message: 'Max diagnostics storage is not configured.' }, { status: 503 });
		return new Response(null, { status: 204 });
	} catch {
		return json({ message: 'Unable to clear Max diagnostics.' }, { status: 503 });
	}
};
