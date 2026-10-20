import {
	clearSchoologySession,
	getSchoologyCookie,
	readSchoologySession
} from '$lib/server/schoology-session';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const session = await readSchoologySession(getSchoologyCookie(cookies));
	return json({
		signedIn: session?.kind === 'oauth' || session?.kind === 'demo',
		demo: session?.kind === 'demo'
	});
};

export const DELETE: RequestHandler = ({ cookies }) => {
	clearSchoologySession(cookies);
	return new Response(null, { status: 204 });
};
