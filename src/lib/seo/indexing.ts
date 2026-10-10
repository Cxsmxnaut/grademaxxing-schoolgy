import { getPublicPage, isProductionHost, SITE_ORIGIN } from './public-pages';

/** Exclusion is independent of authentication and must never replace it. */
export function needsNoindex(url: URL, status: number, contentType: string | null) {
	if (!isProductionHost(url.hostname) || status >= 400) return true;
	if (
		url.pathname === '/api' ||
		url.pathname.startsWith('/api/') ||
		url.pathname === '/mcp' ||
		url.pathname.startsWith('/mcp/') ||
		url.pathname.startsWith('/.well-known/') ||
		url.pathname === '/admin' ||
		url.pathname === '/admin-app' ||
		url.pathname.startsWith('/admin-app/')
	)
		return true;
	return Boolean(contentType?.includes('text/html') && !getPublicPage(url.pathname));
}

/** Only the canonical hostname redirects; alternate and local hosts keep their purpose. */
export function productionHttpsRedirect(url: URL, forwardedProtocol: string | null) {
	if (
		!isProductionHost(url.hostname) ||
		url.protocol !== 'http:' ||
		forwardedProtocol?.split(',', 1)[0]?.trim() === 'https'
	)
		return undefined;
	return `${SITE_ORIGIN}${url.pathname}${url.search}`;
}

/** Maintenance affects the signed-in app and sign-in/import UI, never public tools. */
export function isMaintenancePage(pathname: string, routeId: string | null | undefined) {
	if (!routeId || getPublicPage(pathname)) return false;
	return (
		routeId.startsWith('/(authed)/') || pathname === '/login' || pathname === '/migrate/import'
	);
}
