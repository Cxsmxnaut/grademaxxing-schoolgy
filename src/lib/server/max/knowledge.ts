import { load } from 'cheerio';
import guides from './app-guides.json';

// Build-time source imports keep Max's product knowledge aligned with the actual
// shipped pages. No authenticated HTML, user records, or server source is indexed.
const pages = import.meta.glob<string>(
	[
		'/src/routes/+page.svelte',
		'/src/routes/privacy/+page.svelte',
		'/src/routes/login/**/*.svelte',
		'/src/routes/(authed)/**/*.svelte'
	],
	{ query: '?raw', import: 'default', eager: true }
);

export function visibleSourceText(source: string) {
	const literals = [...source.matchAll(/(['"`])([^'"`\n]{30,})\1/g)]
		.map((match) => match[2]!)
		.filter((text) => /[a-z]{2} [a-z]{2}/i.test(text) && !/^(import |from |class=)/.test(text));
	const html = source
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<!--[^]*?-->/g, '')
		.replace(/\{brand\}/g, 'Grademaxxing')
		.replace(/\{[^{}]*\}/g, ' ');
	const $ = load(html);
	$('script,style,svg').remove();
	$('p,h1,h2,h3,h4,li,summary,section,div,br').append('\n');
	return [...new Set([$.text(), ...literals])]
		.join('\n')
		.replace(/\$\{brand\}/g, 'Grademaxxing')
		.replace(/[\t ]+/g, ' ')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join('\n');
}

export function sourceLinks(source: string) {
	const $ = load(source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
	return $('a[href]')
		.toArray()
		.flatMap((element) => {
			const href = $(element).attr('href') ?? '';
			return /^(?:\/|https?:\/\/|mailto:)/i.test(href)
				? [
						{
							label: $(element)
								.text()
								.replace(/\{[^{}]*\}/g, '')
								.trim(),
							href
						}
					]
				: [];
		});
}

export const maxAppKnowledge = {
	source: 'Current Grademaxxing app pages and implementation guides',
	pages: Object.entries(pages).map(([file, source]) => ({
		id: file.replace('/src/routes/', '').replace('/+page.svelte', '').replace('(authed)/', ''),
		path:
			'/' +
			file
				.replace('/src/routes/', '')
				.replace('(authed)/', '')
				.replace(/(?:^|\/)[^/]+\.svelte$/, ''),
		content: visibleSourceText(source),
		links: sourceLinks(source)
	})),
	guides,
	boundaries:
		'Read-only school data. Max can inspect records, explain features and draft text. Sending mail, submitting feedback, changing school records, credentials and administrator-only data are not read tools.'
};
