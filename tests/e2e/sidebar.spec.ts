import { expect, test, type Page } from '@playwright/test';

const courses = [
	['calculus', 'AP Calculus BC', '1'],
	['english', 'AP English Language', '2'],
	['physics', 'AP Physics 1', '3'],
	['history', 'US History', '4'],
	['spanish', 'Spanish III', '5'],
	['computer-science', 'Computer Science A', '6']
] as const;

const gradebookXml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses>${courses
	.map(
		([id, name, period]) =>
			`<Course CourseID="${id}" CourseName="${name}" Period="${period}" Staff="Teacher ${period}" Room="${100 + Number(period)}"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="95" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course>`
	)
	.join('')}</Courses></Gradebook>`;

let requestCounts: Record<string, number>;

test.beforeEach(async ({ page }) => {
	requestCounts = {};
	await page.addInitScript(() => {
		localStorage.setItem('mode-watcher-mode', 'light');
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'sidebar-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'sidebar-preview-session'
			})
		);
	});

	await page.route('**/api/session', (route) =>
		route.fulfill({ status: 204, contentType: 'application/json', body: '' })
	);
	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'sidebar-preview',
				domain: 'ca-pleas-psv.edupoint.com'
			})
		})
	);
	await page.route('**/api/session/keepalive', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ signedIn: true, updatedAt: Date.now() })
		})
	);
	await page.route('**/api/studentvue/**', (route) => {
		const resource = new URL(route.request().url()).pathname.split('/').at(-1) ?? 'unknown';
		requestCounts[resource] = (requestCounts[resource] ?? 0) + 1;
		const bodies: Record<string, unknown> = {
			gradebook: { xml: gradebookXml },
			attendance: {
				Absences: {},
				DailyRecords: [],
				TotalExcused: {},
				TotalTardies: {},
				TotalUnexcused: {},
				TotalActivities: {},
				TotalUnexcusedTardies: {}
			},
			documents: { StudentDocumentDatas: {} },
			messages: { InboxItemListings: { MessageXML: [] } },
			'student-info': {
				FormattedName: 'Student, Bhavith Example',
				PermID: 123456,
				Gender: '',
				Grade: 10,
				Photo: ''
			},
			calendar: { events: [] }
		};
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify(bodies[resource] ?? {})
		});
	});
});

async function boundingBox(page: Page, testId: string) {
	const box = await page.getByTestId(testId).boundingBox();
	expect(box, `${testId} should have a rendered box`).not.toBeNull();
	return box!;
}

test('desktop sidebar matches the redesigned workspace geometry and visual tokens', async ({
	page
}) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/documents');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByTestId('sidebar-course')).toHaveCount(6);

	const sidebar = await boundingBox(page, 'app-sidebar');
	expect(sidebar.x).toBe(0);
	expect(sidebar.y).toBe(0);
	expect(sidebar.width).toBe(240);
	expect(sidebar.height).toBe(900);
	await expect(page.getByTestId('app-sidebar')).toHaveCSS('position', 'fixed');
	await expect(page.getByTestId('app-sidebar')).toHaveCSS('overscroll-behavior-y', 'none');
	const spacer = await boundingBox(page, 'sidebar-layout-spacer');
	expect(spacer.x).toBe(0);
	expect(spacer.width).toBe(240);
	await expect(page.locator('[data-slot="sidebar-content"]')).toHaveCSS('overflow-y', 'hidden');

	const brand = await boundingBox(page, 'sidebar-brand');
	expect(brand.x).toBe(16);
	expect(brand.y).toBe(20);
	expect(brand.width).toBe(207);
	expect(brand.height).toBe(48);

	const logo = page.getByTestId('sidebar-brand').locator('img');
	await expect(logo).toHaveCSS('width', '32px');
	await expect(logo).toHaveCSS('height', '32px');
	const wordmark = page.getByTestId('sidebar-brand').locator(':scope > span.flex-1');
	await expect(wordmark).toHaveCSS('font-family', /^"Space Grotesk"/);
	await expect(wordmark).toHaveCSS('font-size', '20px');
	await expect(wordmark).toHaveCSS('font-weight', '700');
	await expect(page.getByTestId('sidebar-brand')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(page.getByTestId('sidebar-brand').locator('svg')).toHaveCount(0);

	const nav = await boundingBox(page, 'sidebar-primary-nav');
	expect(nav.x).toBe(16);
	expect(nav.y).toBe(brand.y + brand.height);
	expect(nav.width).toBe(207);
	const navItems = page.getByTestId('sidebar-primary-nav').locator('a');
	await expect(navItems).toHaveCount(6);
	for (const [testId, iconClass] of [
		['sidebar-nav-grades', 'lucide-book'],
		['sidebar-nav-rankings', 'lucide-chart-no-axes-column-increasing'],
		['sidebar-nav-attendance', 'lucide-calendar-check-2'],
		['sidebar-nav-documents', 'lucide-files'],
		['sidebar-nav-mail', 'lucide-mail-open'],
		['sidebar-nav-feedback', 'lucide-message-square-quote']
	] as const)
		await expect(page.getByTestId(testId).locator(`svg.${iconClass}`)).toHaveCount(1);
	for (const item of await navItems.all()) {
		const box = await item.boundingBox();
		expect(box?.width).toBe(207);
		expect(box?.height).toBe(36);
		await expect(item).toHaveCSS('font-size', '14px');
		await expect(item).toHaveCSS('border-radius', '6px');
	}

	const active = page.getByTestId('sidebar-nav-documents');
	await expect(active).toHaveAttribute('aria-current', 'page');
	await expect(active).toHaveCSS('color', 'rgb(110, 168, 220)');
	await expect(active).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(active).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');
	await expect(page.getByTestId('sidebar-nav-grades')).toHaveCSS('color', 'rgb(156, 174, 194)');

	const classes = await boundingBox(page, 'sidebar-classes');
	expect(classes.x).toBe(16);
	expect(classes.y).toBeGreaterThan(nav.y + nav.height);
	expect(classes.width).toBe(207);
	const classHeading = page.getByRole('heading', { name: 'Classes' });
	await expect(classHeading).toHaveCSS('font-size', '9px');
	await expect(classHeading).toHaveCSS('font-weight', '600');
	await expect(classHeading).toHaveCSS('letter-spacing', '1.62px');

	const classRows = page.getByTestId('sidebar-course');
	for (const row of await classRows.all()) {
		const box = await row.boundingBox();
		expect(box?.width).toBe(207);
		expect(box?.height).toBe(28);
		await expect(row).toHaveCSS('border-radius', '6px');
	}

	const privacy = await boundingBox(page, 'sidebar-privacy');
	const refresh = await boundingBox(page, 'sidebar-refresh');
	const utilities = await boundingBox(page, 'sidebar-utilities');
	const footer = await boundingBox(page, 'sidebar-profile-footer');
	expect(privacy.x).toBe(16);
	expect(privacy.width).toBe(207);
	expect(refresh.width).toBe(207);
	expect(refresh.height).toBe(48);
	await expect(page.getByTestId('sidebar-refresh')).toContainText('Data current');
	await expect(page.getByTestId('sidebar-refresh')).toContainText('Updated');
	await expect(page.getByTestId('sidebar-refresh').locator('svg.lucide-check')).toHaveCount(0);
	await expect(page.getByTestId('thinking-orb')).toBeVisible();
	await expect(page.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'breathing');
	await expect(page.getByTestId('thinking-orb')).toHaveCSS('width', '36px');
	await expect(page.getByTestId('thinking-orb')).toHaveCSS('height', '36px');
	expect(utilities.y).toBeGreaterThanOrEqual(classes.y + classes.height);
	expect(utilities.y + utilities.height).toBeLessThanOrEqual(footer.y);
	expect(footer.x).toBe(0);
	expect(footer.width).toBe(239);
	expect(footer.y + footer.height).toBe(900);
	await expect(page.getByTestId('sidebar-profile')).toContainText('Bhavith');
	await expect(page.getByTestId('sidebar-profile')).toContainText('Grade 10');
});

test('every sidebar action works and preserves a single active destination', async ({ page }) => {
	await page.goto('/grades');
	for (const [testId, path] of [
		['sidebar-nav-attendance', '/attendance'],
		['sidebar-nav-documents', '/documents'],
		['sidebar-nav-mail', '/mail'],
		['sidebar-nav-feedback', '/feedback'],
		['sidebar-nav-grades', '/grades']
	] as const) {
		await page.getByTestId(testId).click();
		await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`));
		await expect(page.getByTestId(testId)).toHaveAttribute('aria-current', 'page');
		await expect(
			page.getByTestId('sidebar-primary-nav').locator('[aria-current="page"]')
		).toHaveCount(1);
	}

	await page.getByTestId('sidebar-course').filter({ hasText: 'AP Calculus BC' }).click();
	await expect(page).toHaveURL(/\/grades\/calculus$/);
	await expect(
		page.getByTestId('sidebar-course').filter({ hasText: 'AP Calculus BC' })
	).toHaveAttribute('aria-current', 'page');

	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByTestId('sidebar-theme')).toHaveCount(0);

	const beforeRefresh = { ...requestCounts };
	await page.route('**/api/session/keepalive', async (route) => {
		await new Promise((resolve) => setTimeout(resolve, 200));
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ signedIn: true, updatedAt: Date.now() })
		});
	});
	await page.getByTestId('sidebar-refresh').click();
	await expect(page.getByTestId('thinking-orb')).toBeVisible();
	await expect(page.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'searching');
	await expect(page.getByTestId('sidebar-refresh')).toContainText('Checking grades and records…');
	await expect(page.getByTestId('sidebar-refresh')).toBeEnabled();
	await expect(page.getByTestId('thinking-orb')).toBeVisible();
	await expect(page.getByTestId('thinking-orb')).toHaveAttribute('data-state', 'breathing');
	await expect(page.getByTestId('sidebar-refresh')).toContainText('Data current');
	await expect(page.getByTestId('sidebar-refresh')).toContainText('Updated');
	for (const resource of ['gradebook', 'attendance', 'documents', 'messages', 'student-info'])
		await expect
			.poll(() => requestCounts[resource] ?? 0, {
				message: `${resource} should refresh after the sidebar action`
			})
			.toBeGreaterThan(beforeRefresh[resource] ?? 0);

	await page.getByTestId('sidebar-profile').click();
	await expect(page).toHaveURL(/\/studentinfo$/);
	await page.getByRole('button', { name: 'Log out', exact: true }).click();
	await expect(page).toHaveURL(/\/login$/);
});

