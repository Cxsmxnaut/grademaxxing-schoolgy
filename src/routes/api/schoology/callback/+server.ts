import { getSchoologyConnectorOptions, getSchoologyDistrict } from '$lib/server/schoology-config';
import {
	clearSchoologySession,
	getSchoologyCookie,
	oauthSession,
	readSchoologySession,
	setSchoologySession
} from '$lib/server/schoology-session';
import { redirect } from '@sveltejs/kit';
import { SchoologyOAuth } from '../../../../../packages/schoology-connector/dist/index.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const pending = await readSchoologySession(getSchoologyCookie(cookies));
	const district =
		pending?.kind === 'pending' ? getSchoologyDistrict(pending.districtId) : undefined;
	if (!pending?.pending || !district) {
		clearSchoologySession(cookies);
		redirect(303, '/schoology/login?error=expired');
	}
	try {
		const options = getSchoologyConnectorOptions(district);
		const token = await new SchoologyOAuth(options).completeAuthorization(
			pending.pending,
			url.href
		);
		await setSchoologySession(cookies, oauthSession(district.id, token));
		redirect(303, '/schoology');
	} catch {
		clearSchoologySession(cookies);
		redirect(303, '/schoology/login?error=callback');
	}
};
