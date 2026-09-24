import { expect, test, type Page } from '@playwright/test';

const tokenNames = [
	'--background',
	'--foreground',
	'--primary',
	'--accent',
	'--card',
	'--border',
	'--success',
	'--warning',
	'--destructive',
	'--grade-strong',
	'--grade-watch',
	'--grade-risk'
] as const;

async function readTheme(page: Page, mode: 'light' | 'dark') {
	return page.evaluate(
		({ mode, tokenNames }) => {
			document.documentElement.classList.toggle('dark', mode === 'dark');
			const styles = getComputedStyle(document.documentElement);
			return Object.fromEntries(
				tokenNames.map((token) => [token, styles.getPropertyValue(token).trim()])
			);
		},
		{ mode, tokenNames }
	);
}

test('the complete semantic palette resolves in light and dark modes', async ({ page }) => {
	await page.goto('/login');
	const light = await readTheme(page, 'light');
	const dark = await readTheme(page, 'dark');

	for (const token of tokenNames) {
		expect(light[token], `${token} should resolve in light mode`).not.toBe('');
		expect(dark[token], `${token} should resolve in dark mode`).not.toBe('');
		expect(dark[token], `${token} should differ between modes`).not.toBe(light[token]);
	}

	expect(light).toMatchObject({
		'--background': '#f5f9fd',
		'--foreground': '#0f1c2e',
		'--primary': '#0a73b2',
		'--success': '#177a52',
		'--warning': '#8f6b1e',
		'--destructive': '#b0483a',
		'--grade-strong': '#177a52'
	});
	expect(dark).toMatchObject({
		'--background': '#16202a',
		'--primary': '#275688',
		'--success': '#04dfa7',
		'--warning': '#e7bd62',
		'--destructive': '#f08078',
		'--grade-strong': '#04dfa7'
	});
	expect(light['--primary']).not.toBe(light['--success']);
	expect(dark['--primary']).not.toBe(dark['--success']);
});

test('primary controls keep visible hover, focus, and disabled states', async ({ page }) => {
	await page.goto('/login');
	await readTheme(page, 'light');

	const submit = page.getByRole('button', { name: 'Log in' });
	const initialBackground = await submit.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);

	await submit.hover();
	const hoverBackground = await submit.evaluate(
		(element) => getComputedStyle(element).backgroundColor
	);
	expect(hoverBackground).not.toBe(initialBackground);

	await submit.focus();
	expect(await submit.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');

	await submit.evaluate((element) => {
		(element as HTMLButtonElement).disabled = true;
	});
	await expect(submit).toBeDisabled();
	await expect
		.poll(() => submit.evaluate((element) => Number(getComputedStyle(element).opacity)))
		.toBeLessThan(1);
});
