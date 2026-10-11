import { expect, test } from '@playwright/test';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * Exercises every interactive element on the AnimOS-derived Grademaxxing
 * landing in the main Svelte app. Uses Playwright's configured baseURL;
 * LANDING_URL optionally overrides it for a separate preview.
 */
const LANDING = process.env.LANDING_URL ?? '';

const NAV_ANCHORS = [
	{ label: 'How it works', hash: '#how-it-works' },
	{ label: 'Features', hash: '#why' },
	{ label: 'FAQ', hash: '#faq' }
] as const;

test.describe('animos landing — navigation', () => {
	for (const { label, hash } of NAV_ANCHORS) {
		test(`nav link "${label}" scrolls to ${hash}`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await page.goto(`${LANDING}/`);
			await expect(page.locator('.marquee-container')).toBeVisible();
			await page.evaluate(() => {
				const positions: number[] = [];
				window.addEventListener(
					'scroll',
					() => {
						positions.push(window.scrollY);
						document.body.dataset.navigationScrollSamples = JSON.stringify(positions);
					},
					{ passive: true }
				);
			});
			await page.getByRole('navigation').getByRole('link', { name: label }).click();
			await expect(page).toHaveURL(new RegExp(`${hash}$`));
			const target = page.locator(hash);
			await expect
				.poll(async () => Math.round((await target.boundingBox())?.y ?? 99999), { timeout: 10_000 })
				.toBeLessThanOrEqual(140);
			await expect
				.poll(async () => Math.round((await target.boundingBox())?.y ?? 99999))
				.toBeGreaterThanOrEqual(-20);
			const samples: number[] = await page.evaluate(() =>
				JSON.parse(document.body.dataset.navigationScrollSamples ?? '[]')
			);
			expect(new Set(samples.map(Math.round)).size).toBeGreaterThan(5);
			await expect(target).toBeFocused();
		});
	}

	test('keyboard navigation respects reduced motion and browser history', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await page.goto(`${LANDING}/`);
		await expect(page.locator('.marquee-container')).toBeVisible();
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await expect(page.locator('.landing-schools-track')).toHaveClass(/landing-schools-static/);
		await page.evaluate(() => document.fonts.ready);
		const navigation = page.getByRole('navigation');
		await navigation.getByRole('link', { name: 'Features' }).focus();
		await page.keyboard.press('Enter');
		await expect(page).toHaveURL(/#why$/);
		await expect(page.locator('#why')).toBeFocused();
		const top = (await page.locator('#why').boundingBox())!.y;
		expect(top).toBeGreaterThanOrEqual(70);
		expect(top).toBeLessThanOrEqual(110);
		await navigation.getByRole('link', { name: 'FAQ' }).click();
		await expect(page).toHaveURL(/#faq$/);
		await page.goBack();
		await expect(page).toHaveURL(/#why$/);
		await expect
			.poll(async () => Math.round((await page.locator('#why').boundingBox())!.y))
			.toBe(Math.round(top));
	});

	test('logo links home', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		await page.getByRole('navigation').getByRole('link', { name: 'Grademaxxing home' }).click();
		await expect(page).toHaveURL(/\/$/);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	});

	test('nav hover flips link color', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		const link = page.getByRole('navigation').getByRole('link', { name: 'Features' });
		await expect(link).toHaveCSS('color', 'rgb(179, 179, 179)');
		await link.hover();
		await expect(link).toHaveCSS('color', 'rgb(255, 255, 255)');
		await page.mouse.move(0, 400);
		await expect(link).toHaveCSS('color', 'rgb(179, 179, 179)');
	});
});

test.describe('animos landing — CTAs', () => {
	test('nav "Log in" goes to /login', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		await page.getByRole('navigation').getByRole('link', { name: 'Log in' }).click();
		await expect(page).toHaveURL(/\/login$/);
	});

	test('hero "Open Grademaxxing" goes to /login', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		await page.locator('main').getByRole('link', { name: 'Open Grademaxxing' }).first().click();
		await expect(page).toHaveURL(/\/login$/);
	});

	test('footer "Open Grademaxxing" goes to /login', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		await page.locator('footer').getByRole('link', { name: 'Open Grademaxxing' }).click();
		await expect(page).toHaveURL(/\/login$/);
	});

	test('"Privacy" goes to /privacy', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		await page.getByRole('link', { name: 'Privacy' }).click();
		await expect(page).toHaveURL(/\/privacy$/);
	});
});

