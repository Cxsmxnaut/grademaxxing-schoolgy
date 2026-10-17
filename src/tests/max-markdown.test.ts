import { expect, test } from 'vitest';
import { renderMarkdown } from '../routes/(authed)/max/markdown';

test('emphasis renders as real elements, not literal asterisks', () => {
	expect(renderMarkdown('aim for **93.5%** and *stay calm*')).toBe(
		'<p>aim for <strong>93.5%</strong> and <em>stay calm</em></p>'
	);
	expect(renderMarkdown('**Bold** and ~~gone~~ and `code`')).toContain('<strong>Bold</strong>');
	expect(renderMarkdown('**Bold** and ~~gone~~ and `code`')).toContain('<del>gone</del>');
	expect(renderMarkdown('run `npm test` now')).toContain('<code>npm test</code>');
});

test('loose multiplication stays literal while tight emphasis formats', () => {
	expect(renderMarkdown('5 * 3 * 2')).toBe('<p>5 * 3 * 2</p>');
});

test('headings, lists, tables and code fences render as blocks', () => {
	expect(renderMarkdown('### Game Plan')).toBe('<h3>Game Plan</h3>');
	expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
	expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
	expect(renderMarkdown('```js\n<script>x</script>\n```')).toBe(
		'<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>'
	);
	const table = renderMarkdown('| Scenario | Final |\n| --- | --- |\n| Bomb it | 61% |');
	expect(table).toContain('<table>');
	expect(table).toContain('<th>Scenario</th>');
	expect(table).toContain('<td>Bomb it</td>');
});

test('escaping happens before any tag is generated (XSS-safe by construction)', () => {
	const html = renderMarkdown('<img src=x onerror=alert(1)> and <script>alert(2)</script>');
	expect(html).not.toContain('<img');
	expect(html).not.toContain('<script');
	expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	// emphasis markup is the only angle-bracket source that survives
	expect(renderMarkdown('**ok** <b>not ok</b>')).toBe(
		'<p><strong>ok</strong> &lt;b&gt;not ok&lt;/b&gt;</p>'
	);
});

test('display math renders through KaTeX as a block', () => {
	const html = renderMarkdown('$$\\frac{90 - 61.95}{0.30} \\ge 93.5$$');
	expect(html).toContain('katex');
	expect(html).toContain('katex-display');
	expect(html).not.toContain('\\frac');
	expect(html).not.toContain('$$');
});

test('inline math renders through KaTeX inside a paragraph', () => {
	const html = renderMarkdown('you need $93.5\\%$ to hit the target');
	expect(html).toContain('<p>you need ');
	expect(html).toContain('katex');
	expect(html).not.toContain('\\%');
});

test('unparseable math falls back to readable symbols, never raw macros', () => {
	const html = renderMarkdown('$$\\frac{90 - 61.95}{0.30} \\unknownmacro{1}$$');
	expect(html).not.toContain('$$');
	expect(html).not.toContain('\\frac');
	expect(html).toContain('(90 - 61.95) / (0.30)');
});

test('KaTeX trust stays off: math input can never inject HTML', () => {
	const html = renderMarkdown('$\\htmlClass{evil}{x}$ and $<script>alert(1)</script>$');
	expect(html).not.toContain('class="evil"');
	expect(html).not.toContain('<script');
});

test('bare money amounts stay literal text', () => {
	expect(renderMarkdown('costs $5.00$ today')).toBe('<p>costs $5.00$ today</p>');
});

test('reasoning blocks never leak into the reply', () => {
	// assembled at runtime so the literal tag sequence never appears in this file
	const block = '<' + 'thin' + 'k>chain of thought<' + '/thin' + 'k>';
	expect(renderMarkdown(`${block}visible answer`)).toBe('<p>visible answer</p>');
});

test('single newlines become line breaks; blank lines split paragraphs', () => {
	expect(renderMarkdown('line one\nline two')).toBe('<p>line one<br>line two</p>');
	expect(renderMarkdown('para one\n\npara two')).toBe('<p>para one</p><p>para two</p>');
});
