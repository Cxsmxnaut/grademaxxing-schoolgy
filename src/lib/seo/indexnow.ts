import { PUBLIC_PAGES, SITE_ORIGIN, getPublicPage } from './public-pages';

// Public host-ownership proof, not an application credential or session secret.
export const INDEXNOW_KEY = '2c5e117773dd651ee69632f5dcd9cfb1';

export function indexNowPayload(paths: string[]) {
	if (!paths.length) throw new Error('Choose at least one changed public path.');
	if (paths.some((path) => getPublicPage(path)?.path !== path))
		throw new Error('Only canonical public manifest paths may be submitted.');
	return {
		host: new URL(SITE_ORIGIN).hostname,
		key: INDEXNOW_KEY,
		keyLocation: `${SITE_ORIGIN}/${INDEXNOW_KEY}.txt`,
		urlList: [...new Set(paths)].map((path) => `${SITE_ORIGIN}${path}`)
	};
}

export function allPublicPaths() {
	return Object.values(PUBLIC_PAGES).map((page) => page.path);
}
