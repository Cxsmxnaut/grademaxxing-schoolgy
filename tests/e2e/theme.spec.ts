import { expect, test, type Page } from '@playwright/test';

const tokenNames = [
	'--background',
	'--foreground',
	'--primary',
	'--card',
	'--border',
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
		'--background': '#f7f9fc',
		'--primary': '#1677b8',
		'--grade-strong': '#1677b8'
	});
	expect(dark).toMatchObject({
		'--background': '#081522',
		'--primary': '#4db6f5',
		'--grade-strong': '#4db6f5'
	});
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