test('hover, keyboard focus, and active-course states remain legible in dark mode', async ({
	page
}) => {
	await page.goto('/documents');
	const gradebook = page.getByTestId('sidebar-nav-grades');
	await expect(gradebook).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await gradebook.hover();
	await expect
		.poll(() => gradebook.evaluate((element) => getComputedStyle(element).backgroundColor))
		.not.toBe('rgba(0, 0, 0, 0)');
	await expect(gradebook).toHaveCSS('color', 'rgb(241, 245, 247)');

	await page.mouse.move(800, 500);
	await page.keyboard.press('Tab');
	await expect(gradebook).toBeFocused();
	await expect
		.poll(() => gradebook.evaluate((element) => getComputedStyle(element).boxShadow))
		.not.toBe('none');

	await page.goto('/grades/calculus');
	const activeCourse = page.getByTestId('sidebar-course').filter({ hasText: 'AP Calculus BC' });
	await expect(activeCourse).toHaveAttribute('aria-current', 'page');
	await expect(page.getByTestId('sidebar-nav-grades')).not.toHaveAttribute('aria-current', 'page');
	await expect(page.getByTestId('sidebar-nav-grades')).toHaveCSS(
		'background-color',
		'rgba(0, 0, 0, 0)'
	);
	await expect(activeCourse).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(activeCourse).toHaveCSS('color', 'rgb(110, 168, 220)');
	await expect(activeCourse).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0)');

	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(activeCourse).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await expect(activeCourse).toHaveCSS('color', 'rgb(110, 168, 220)');
	await expect(page.getByTestId('app-sidebar')).toHaveCSS('background-color', 'rgb(11, 24, 34)');
	await expect(page.getByTestId('sidebar-privacy')).toHaveCSS('border-top-width', '0px');
	const privacyLink = page.getByTestId('sidebar-privacy-link');
	await expect(privacyLink).toHaveCSS('white-space', 'nowrap');
	await privacyLink.focus();
	await expect
		.poll(() => privacyLink.evaluate((element) => getComputedStyle(element).boxShadow))
		.not.toBe('none');
});

