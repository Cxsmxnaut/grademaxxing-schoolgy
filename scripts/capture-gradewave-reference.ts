import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const outputRoot = '/tmp/grademaxxing-parity/reference';
const requestedPage = process.env.PARITY_PAGE;
const requestedMode = process.env.PARITY_MODE;
const publicRoutes = [
	['landing', 'https://gradewave.org/'],
	['login', 'https://gradewave.org/#/login'],
	['signup', 'https://gradewave.org/#/signup'],
	['signup-google', 'https://gradewave.org/#/signup/google']
] as const;
const appRoutes = [
	['gradebook', 'https://gradewave.org/#/gradebook'],
	['course', 'https://gradewave.org/#/course/0'],
	['attendance', 'https://gradewave.org/#/attendance'],
	['history', 'https://gradewave.org/#/history'],
	['feedback', 'https://gradewave.org/#/feedback'],
	['gpa-calculator', 'https://gradewave.org/#/gpa-calculator']
] as const;

async function enableDemo(page: Page) {
	await page.goto('https://gradewave.org/', { waitUntil: 'networkidle' });
	const demo = page.getByRole('button', { name: 'Explore the demo' });
	if ((await demo.count()) === 1) {
		await demo.click();
		await page.waitForTimeout(400);
	}
}

async function settlePage(page: Page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
		window.scrollTo(0, 0);
	});
	await page.waitForTimeout(250);
}

async function capture(context: BrowserContext, mode: 'desktop-dark' | 'mobile-dark') {
	const directory = `${outputRoot}/${mode}`;
	await mkdir(directory, { recursive: true });
	await context.addInitScript(() => {
		localStorage.setItem('gradewave.theme', 'dark');
		Object.defineProperty(navigator, 'share', {
			configurable: true,
			value: async (payload: ShareData) =>
				sessionStorage.setItem('visual-audit-share', JSON.stringify(payload))
		});
	});
	const page = await context.newPage();
	const metrics: Record<string, unknown> = {};

	for (const [name, url] of requestedPage
		? publicRoutes.filter(([name]) => name === requestedPage)
		: publicRoutes) {
		await page.goto(url, { waitUntil: 'networkidle' });
		await page.mouse.move(0, 0);
		await settlePage(page);
		await page.screenshot({
			path: `${directory}/${name}.png`,
			fullPage: true,
			animations: 'disabled'
		});
		metrics[name] = await collectMetrics(page);
		if (name === 'login') {
			const districtChange = page.locator('#district-change');
			await districtChange.click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/login-district-change.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
	}

	await enableDemo(page);
	for (const [name, url] of requestedPage
		? appRoutes.filter(([name]) => name === requestedPage)
		: appRoutes) {
		await page.goto(url, { waitUntil: 'networkidle' });
		await page.mouse.move(0, 0);
		await settlePage(page);
		await page.screenshot({
			path: `${directory}/${name}.png`,
			fullPage: true,
			animations: 'disabled'
		});
		metrics[name] = await collectMetrics(page);
		if (mode.startsWith('mobile') && name === 'gradebook') {
			await page.locator('.gpa-fold-btn').click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gradebook-gpa-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
			metrics['gradebook-gpa-open'] = await collectMetrics(page);
		}
		if (name === 'gradebook') {
			await page.locator('.course-btn').first().hover();
			await page.screenshot({
				path: `${directory}/gradebook-course-hover.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.mouse.move(0, 0);
			await page.locator('#period-sel').selectOption({ label: 'Quarter 2' });
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gradebook-period-changed.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.locator('#period-sel').selectOption({ label: 'Quarter 1' });
			await page.locator('#rank-share').click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gradebook-rank-shared.png`,
				fullPage: true
			});
			await page.getByRole('button', { name: 'Close', exact: true }).click();
		}
		if (name === 'course') {
			const planner = page.locator('.fold-head');
			await planner.click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-finals-open.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await planner.click();
			await page.getByRole('button', { name: 'Assessments', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-assessments.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Homework', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-homework.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Classwork', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-classwork.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Assessments', exact: true }).click();
			await page.locator('input[type="checkbox"]').first().check();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical.png`,
				fullPage: true,
				animations: 'disabled'
			});
			const whatIfForm = page.locator('#hypo-add');
			await whatIfForm.locator('input[name="earned"]').focus();
			await page.screenshot({
				path: `${directory}/course-hypothetical-focused.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await whatIfForm.locator('input[name="earned"]').fill('10');
			await whatIfForm.locator('input[name="possible"]').fill('10');
			await whatIfForm.getByRole('button', { name: 'Add', exact: true }).click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-added.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.locator('.asg-card.just-added .cat-select').selectOption('Homework');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-category-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.getByRole('button', { name: 'Homework', exact: true }).click();
			const addedCard = page.locator('.asg-card').filter({ hasText: 'What-if 1' }).first();
			await addedCard.locator('.what-if-input').first().fill('7');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-score-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await addedCard.locator('.hypo-del').click();
			await page.locator('#hypo-reset').click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/course-hypothetical-reset.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
		if (name === 'gpa-calculator') {
			await page.locator('input[type="checkbox"]').first().click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gpa-calculator-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.locator('.gpa-letter-sel').first().selectOption('B');
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gpa-calculator-letter-edited.png`,
				fullPage: true,
				animations: 'disabled'
			});
			await page.locator('#gpa-reset-all').click();
			await settlePage(page);
			await page.screenshot({
				path: `${directory}/gpa-calculator-reset.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
		if (name === 'feedback') {
			await page.locator('#chat-refresh').click();
			await page.locator('textarea').focus();
			await page.locator('textarea').fill('Visual parity keyboard check');
			await page.screenshot({
				path: `${directory}/feedback-focused.png`,
				fullPage: true,
				animations: 'disabled'
			});
		}
	}

	await writeFile(`${directory}/metrics.json`, `${JSON.stringify(metrics, null, 2)}\n`);
	await page.close();
}

async function collectMetrics(page: Page) {
	return page.evaluate(() => {
		const read = (element: Element | null) => {
			if (!(element instanceof HTMLElement)) return null;
			const style = getComputedStyle(element);
			const box = element.getBoundingClientRect();
			return {
				box: {
					x: Math.round(box.x * 100) / 100,
					y: Math.round(box.y * 100) / 100,
					width: Math.round(box.width * 100) / 100,
					height: Math.round(box.height * 100) / 100
				},
				fontFamily: style.fontFamily,
				fontSize: style.fontSize,
				fontWeight: style.fontWeight,
				lineHeight: style.lineHeight,
				color: style.color,
				backgroundColor: style.backgroundColor,
				borderColor: style.borderColor,
				borderRadius: style.borderRadius,
				padding: style.padding,
				gap: style.gap
			};
		};
		return {
			viewport: { width: innerWidth, height: innerHeight },
			body: read(document.body),
			h1: read(document.querySelector('h1')),
			main: read(document.querySelector('main')),
			nav: read(document.querySelector('nav')),
			aside: read(document.querySelector('aside')),
			button: read(document.querySelector('button')),
			input: read(document.querySelector('input'))
		};
	});
}

const browser = await chromium.launch({ channel: 'chrome' });
const desktopDark = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	colorScheme: 'dark'
});
const mobileDark = await browser.newContext({
	viewport: { width: 390, height: 844 },
	colorScheme: 'dark'
});
if (!requestedMode || requestedMode === 'desktop-dark') await capture(desktopDark, 'desktop-dark');
if (!requestedMode || requestedMode === 'mobile-dark') await capture(mobileDark, 'mobile-dark');
await browser.close();

console.log(outputRoot);
