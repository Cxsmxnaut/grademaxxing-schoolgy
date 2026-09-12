import { DISTRICTS } from '$lib/data/districts';
import { Pxp2InputError } from './errors';

function portalBasePath(pathname: string) {
	const path = pathname.replace(/^\/+|\/+$/g, '');
	return path ? `/${path}/` : '/';
}

const knownStudentVueTargets = DISTRICTS.map((district) => {
	const url = new URL(`https://${district.domain}`);
	return { hostname: url.hostname.toLowerCase(), basePath: portalBasePath(url.pathname) };
}).sort((a, b) => b.basePath.length - a.basePath.length);

export function normalizeDistrictUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value.includes('://') ? value : `https://${value}`);
	} catch {
		throw new Pxp2InputError('Use a valid HTTPS Edupoint district portal URL.');
	}
	if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
		throw new Pxp2InputError('Use a supported HTTPS StudentVUE district portal URL.');

	if (url.hostname.endsWith('.edupoint.com')) return new URL('/', url);

	const hostname = url.hostname.toLowerCase();
	const requestedPath = portalBasePath(url.pathname).toLowerCase();
	const target = knownStudentVueTargets.find(
		(candidate) =>
			candidate.hostname === hostname &&
			(candidate.basePath === '/' ||
				requestedPath === candidate.basePath.toLowerCase() ||
				requestedPath.startsWith(candidate.basePath.toLowerCase()))
	);
	if (!target) throw new Pxp2InputError('Use a supported HTTPS StudentVUE district portal URL.');
	return new URL(target.basePath, url.origin);
}
