import { dev } from '$app/environment';
import { getReferralPartner, referralCodeCookie, referralCodeMaxAge } from '$lib/server/referrals';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, platform, cookies }) => {
	const partner = await getReferralPartner(platform, params.code);
	if (!partner) throw error(404, 'This referral invitation is unavailable.');
	cookies.set(referralCodeCookie, params.code, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: !dev,
		maxAge: referralCodeMaxAge
	});
	throw redirect(303, '/login?referred=1');
};
