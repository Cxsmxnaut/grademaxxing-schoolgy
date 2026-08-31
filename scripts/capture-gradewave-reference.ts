import { chromium, type BrowserContext, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const outputRoot = '/tmp/grademaxxing-parity/reference';
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

async function capture(
	context: BrowserContext,
	mode: 'desktop-dark' | 'mobile-dark' | 'desktop-light' | 'mobile-light'
) {
	const directory = `${outputRoot}/${mode}`;
	await mkdir(directory, { recursive: true });
	const page = await context.newPage();
	const metrics: Record<string, unknown> = {};
	const useLightMode = mode.endsWith('light');

	for (const [name, url] of publicRoutes) {
		await page.goto(url, { waitUntil: 'networkidle' });
		await page.mouse.move(0, 0);
		if (useLightMode && name === 'landing') {
			const lightButton = page.getByRole('button', { name: 'Light', exact: false });
			if ((await lightButton.count()) === 1) await lightButton.click();
		}
		await page.waitForTimeout(250);
		await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
		metrics[name] = await collectMetrics(page);
	}

	await enableDemo(page);
	for (const [name, url] of appRoutes) {
		await page.goto(url, { waitUntil: 'networkidle' });
		await page.mouse.move(0, 0);
		await page.waitForTimeout(250);
		await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true });
		metrics[name] = await collectMetrics(page);
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
const desktopLight = await browser.newContext({
	viewport: { width: 1440, height: 900 },
	colorScheme: 'light'
});
const mobileLight = await browser.newContext({
	viewport: { width: 390, height: 844 },
	colorScheme: 'light'
});

await capture(desktopDark, 'desktop-dark');
await capture(mobileDark, 'mobile-dark');
await capture(desktopLight, 'desktop-light');
await capture(mobileLight, 'mobile-light');
await browser.close();

console.log(outputRoot);