test('sidebar remains usable at short desktop heights and switches cleanly at the breakpoint', async ({
	page
}) => {
	await page.setViewportSize({ width: 1024, height: 640 });
	await page.goto('/grades');
	await expect(page.getByTestId('app-sidebar')).toBeVisible();
	await expect(page.getByTestId('sidebar-profile-footer')).toBeVisible();

	const content = page.locator('[data-slot="sidebar-content"]');
	const overflow = await content.evaluate((element) => ({
		clientHeight: element.clientHeight,
		scrollHeight: element.scrollHeight,
		clientWidth: element.clientWidth,
		scrollWidth: element.scrollWidth
	}));
	expect(overflow.scrollHeight).toBeLessThanOrEqual(overflow.clientHeight);
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
	await expect(content).toHaveCSS('overflow-y', 'hidden');
	await expect(content).toHaveCSS('overscroll-behavior-y', 'none');
	await expect(page.getByTestId('sidebar-refresh')).toBeVisible();
	await expect(page.getByTestId('sidebar-brand')).toBeVisible();

	await expect(page.getByRole('button', { name: 'Toggle Sidebar' })).toHaveCount(0);
	await expect(page.getByTestId('sidebar-primary-nav')).toBeVisible();
	await expect(page.getByTestId('sidebar-classes')).toBeVisible();
	await expect(page.getByTestId('sidebar-utilities')).toBeVisible();

	await page.setViewportSize({ width: 767, height: 640 });
	await expect(page.getByTestId('app-sidebar')).toBeHidden();
	await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();

	await page.setViewportSize({ width: 768, height: 640 });
	await expect(page.getByTestId('app-sidebar')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
});

test('desktop sidebar persists while the main content pane scrolls', async ({ page }) => {
	await page.setViewportSize({ width: 1024, height: 640 });
	await page.goto('/grades');
	await expect(page.getByTestId('sidebar-course')).toHaveCount(6);

	const sidebarBefore = await boundingBox(page, 'app-sidebar');
	const brandBefore = await boundingBox(page, 'sidebar-brand');
	const content = page.getByTestId('app-content-scroll');
	const contentBefore = await boundingBox(page, 'app-content-scroll');
	expect(contentBefore.x).toBe(240);
	await expect(content).toHaveCSS('overflow-y', 'auto');
	await expect(content).toHaveCSS('overscroll-behavior-y', 'auto');
	await expect(page.locator('html')).toHaveCSS('overscroll-behavior-y', 'auto');
	await expect(page.locator('body')).toHaveCSS('overscroll-behavior-y', 'auto');

	const scrollState = await content.evaluate((element) => {
		element.scrollTop = Math.min(500, element.scrollHeight - element.clientHeight);
		return {
			scrollTop: element.scrollTop,
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight
		};
	});
	expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
	expect(scrollState.scrollTop).toBeGreaterThan(0);

	const sidebarContent = page.locator('[data-slot="sidebar-content"]');
	const sidebarScrollTopBefore = await sidebarContent.evaluate((element) => element.scrollTop);
	await page.mouse.move(120, 320);
	await page.mouse.wheel(0, 500);
	await expect
		.poll(() => sidebarContent.evaluate((element) => element.scrollTop))
		.toBe(sidebarScrollTopBefore);

	const sidebarAfter = await boundingBox(page, 'app-sidebar');
	const brandAfter = await boundingBox(page, 'sidebar-brand');
	expect(sidebarAfter).toEqual(sidebarBefore);
	expect(brandAfter).toEqual(brandBefore);
	expect(sidebarAfter.y).toBe(0);
});
