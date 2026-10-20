import { env } from '$env/dynamic/private';
import { getSchoologyConnectorOptions, getSchoologyDistrict } from '$lib/server/schoology-config';
import { pendingSession, setSchoologySession } from '$lib/server/schoology-session';
import { json } from '@sveltejs/kit';
import { SchoologyOAuth } from '../../../../../../packages/schoology-connector/dist/index.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
	if (request.headers.get('origin') !== new URL(request.url).origin)
		return json({ message: 'The sign-in request could not be verified.' }, { status: 403 });
	const body = (await request.json().catch(() => null)) as { districtId?: unknown } | null;
	if (!body || typeof body.districtId !== 'string')
		return json({ message: 'Choose a Schoology district first.' }, { status: 400 });
	const district = getSchoologyDistrict(body.districtId);
	if (!district)
		return json({ message: 'That district is not configured for this edition.' }, { status: 400 });
	try {
		const callbackUrl =
			env.SCHOOLOGY_CALLBACK_URL ??
			(request.url.startsWith('http://localhost:') || request.url.startsWith('http://127.0.0.1:')
				? `${new URL(request.url).origin}/api/schoology/callback`
				: '');
		if (!callbackUrl)
			throw new Error('Set SCHOOLOGY_CALLBACK_URL to the registered HTTPS callback.');
		const start = await new SchoologyOAuth(
			getSchoologyConnectorOptions(district)
		).beginAuthorization(callbackUrl);
		await setSchoologySession(cookies, pendingSession(district.id, start));
		return json({ authorizationUrl: start.authorizationUrl });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Schoology sign-in could not start.';
		return json({ message }, { status: 503 });
	}
};
