import { releaseChannel, releaseVersion } from '$lib/brand';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	json({ status: 'ok', release: releaseChannel.toLowerCase(), version: releaseVersion });
