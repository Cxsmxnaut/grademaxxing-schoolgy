import { allPublicPaths, indexNowPayload } from '../src/lib/seo/indexnow';

const args = process.argv.slice(2);
const paths = args.includes('--all')
	? allPublicPaths()
	: args.filter((arg) => !arg.startsWith('--'));
const payload = indexNowPayload(paths);
if (!args.includes('--submit')) {
	console.info(JSON.stringify({ mode: 'dry-run', ...payload }, null, 2));
} else {
	const headers = { 'User-Agent': 'GrademaxxingIndexNow/1.0' };
	const keyResponse = await fetch(payload.keyLocation, {
		headers,
		signal: AbortSignal.timeout(15_000)
	});
	if (!keyResponse.ok || (await keyResponse.text()).trim() !== payload.key)
		throw new Error('Published ownership proof is not available; no URLs submitted.');
	for (const url of payload.urlList) {
		const response = await fetch(url, {
			method: 'HEAD',
			redirect: 'manual',
			headers,
			signal: AbortSignal.timeout(15_000)
		});
		if (response.status !== 200 || /noindex/i.test(response.headers.get('x-robots-tag') ?? ''))
			throw new Error(`Public page is not ready: ${url}; no URLs submitted.`);
	}
	const response = await fetch('https://api.indexnow.org/indexnow', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(20_000)
	});
	if (![200, 202].includes(response.status))
		throw new Error(`IndexNow returned ${response.status}; indexing is not confirmed.`);
	console.info(
		`IndexNow received ${payload.urlList.length} public URLs (${response.status}). This confirms receipt, not indexing.`
	);
}
