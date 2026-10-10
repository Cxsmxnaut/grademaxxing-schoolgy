import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_PAGES, socialImagePath } from '../src/lib/seo/public-pages';

// Generate source SVGs, then encode with sharp-cli; see docs/seo-geo/measurement.md.
const output = process.argv[2];
if (!output) throw new Error('Provide a temporary directory for SVG source cards.');
mkdirSync(output, { recursive: true });
const logo = readFileSync('static/grademaxxing-logo.png').toString('base64');
const escape = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
function wrap(value: string, limit: number) {
	const lines: string[] = [];
	for (const word of value.split(/\s+/)) {
		const current = lines.at(-1);
		if (!current || current.length + word.length + 1 > limit) lines.push(word);
		else lines[lines.length - 1] = `${current} ${word}`;
	}
	return lines;
}
for (const page of PUBLIC_PAGES) {
	const title = page.title.replace(/\s*\| Grademaxxing$/, '').replace(/\s*\|.*$/, '');
	const titleLines = wrap(title, 35);
	const titleSize = titleLines.length > 3 ? 52 : 60;
	const subtitle =
		page.kind === 'calculator'
			? 'FREE GRADE CALCULATOR'
			: page.kind === 'guide'
				? 'FORMULAS, EXAMPLES & ASSUMPTIONS'
				: 'READ-ONLY GRADE PLANNING';
	const titleNodes = titleLines
		.map(
			(line, index) =>
				`<text x="72" y="${245 + index * (titleSize + 9)}" font-size="${titleSize}" font-weight="700">${escape(line)}</text>`
		)
		.join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<rect width="1200" height="630" fill="#fffdf6"/>
<rect x="0" y="0" width="14" height="630" fill="#285e44"/>
<g font-family="Arial, Helvetica, sans-serif" fill="#17251e">
<image href="data:image/png;base64,${logo}" x="64" y="48" width="64" height="64"/>
<text x="146" y="91" font-size="34" font-weight="700">Grademaxxing</text>
<text x="72" y="173" font-size="19" letter-spacing="2" fill="#285e44">${escape(subtitle)}</text>
${titleNodes}
<path d="M72 510H1128" stroke="#d0d9ce" stroke-width="2"/>
<text x="72" y="563" font-size="25" fill="#44624f">grademaxxing.app</text>
<text x="1128" y="563" text-anchor="end" font-size="22" fill="#44624f">Tools · worked examples · clear limits</text>
</g></svg>`;
	const filename = socialImagePath(page.path).split('/').at(-1)!.replace('.png', '.svg');
	writeFileSync(join(output, filename), svg);
}
console.log(`Prepared ${PUBLIC_PAGES.length} public social card sources.`);
