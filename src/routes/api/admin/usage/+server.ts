import { adminSessionCookie, validAdminSession } from '$lib/server/admin/auth';
import {
	getUsageSummary,
	type UsageRangeDays,
	usageRangeOptions
} from '$lib/server/analytics/usage';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, platform, url }) => {
	if (!validAdminSession(cookies.get(adminSessionCookie)))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	const requestedRange = Number(url.searchParams.get('range'));
	const rangeDays = usageRangeOptions.includes(requestedRange as UsageRangeDays)
		? (requestedRange as UsageRangeDays)
		: 30;
	const summary = await getUsageSummary(platform, rangeDays);
	if (!summary) return json({ message: 'Usage analytics is not configured.' }, { status: 503 });
	return json(summary, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
};
