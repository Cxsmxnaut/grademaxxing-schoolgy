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

async function readTheme(page: Page) {
	return page.evaluate((tokenNames) => {
		const styles = getComputedStyle(document.documentElement);
		return Object.fromEntries(
			tokenNames.map((token) => [token, styles.getPropertyValue(token).trim()])
		);
	}, tokenNames);
}

test('the complete dark palette resolves', async ({ page }) => {
	await page.goto('/login');
	const palette = await readTheme(page);

	for (const token of tokenNames) {
		expect(palette[token], `${token} should resolve`).not.toBe('');
	}

	expect(palette).toMatchObject({
		'--background': '#151e28',
		'--primary': '#6ea8dc',
		'--success': '#04dfa7',
		'--warning': '#e7bd62',
		'--destructive': '#f08078',
		'--grade-strong': '#04dfa7'
	});
	expect(palette['--primary']).not.toBe(palette['--success']);
});

test('primary controls keep visible hover, focus, and disabled states', async ({ page }) => {
	await page.goto('/login');
	await readTheme(page);

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
