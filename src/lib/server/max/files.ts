import type { PortalFile } from '$lib/server/pxp2';
import { load } from 'cheerio';

export async function readMaxFile(file: PortalFile) {
	const metadata = { fileName: file.fileName, mimeType: file.mimeType };
	if (file.base64.length > 7 * 1024 * 1024)
		return {
			...metadata,
			readable: false,
			reason: 'File exceeds the 5 MiB text-reading limit. Open it in the app.'
		};
	const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
	if (file.mimeType === 'application/pdf' || file.fileName.toLowerCase().endsWith('.pdf')) {
		const { getDocumentProxy } = await import('unpdf');
		const pdf = await getDocumentProxy(bytes, {
			verbosity: 0,
			disableAutoFetch: true,
			disableStream: true,
			useSystemFonts: false,
			disableFontFace: true
		});
		try {
			// Lazy page reads avoid loading an entire long transcript into model context.
			return {
				...metadata,
				readable: true,
				pageCount: pdf.numPages,
				readPage: async (pageNumber: number) => {
					const page = await pdf.getPage(pageNumber);
					const content = await page.getTextContent();
					return content.items
						.map((item) => ('str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : ''))
						.join('');
				},
				dispose: () => pdf.loadingTask.destroy()
			};
		} catch {
			await pdf.loadingTask.destroy();
			throw new Error('Document text could not be extracted.');
		}
	}
	if (
		/^(text\/|application\/(json|xml|csv))/.test(file.mimeType) ||
		/\.(txt|csv|json|xml|html?|md)$/i.test(file.fileName)
	) {
		let content = new TextDecoder().decode(bytes);
		if (/html/i.test(file.mimeType) || /\.html?$/i.test(file.fileName)) {
			const $ = load(content);
			$('script,style').remove();
			content = $.text();
		}
		return { ...metadata, readable: true, content };
	}
	return {
		...metadata,
		readable: false,
		reason:
			'This file is an image or another format without readable text. Max cannot inspect its visual content; open it in the app. Never infer unseen contents.'
	};
}
