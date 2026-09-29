// This application handles private school data. Dynamic rendering ensures every
// HTML response passes through the security-header and request-ID hook instead
// of being served as an unheadered prerendered file by adapter-node.
export const prerender = false;

import { env } from '$env/dynamic/private';

export function load() {
	return {
		maintenance: env.MAINTENANCE_MODE === 'on'
	};
}
