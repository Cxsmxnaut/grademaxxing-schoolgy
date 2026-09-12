import { getBlobURLFromBase64String } from '$lib/files/blob-url';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
	vi.restoreAllMocks();
});

test('creates an inline blob URL for a valid passive image', async () => {
	const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-image');
	const onePixelPng =
		'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=';

	await expect(getBlobURLFromBase64String(onePixelPng)).resolves.toBe('blob:test-image');
	expect(createObjectURL).toHaveBeenCalledOnce();
	expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
	expect((createObjectURL.mock.calls[0]?.[0] as Blob).type).toBe('image/png');
});

test('rejects malformed and oversized encoded files before creating a URL', async () => {
	const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:unexpected');

	await expect(getBlobURLFromBase64String('not valid base64!')).rejects.toThrow(
		'The file is not valid base64'
	);
	await expect(getBlobURLFromBase64String('a'.repeat(36 * 1024 * 1024 + 1))).rejects.toThrow(
		'The file has an invalid size'
	);
	expect(createObjectURL).not.toHaveBeenCalled();
});
