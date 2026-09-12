import { fileTypeFromBuffer } from 'file-type';

const maximumEncodedFileSize = 36 * 1024 * 1024;
const maximumDecodedFileSize = 25 * 1024 * 1024;

const browserSafeInlineTypes = new Set([
	'application/pdf',
	'image/gif',
	'image/jpeg',
	'image/png',
	'image/webp'
]);

export async function getBlobURLFromBase64String(base64: string) {
	if (base64.length === 0 || base64.length > maximumEncodedFileSize) {
		throw new Error('The file has an invalid size');
	}

	let binary: string;
	try {
		binary = atob(base64);
	} catch {
		throw new Error('The file is not valid base64');
	}

	const byteArray = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		byteArray[index] = binary.charCodeAt(index);
	}
	if (byteArray.length === 0 || byteArray.length > maximumDecodedFileSize) {
		throw new Error('The file has an invalid size');
	}

	const mimeType = (await fileTypeFromBuffer(byteArray))?.mime;
	if (mimeType === undefined) throw new Error('Could not determine MIME type');

	// Blob URLs inherit the app's origin. Never navigate to active content such as
	// HTML or SVG supplied by an upstream message/document because it could execute
	// with access to this origin. Only browser-safe passive formats render inline;
	// everything else is treated as an opaque download.
	const blob = new Blob([byteArray], {
		type: browserSafeInlineTypes.has(mimeType) ? mimeType : 'application/octet-stream'
	});

	return URL.createObjectURL(blob);
}