test.describe('animos landing — FAQ accordion', () => {
	test('all 8 items open, rotate the icon, and close again', async ({ page }) => {
		await page.goto(`${LANDING}/`);
		await page.getByRole('navigation').getByRole('link', { name: 'FAQ' }).click();
		await expect(page).toHaveURL(/#faq$/);

		const faqs = page.locator('details');
		await expect(faqs).toHaveCount(8);

		for (let i = 0; i < 8; i++) {
			const item = faqs.nth(i);
			const summary = item.locator('summary');
			await summary.scrollIntoViewIfNeeded();
			await summary.click();
			await expect(item).toHaveAttribute('open', '');
			await expect(item.locator('.dt-faq-icon')).toHaveCSS('rotate', '45deg');
			await expect(item.locator('div')).toBeVisible();
			await summary.click();
			await expect(item).not.toHaveAttribute('open', '');
			await expect(item.locator('.dt-faq-icon')).toHaveCSS('rotate', 'none');
		}
	});

	test('opening a second item keeps the first open', async ({ page }) => {
		await page.goto(`${LANDING}/#faq`);
		const faqs = page.locator('details');
		await faqs.nth(0).locator('summary').click();
		await faqs.nth(1).locator('summary').click();
		await expect(faqs.nth(0)).toHaveAttribute('open', '');
		await expect(faqs.nth(1)).toHaveAttribute('open', '');
	});

	test('clicking a question while the page is still scrolling opens it', async ({ page }) => {
		// Regression: clicks that begin on a summary while the anchor glide /
		// entrance stagger is still moving land on a common ancestor and the
		// native toggle is eaten. The section's guard must restore it.
		await page.goto(`${LANDING}/`);
		await page.getByRole('navigation').getByRole('link', { name: 'FAQ' }).click();
		const item = page.locator('#faq details').first();
		const summary = item.locator('summary');
		const viewportH = page.viewportSize()?.height ?? 720;
		await expect(async () => {
			const box = await summary.boundingBox();
			if (!box || box.y < 70 || box.y + box.height > viewportH - 10) {
				throw new Error('question not comfortably in view yet');
			}
			await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
			await page.mouse.down();
			await page.waitForTimeout(25);
			await page.mouse.up();
			await expect(item).toHaveAttribute('open', '');
		}).toPass({ timeout: 8000 });
	});
});

test.describe('animos landing — showcase grid', () => {
	for (const width of [1280, 390]) {
		test(`feature stills stay motionless and fit without clipping at ${width}px`, async ({
			page
		}) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(`${LANDING}/`);
			const section = page.locator('#showcase');
			const row = page.getByRole('region', { name: 'Feature previews' });
			await row.scrollIntoViewIfNeeded();

			await expect(section.locator('video')).toHaveCount(0);
			await expect(row.locator('figure')).toHaveCount(7);
			for (const image of await row.locator('img').all()) {
				await image.scrollIntoViewIfNeeded();
				await expect(image).toHaveAttribute('alt', /.+/);
				await expect(image).toHaveAttribute('src', /\/images\/showcase-[a-z-]+\.png$/);
				const card = image.locator('xpath=ancestor::figure');
				const bounds = await card.boundingBox();
				expect(bounds!.x).toBeGreaterThanOrEqual(0);
				expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
				await expect
					.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
					.toBe(true);
			}
			expect(
				await section.evaluate((el) =>
					[el, ...el.querySelectorAll('*')].every((node) => {
						const style = getComputedStyle(node);
						return style.animationName === 'none' && style.transform === 'none';
					})
				)
			).toBe(true);
			for (const image of await row.locator('img').all()) {
				expect(
					await image.evaluate((el: HTMLImageElement) => {
						const bounds = el.getBoundingClientRect();
						return (
							Math.abs(bounds.width / bounds.height - el.naturalWidth / el.naturalHeight) < 0.01
						);
					})
				).toBe(true);
			}
			expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
			await page.evaluate(() => document.fonts.ready);
			// Compare each preview in the viewport, not a stitched screenshot of a
			// region taller than the viewport (Chromium introduces alpha seams).
			for (const image of await row.locator('img').all()) {
				await image.scrollIntoViewIfNeeded();
				const before = await image.screenshot();
				await page.waitForTimeout(250);
				const after = await image.screenshot();
				const beforePixels = PNG.sync.read(before);
				const afterPixels = PNG.sync.read(after);
				expect(afterPixels.width).toBe(beforePixels.width);
				expect(afterPixels.height).toBe(beforePixels.height);
				// Compare rendered pixels; fractional clipping can change PNG bytes or edge antialiasing.
				expect(
					pixelmatch(
						beforePixels.data,
						afterPixels.data,
						undefined,
						beforePixels.width,
						beforePixels.height,
						{ threshold: 0.1 }
					),
					'Feature preview pixels must remain stationary'
				).toBe(0);
			}
			expect(await row.evaluate((el) => el.scrollLeft)).toBe(0);

			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);
		});
	}
});

test.describe('animos landing — layout sanity', () => {
	test('no horizontal overflow at phone width and CTAs stay reachable', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`${LANDING}/`);
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		await expect(page.getByRole('navigation').getByRole('link', { name: 'Log in' })).toBeVisible();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			390
		);
	});
});
