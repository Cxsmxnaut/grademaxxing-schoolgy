import { expect, test, type Page } from '@playwright/test';

async function observePageTransitions(page: Page) {
	await page.evaluate(() => {
		const startTransition = document.startViewTransition.bind(document);
		document.startViewTransition = (callback) => {
			const transition = startTransition(callback);
			void transition.ready.then(() => {
				const fades = document.getAnimations().filter((animation) => {
					return (
						animation instanceof CSSAnimation && animation.animationName.startsWith('auth-page-')
					);
				});
				document.documentElement.dataset.observedPageFades = String(fades.length);
				document.documentElement.dataset.pageFadeRunning = String(
					fades.every((animation) => animation.playState === 'running')
				);
			});
			return transition;
		};
	});
}

async function openLanding(page: Page) {
	await page.emulateMedia({ reducedMotion: 'no-preference' });
	await page.goto('/');
	await expect(page.locator('.marquee-container')).toBeVisible();
	await observePageTransitions(page);
}

async function expectLoginFade(page: Page) {
	await expect(page).toHaveURL(/\/login$/);
	await expect(page.locator('html')).toHaveAttribute('data-observed-page-fades', '2');
	await expect(page.locator('html')).toHaveAttribute('data-page-fade-running', 'true');
	await expect(page.locator('html')).not.toHaveClass(/auth-page-transition/);
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await expect(page.getByLabel('StudentVUE email', { exact: true })).toBeEnabled();
}

for (const width of [1440, 390]) {
	for (const section of ['nav', 'main', 'footer']) {
		test(`${section} login link crossfades at ${width}px`, async ({ page }) => {
			await page.setViewportSize({ width, height: 900 });
			await openLanding(page);
			await page.locator(`${section} a[href="/login"]`).click();
			await expectLoginFade(page);
		});
	}
}

test('returning to the website crossfades and restores landing navigation', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openLanding(page);
	await page.getByRole('link', { name: 'Log in', exact: true }).click();
	await expectLoginFade(page);
	await page.evaluate(() => {
		delete document.documentElement.dataset.observedPageFades;
	});
	await page.getByRole('link', { name: 'Back to website' }).click();
	await expect(page).toHaveURL(/\/$/);
	await expect(page.locator('html')).toHaveAttribute('data-observed-page-fades', '2');
	await expect(page.locator('html')).not.toHaveClass(/auth-page-transition/);
	await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
});

test('reduced motion skips the page fade', async ({ page }) => {
	await openLanding(page);
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.getByRole('link', { name: 'Log in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await expect(page.locator('html')).not.toHaveAttribute('data-observed-page-fades');
	await expect(page.locator('html')).not.toHaveClass(/auth-page-transition/);
});

test('login remains usable without view transition support', async ({ page }) => {
	await openLanding(page);
	await page.evaluate(() => {
		Object.defineProperty(document, 'startViewTransition', { value: undefined });
	});
	await page.getByRole('link', { name: 'Log in', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Sign in to Grademaxxing' })).toBeVisible();
	await expect(page.getByLabel('StudentVUE email', { exact: true })).toBeEnabled();
	await expect(page.locator('html')).not.toHaveClass(/auth-page-transition/);
});

test('section scrolling and privacy navigation do not trigger the login fade', async ({ page }) => {
	await openLanding(page);
	await page.getByRole('navigation').getByRole('link', { name: 'FAQ', exact: true }).click();
	await expect(page).toHaveURL(/#faq$/);
	await expect(page.locator('html')).not.toHaveAttribute('data-observed-page-fades');
	await page.getByRole('link', { name: 'Privacy', exact: true }).click();
	await expect(page).toHaveURL(/\/privacy$/);
	await expect(page.locator('html')).not.toHaveAttribute('data-observed-page-fades');
});
