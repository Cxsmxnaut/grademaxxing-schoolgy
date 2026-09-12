import { adminSessionCookie, validAdminSession } from '$lib/server/admin/auth';
import { getUsageSummary } from '$lib/server/analytics/usage';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, platform }) => {
	if (!validAdminSession(cookies.get(adminSessionCookie)))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	const summary = await getUsageSummary(platform);
	if (!summary) return json({ message: 'Usage analytics is not configured.' }, { status: 503 });
	return json(summary, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
};
