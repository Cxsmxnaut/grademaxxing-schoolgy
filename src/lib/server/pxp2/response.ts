import { Pxp2SessionExpiredError } from './errors';

export async function responseText(response: Response, detectExpiredSession = true) {
	if (detectExpiredSession && response.url.includes('PXP2_Login'))
		throw new Pxp2SessionExpiredError('StudentVUE session expired.');
	if (!response.ok && response.status !== 302 && response.status !== 303)
		throw new Error('StudentVUE portal request failed.');
	return new TextDecoder().decode(
		await responseBytes(response, 5 * 1024 * 1024, 'StudentVUE portal response')
	);
}

export async function responseJson<T>(response: Response): Promise<T> {
	const body = await responseText(response);
	try {
		return JSON.parse(body) as T;
	} catch {
		throw new Error('StudentVUE portal returned invalid JSON.');
	}
}

export async function responseBytes(response: Response, maximumBytes: number, label: string) {
	const declaredLength = Number(response.headers.get('content-length') ?? '0');
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
		throw new Error(`${label} is too large.`);
	if (!response.body) return new Uint8Array();

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maximumBytes) {
				await reader.cancel();
				throw new Error(`${label} is too large.`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}
