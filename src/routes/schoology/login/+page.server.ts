import { getSchoologyDistrictChoices } from '$lib/server/schoology-config';
import { getSchoologyCookie, readSchoologySession } from '$lib/server/schoology-session';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load = (async ({ cookies }) => {
	const session = await readSchoologySession(getSchoologyCookie(cookies));
	if (session?.kind === 'oauth' || session?.kind === 'demo') redirect(303, '/schoology');
	return { districts: getSchoologyDistrictChoices() };
}) satisfies PageServerLoad;
