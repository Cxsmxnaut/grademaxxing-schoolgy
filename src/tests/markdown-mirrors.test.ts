import { markdownMirrorPath, markdownResponse } from '$lib/server/markdown-mirrors';
import { describe, expect, it } from 'vitest';

describe('markdown mirrors', () => {
	it('maps public page paths to their mirror URLs', () => {
		expect(markdownMirrorPath('/')).toBe('/index.md');
		expect(markdownMirrorPath('/login')).toBe('/login.md');
		expect(markdownMirrorPath('/privacy')).toBe('/privacy.md');
		expect(markdownMirrorPath('/glossary')).toBe('/glossary.md');
		expect(markdownMirrorPath('/grades')).toBeUndefined();
	});

	it('serves direct mirror URLs without content negotiation', async () => {
		const response = markdownResponse(
			new Request('https://grademaxxing.app/index.md'),
			'/index.md'
		);
		expect(response?.status).toBe(200);
		expect(response?.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
		expect(response?.headers.get('vary')).toBe('Accept');
		expect(response?.headers.get('link')).toContain('</index.md>; rel="alternate"');
		expect((await response?.text()) ?? '').toContain('# Grademaxxing');
	});

	it('honors Accept: text/markdown for public pages only', () => {
		const negotiated = markdownResponse(
			new Request('https://grademaxxing.app/privacy', {
				headers: { accept: 'text/markdown, text/html, */*' }
			}),
			'/privacy'
		);
		expect(negotiated?.status).toBe(200);

		const plain = markdownResponse(new Request('https://grademaxxing.app/privacy'), '/privacy');
		expect(plain).toBeUndefined();

		const authed = markdownResponse(
			new Request('https://grademaxxing.app/grades', {
				headers: { accept: 'text/markdown' }
			}),
			'/grades'
		);
		expect(authed).toBeUndefined();
	});

	it('keeps every mirror valid: frontmatter, H1, and a sitemap section', async () => {
		for (const path of ['/', '/login', '/privacy', '/glossary']) {
			const response = markdownResponse(
				new Request(`https://grademaxxing.app${path}`, {
					headers: { accept: 'text/markdown' }
				}),
				path
			);
			const body = (await response?.text()) ?? '';
			expect(body.startsWith('---\n'), `${path} mirror needs YAML frontmatter`).toBe(true);
			expect(body).toContain('\ntitle: ');
			expect(body).toContain('\ndescription: ');
			expect(body).toMatch(/^# /m);
			expect(body).toContain('## Sitemap');
			expect(body).toContain('](https://grademaxxing.app/sitemap.md)');
		}
	});
});
