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
		localStorage.setItem('mode-watcher-mode', 'dark');
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

test('desktop sidebar matches the 240px reference geometry and visual tokens', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/documents');
	await expect(page.locator('html')).toHaveClass(/dark/);
	await expect(page.getByTestId('sidebar-course')).toHaveCount(6);

	const sidebar = await boundingBox(page, 'app-sidebar');
	expect(sidebar.x).toBe(0);
	expect(sidebar.y).toBe(0);
	expect(sidebar.width).toBe(240);
	expect(sidebar.height).toBe(900);

	const brand = await boundingBox(page, 'sidebar-brand');
	expect(brand.x).toBe(14);
	expect(brand.y).toBe(20);
	expect(brand.width).toBe(211);
	expect(brand.height).toBeCloseTo(48.5, 0);

	const logo = page.getByTestId('sidebar-brand').locator('img');
	await expect(logo).toHaveCSS('width', '32px');
	await expect(logo).toHaveCSS('height', '32px');
	const wordmark = page.getByTestId('sidebar-brand').locator(':scope > span');
	await expect(wordmark).toHaveCSS('font-family', /^"Space Grotesk"/);
	await expect(wordmark).toHaveCSS('font-size', '19px');
	await expect(wordmark).toHaveCSS('font-weight', '700');

	const nav = await boundingBox(page, 'sidebar-primary-nav');
	expect(nav.x).toBe(14);
	expect(nav.y).toBeCloseTo(96.5, 0);
	expect(nav.width).toBe(211);
	const navItems = page.getByTestId('sidebar-primary-nav').locator('a');
	await expect(navItems).toHaveCount(5);
	for (const item of await navItems.all()) {
		const box = await item.boundingBox();
		expect(box?.width).toBe(211);
		expect(box?.height).toBe(37);
		await expect(item).toHaveCSS('font-size', '14px');
		await expect(item).toHaveCSS('font-weight', '600');
		await expect(item).toHaveCSS('border-radius', '8px');
	}

	const active = page.getByTestId('sidebar-nav-documents');
	await expect(active).toHaveAttribute('aria-current', 'page');
	await expect(active).toHaveCSS('color', 'rgb(110, 168, 220)');
	await expect(active).toHaveCSS('background-color', 'rgba(110, 168, 220, 0.12)');
	await expect(page.getByTestId('sidebar-nav-grades')).toHaveCSS('color', 'rgb(154, 170, 180)');

	const classes = await boundingBox(page, 'sidebar-classes');
	expect(classes.x).toBe(14);
	expect(classes.y).toBeCloseTo(315.25, 0);
	expect(classes.width).toBe(211);
	const classHeading = page.getByRole('heading', { name: 'Classes' });
	await expect(classHeading).toHaveCSS('font-size', '11px');
	await expect(classHeading).toHaveCSS('font-weight', '600');
	await expect(classHeading).toHaveCSS('letter-spacing', '1.1px');

	const classRows = page.getByTestId('sidebar-course');
	for (const row of await classRows.all()) {
		const box = await row.boundingBox();
		expect(box?.width).toBe(211);
		expect(box?.height).toBe(29);
		await expect(row).toHaveCSS('border-radius', '7px');
	}

	const privacy = await boundingBox(page, 'sidebar-privacy');
	const utilities = await boundingBox(page, 'sidebar-utilities');
	const footer = await boundingBox(page, 'sidebar-profile-footer');
	expect(privacy.x).toBe(14);
	expect(privacy.width).toBe(211);
	expect(utilities.y).toBeGreaterThan(classes.y + classes.height);
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

	await page.getByRole('button', { name: 'Light', exact: true }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await page.getByRole('button', { name: 'Dark', exact: true }).click();
	await expect(page.locator('html')).toHaveClass(/dark/);

	const beforeRefresh = { ...requestCounts };
	await page.getByTestId('sidebar-refresh').click();
	await expect(page.getByTestId('sidebar-refresh')).toBeEnabled();
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

test('hover, keyboard focus, active-course, and light-mode states remain legible', async ({
	page
}) => {
	await page.goto('/documents');
	const gradebook = page.getByTestId('sidebar-nav-grades');
	await expect(gradebook).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
	await gradebook.hover();
	await expect(gradebook).toHaveCSS('background-color', 'rgba(110, 168, 220, 0.12)');
	await expect(gradebook).toHaveCSS('color', 'rgb(110, 168, 220)');

	await page.mouse.move(800, 500);
	await page.keyboard.press('Tab');
	await expect(page.getByTestId('sidebar-brand')).toBeFocused();
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
		'rgba(110, 168, 220, 0.12)'
	);
	await expect(activeCourse).toHaveCSS('background-color', 'rgba(110, 168, 220, 0.12)');
	await expect(activeCourse).toHaveCSS('color', 'rgb(110, 168, 220)');

	await page.getByRole('button', { name: 'Light', exact: true }).click();
	await expect(page.locator('html')).not.toHaveClass(/dark/);
	await expect(activeCourse).toHaveCSS('background-color', 'rgba(10, 115, 178, 0.1)');
	await expect(activeCourse).toHaveCSS('color', 'rgb(10, 115, 178)');
	await expect(page.locator('[data-slot="sidebar-inner"]')).toHaveCSS(
		'background-color',
		'rgb(245, 249, 253)'
	);
	await expect(page.getByTestId('sidebar-privacy')).toHaveCSS(
		'border-color',
		'rgba(15, 28, 46, 0.09)'
	);
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
	expect(overflow.scrollHeight).toBeGreaterThanOrEqual(overflow.clientHeight);
	expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
	await page.getByTestId('sidebar-refresh').scrollIntoViewIfNeeded();
	await expect(page.getByTestId('sidebar-refresh')).toBeVisible();
	await expect(page.getByTestId('sidebar-brand')).toBeVisible();

	await page.setViewportSize({ width: 767, height: 640 });
	await expect(page.getByTestId('app-sidebar')).toBeHidden();
	await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();

	await page.setViewportSize({ width: 768, height: 640 });
	await expect(page.getByTestId('app-sidebar')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeHidden();
});
