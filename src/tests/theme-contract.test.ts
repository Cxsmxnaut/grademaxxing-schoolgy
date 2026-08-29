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
