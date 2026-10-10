import { expect, test, type Page } from '@playwright/test';

async function openTool(page: Page, path: string) {
	await page.goto(path);
	await page.waitForLoadState('networkidle');
	await expect(page.locator('input[type="number"]').first()).toBeEnabled();
}

test('all four tools render useful synthetic calculations without JavaScript', async ({
	browser,
	baseURL
}) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const page = await context.newPage();
	for (const [path, result, value] of [
		['final-grade', 'final-required', '122%'],
		['assignment-impact', 'impact-after', '80%'],
		['weighted-grade', 'weighted-grade', '86%'],
		['gpa', 'gpa-unweighted', '3.67']
	] as const) {
		await page.goto(`/calculators/${path}`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
		await expect(page.getByTestId(result)).toHaveText(value);
		await expect(page.locator('body')).toContainText('formula');
	}
	await context.close();
});

test('final tool keeps impossible and negative targets honest and validates blank weights', async ({
	page
}) => {
	await openTool(page, '/calculators/final-grade');
	await expect(page.getByTestId('final-required')).toHaveText('122%');
	await expect(page.getByText(/unreachable at this score step/)).toBeVisible();
	await page.getByLabel('Current grade (%)', { exact: true }).fill('100');
	await page.getByLabel('Target course grade (%)', { exact: true }).fill('70');
	await expect(page.getByTestId('final-required')).toHaveText('-50%');
	await expect(page.getByText(/already secured even with 0%/)).toBeVisible();
	await page.getByLabel("Final's overall course weight (%)", { exact: true }).fill('');
	await expect(page.getByRole('alert')).toContainText('more than 0%');
	await expect(page.getByTestId('final-required')).toHaveCount(0);
});

test('assignment replacement removes the original instead of adding a second copy', async ({
	page
}) => {
	await openTool(page, '/calculators/assignment-impact');
	await page.getByLabel('New earned points', { exact: true }).fill('45');
	await expect(page.getByTestId('impact-after')).toHaveText('83.33%');
	await page.getByLabel('Assignment action', { exact: true }).selectOption('replace');
	await expect(page.getByTestId('impact-after')).toHaveText('84%');
	await expect(page.getByTestId('impact-delta')).toHaveText('+4 percentage points');
	await page.getByLabel('Original earned points', { exact: true }).fill('90');
	await expect(page.getByRole('alert')).toContainText('cannot exceed');
});

test('category impact, replacement and final-inside-category target use existing points', async ({
	page
}) => {
	await openTool(page, '/calculators/assignment-impact');
	await page.getByLabel('Course calculation model', { exact: true }).selectOption('categories');
	await expect(page.getByTestId('impact-after')).toHaveText('89.5%');
	await expect(page.getByTestId('category-target')).toHaveText('97 / 100');
	await expect(page.getByText(/Forward check: 92% overall/)).toBeVisible();
	await page.getByLabel('Assignment action', { exact: true }).selectOption('replace');
	await expect(page.getByTestId('impact-after')).toHaveText('89.72%');
	await page.getByLabel('Target course grade (%)', { exact: true }).fill('95');
	await expect(page.getByTestId('category-target')).toHaveText('115 / 100');
	await expect(page.getByText(/unreachable at this point step/)).toBeVisible();
	await page.getByLabel('Target course grade (%)', { exact: true }).fill('70');
	await expect(page.getByTestId('category-target')).toHaveText('-35 / 100');
	await expect(page.getByText(/0 points already keeps you/)).toBeVisible();
});

test('extra credit needs an ordinary denominator; a scored zero is not empty work', async ({
	page
}) => {
	await openTool(page, '/calculators/assignment-impact');
	await page
		.getByLabel('Numerator-only extra credit · adds zero possible points', { exact: true })
		.check();
	await page.getByLabel('New earned points', { exact: true }).fill('10');
	await expect(page.getByTestId('impact-after')).toHaveText('90%');
	await page.getByLabel('Current possible points', { exact: true }).fill('0');
	await expect(page.getByRole('alert')).toContainText('positive possible-point total');
	await page
		.getByLabel('Numerator-only extra credit · adds zero possible points', { exact: true })
		.uncheck();
	await page.getByLabel('Current earned points', { exact: true }).fill('0');
	await page.getByLabel('New earned points', { exact: true }).fill('0');
	await expect(page.getByTestId('impact-after')).toHaveText('0%');
});

test('weighted tool requires explicit normalization and distinguishes exclusion from a zero', async ({
	page
}) => {
	await openTool(page, '/calculators/weighted-grade');
	await expect(page.getByTestId('weighted-grade')).toHaveText('86%');
	await page.getByLabel('Tests weight (%)', { exact: true }).fill('30');
	await page.getByLabel('Homework weight (%)', { exact: true }).fill('20');
	await expect(page.getByRole('alert')).toContainText('must total 100%');
	await page
		.getByLabel('How to handle the included weights', { exact: true })
		.selectOption('normalize');
	await expect(page.getByTestId('weighted-grade')).toHaveText('88%');
	await page.getByLabel('Homework grade (%)', { exact: true }).fill('0');
	await expect(page.getByTestId('weighted-grade')).toHaveText('48%');
	await page.getByLabel('Include Homework', { exact: true }).uncheck();
	await expect(page.getByTestId('weighted-grade')).toHaveText('80%');
	await page.getByLabel('Tests grade (%)', { exact: true }).fill('');
	await expect(page.getByRole('alert')).toContainText('or exclude it if ungraded');
});

test('GPA uses configured credits, bonuses, course inclusion and editable scale', async ({
	page
}) => {
	await openTool(page, '/calculators/gpa');
	await expect(page.getByTestId('gpa-unweighted')).toHaveText('3.67');
	await page.getByLabel('Example course 1 rigor bonus (grade points)', { exact: true }).fill('1');
	await expect(page.getByTestId('gpa-weighted')).toHaveText('4.33');
	await page.getByLabel('Include Example course 2 in GPA', { exact: true }).uncheck();
	await expect(page.getByTestId('gpa-unweighted')).toHaveText('4.00');
	await expect(page.getByTestId('gpa-weighted')).toHaveText('5.00');
	await page.getByText('Configure the grade-point scale and bonus rule', { exact: true }).click();
	await page.getByLabel('Base points for grade label 1', { exact: true }).fill('3.7');
	await expect(page.getByTestId('gpa-unweighted')).toHaveText('3.70');
	await expect(page.getByTestId('gpa-weighted')).toHaveText('4.70');
	await page.getByLabel('Example course 1 credits', { exact: true }).fill('0');
	await expect(page.getByRole('alert')).toContainText('positive credits');
});

test('phone layout stays within the viewport and numeric fields work from the keyboard', async ({
	page
}) => {
	await page.setViewportSize({ width: 375, height: 812 });
	for (const path of ['final-grade', 'assignment-impact', 'weighted-grade', 'gpa']) {
		await openTool(page, `/calculators/${path}`);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
		).toBe(true);
	}
	await openTool(page, '/calculators/final-grade');
	const current = page.getByLabel('Current grade (%)', { exact: true });
	await current.focus();
	await current.press('ArrowUp');
	await current.press('Tab');
	await expect(page.getByLabel('Target course grade (%)', { exact: true })).toBeFocused();
	await expect(page.getByTestId('final-required')).not.toHaveText('122%');
});
