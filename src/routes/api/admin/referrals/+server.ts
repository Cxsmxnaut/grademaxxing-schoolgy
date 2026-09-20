import { adminSessionCookie, validAdminSession } from '$lib/server/admin/auth';
import {
	createReferralPartner,
	getReferralLeaderboard,
	validReferralIdentity
} from '$lib/server/referrals';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

function authorized(cookies: Parameters<RequestHandler>[0]['cookies']) {
	return validAdminSession(cookies.get(adminSessionCookie));
}

export const GET: RequestHandler = async ({ cookies, platform }) => {
	if (!authorized(cookies))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	const partners = await getReferralLeaderboard(platform);
	if (!partners) return json({ message: 'Referral storage is not configured.' }, { status: 503 });
	return json({ partners }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
};

export const POST: RequestHandler = async ({ cookies, platform, request, url }) => {
	if (!authorized(cookies))
		return json({ message: 'Administrator sign-in required.' }, { status: 401 });
	const body = (await request.json().catch(() => undefined)) as
		{ firstName?: unknown; lastName?: unknown; email?: unknown } | undefined;
	if (
		!body ||
		typeof body.firstName !== 'string' ||
		typeof body.lastName !== 'string' ||
		typeof body.email !== 'string' ||
		!validReferralIdentity(body.firstName, body.lastName, body.email)
	)
		return json({ message: 'Enter a valid first name, last name, and email.' }, { status: 400 });
	try {
		const partner = await createReferralPartner(
			platform,
			body as { firstName: string; lastName: string; email: string }
		);
		if (!partner) return json({ message: 'Referral storage is not configured.' }, { status: 503 });
		const publicOrigin =
			url.hostname === 'admin.grademaxxing.app' ? 'https://grademaxxing.app' : url.origin;
		return json({ partner, shareUrl: `${publicOrigin}/refer/${partner.code}` }, { status: 201 });
	} catch {
		return json({ message: 'That email is already registered as a referrer.' }, { status: 409 });
	}
};
