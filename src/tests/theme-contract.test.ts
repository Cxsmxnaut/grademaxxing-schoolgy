import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const themeCss = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const rootBlock = themeCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const darkBlock = themeCss.match(/\.dark\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const tailwindBlock = themeCss.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

const semanticTokens = [
	'background',
	'foreground',
	'card',
	'primary',
	'border',
	'input',
	'ring',
	'surface-raised',
	'surface-sunken',
	'link',
	'focus',
	'disabled',
	'stale',
	'simulation',
	'official',
	'grade-strong',
	'grade-strong-soft',
	'grade-watch',
	'grade-watch-soft',
	'grade-risk',
	'grade-risk-soft',
	'grade-neutral',
	'grade-neutral-soft',
	'grade-extra',
	'grade-extra-soft'
] as const;

test('light and dark modes define the complete semantic visual contract', () => {
	for (const token of semanticTokens) {
		expect(rootBlock, `light mode is missing --${token}`).toContain(`--${token}:`);
		expect(darkBlock, `dark mode is missing --${token}`).toContain(`--${token}:`);
	}
});

test('semantic visual tokens are exposed as Tailwind utilities', () => {
	for (const token of semanticTokens) {
		expect(tailwindBlock, `Tailwind is missing --color-${token}`).toContain(
			`--color-${token}: var(--${token});`
		);
	}
});

test('brand, status, and grade semantics remain visually distinct', () => {
	expect(rootBlock).toContain('--background: #f5f9fd;');
	expect(rootBlock).toContain('--foreground: #0f1c2e;');
	expect(rootBlock).toContain('--primary: #0a73b2;');
	expect(rootBlock).toContain('--success: #177a52;');
	expect(rootBlock).toContain('--warning: #8f6b1e;');
	expect(rootBlock).toContain('--destructive: #b0483a;');
	expect(rootBlock).toContain('--grade-strong: #177a52;');
	expect(rootBlock).toContain('--chart: #0a73b2;');

	expect(darkBlock).toContain('--background: #10161b;');
	expect(darkBlock).toContain('--card: #15212a;');
	expect(darkBlock).toContain('--primary: #275688;');
	expect(darkBlock).toContain('--success: #04dfa7;');
	expect(darkBlock).toContain('--warning: #e7bd62;');
	expect(darkBlock).toContain('--destructive: #f08078;');
	expect(darkBlock).toContain('--grade-strong: #04dfa7;');
	expect(darkBlock).toContain('--chart: #275688;');

	expect(rootBlock).not.toContain('--success: #0a73b2;');
	expect(darkBlock).not.toContain('--success: #6ea8dc;');
});

test('named badge colors are not collapsed into the brand palette', () => {
	const badgeSource = readFileSync(
		new URL('../lib/components/ui/badge/badge.svelte', import.meta.url),
		'utf8'
	);
	const colorSource = readFileSync(
		new URL('../lib/components/ui/badge/colors.ts', import.meta.url),
		'utf8'
	);

	expect(badgeSource).toContain('bg-green-200');
	expect(badgeSource).toContain('bg-emerald-200');
	expect(badgeSource).toContain('bg-teal-200');
	expect(colorSource).toContain("green: 'bg-green-500'");
	expect(colorSource).toContain("emerald: 'bg-emerald-500'");
	expect(colorSource).toContain("teal: 'bg-teal-500'");
});

test('grade UI uses semantic outcomes instead of hard-coded utility colors', () => {
	const gradeFiles = [
		'../routes/(authed)/grades/CourseButton.svelte',
		'../routes/(authed)/grades/[index]/AssignmentCard.svelte',
		'../routes/(authed)/grades/[index]/TargetGradeCalculator.svelte'
	];
	const source = gradeFiles
		.map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
		.join('\n');

	expect(source).not.toMatch(/(?:bg|text|border-l)-(?:red|green|yellow|indigo|slate|gray)-\d{2,3}/);
	expect(source).toContain('bg-grade-strong');
	expect(source).toContain('bg-grade-watch');
	expect(source).toContain('bg-grade-risk');
	expect(source).toContain('bg-grade-extra');
});
