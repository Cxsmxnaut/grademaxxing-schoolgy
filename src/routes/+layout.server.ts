// This application handles private school data. Dynamic rendering ensures every
// HTML response passes through the security-header and request-ID hook instead
// of being served as an unheadered prerendered file by adapter-node.
export const prerender = false;

import { env } from '$env/dynamic/private';
import { isMaintenancePage } from '$lib/seo/indexing';
import { isProductionHost } from '$lib/seo/public-pages';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ url, route }) => {
	return {
		maintenance: env.MAINTENANCE_MODE === 'on' && isMaintenancePage(url.pathname, route.id),
		seoIndexableHost: isProductionHost(url.hostname)
	};
};
