import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const themeCss = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const rootBlock = themeCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
const utilityCss = readFileSync(new URL('../app-utilities.css', import.meta.url), 'utf8');
const tailwindBlock = utilityCss.match(/@theme inline\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('public base styles do not import the authenticated utility stylesheet', () => {
	expect(themeCss).not.toContain("@import 'tailwindcss'");
	expect(utilityCss).toContain("@import 'tailwindcss'");
});

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

test('the dark interface defines the complete semantic visual contract', () => {
	for (const token of semanticTokens) {
		expect(rootBlock, `dark interface is missing --${token}`).toContain(`--${token}:`);
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
	expect(rootBlock).toContain('--background: #151e28;');
	expect(rootBlock).toContain('--card: #1a2737;');
	expect(rootBlock).toContain('--primary: #6ea8dc;');
	expect(rootBlock).toContain('--success: #04dfa7;');
	expect(rootBlock).toContain('--warning: #e7bd62;');
	expect(rootBlock).toContain('--destructive: #f08078;');
	expect(rootBlock).toContain('--grade-strong: #04dfa7;');
	expect(rootBlock).toContain('--chart: #6ea8dc;');
	expect(rootBlock).not.toContain('--success: #6ea8dc;');
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

	expect(badgeSource).toContain('bg-green-900/70');
	expect(badgeSource).toContain('bg-emerald-900/70');
	expect(badgeSource).toContain('bg-teal-900/70');
	expect(colorSource).toContain("green: 'bg-green-500'");
	expect(colorSource).toContain("emerald: 'bg-emerald-500'");
	expect(colorSource).toContain("teal: 'bg-teal-500'");
});

test('grade UI uses semantic outcomes instead of hard-coded utility colors', () => {
	const gradeFiles = [
		'../routes/(authed)/grades/CourseButton.svelte',
		'../routes/(authed)/grades/[index]/AssignmentCard.svelte'
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
