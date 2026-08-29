import { chromium } from '@playwright/test';

const {
	STUDENTVUE_USERNAME: username,
	STUDENTVUE_PASSWORD: password,
	DISTRICT_URL: district
} = process.env;
if (!username || !password || !district)
	throw new Error('StudentVUE environment variables are required.');

const browser = await chromium.launch({
	headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const context = await browser.newContext();
const page = await context.newPage();
const calls = [];

function keys(value, depth = 0) {
	if (depth > (Number(process.env.TRACE_DEPTH) || 3)) return typeof value;
	if (Array.isArray(value))
		return { array: value.length, item: value.length ? keys(value[0], depth + 1) : null };
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, keys(item, depth + 1)])
		);
	return typeof value;
}

function requestContract(value) {
	if (Array.isArray(value)) return value.slice(0, 20).map(requestContract);
	if (!value || typeof value !== 'object') return typeof value;
	return Object.fromEntries(
		Object.entries(value).map(([key, item]) => {
			if (
				/^(?:FriendlyName|Method|methodName|className|namespace|dataRequestType|dataSourceTypeName|control)$/i.test(
					key
				)
			) {
				return [key, typeof item === 'string' ? item : typeof item];
			}
			return [key, requestContract(item)];
		})
	);
}

page.on('response', async (response) => {
	const url = new URL(response.url());
	if (url.origin !== new URL(district).origin) return;
	if (!/\/(?:service\/PXP2Communication|st_api|api\/GB)\//i.test(url.pathname)) return;
	const request = response.request();
	let requestShape;
	let responseShape;
	try {
		requestShape = requestContract(request.postDataJSON());
	} catch {
		requestShape = request.postData() ? 'encoded' : null;
	}
	try {
		const contentType = response.headers()['content-type'] ?? '';
		if (contentType.includes('json')) responseShape = keys(await response.json());
		else responseShape = contentType.split(';')[0];
	} catch {
		responseShape = 'unreadable';
	}
	calls.push({
		page: page.url().split('/').at(-1),
		method: request.method(),
		path: url.pathname,
		action: url.searchParams.get('action'),
		status: response.status(),
		request: requestShape,
		response: responseShape
	});
});

try {
	const base = new URL(district);
	await page.goto(new URL('/PXP2_Login_Student.aspx?regenerateSessionId=true', base).href);
	await page.locator('input[name="ctl00$MainContent$username"]').fill(username);
	await page.locator('input[name="ctl00$MainContent$password"]').fill(password);
	await page.locator('input[name="ctl00$MainContent$Submit1"]').click();
	await page.waitForURL((url) => !url.pathname.includes('Login'), { timeout: 45_000 });

	const pages = [
		'PXP2_Gradebook.aspx?AGU=0',
		'PXP2_Attendance.aspx?AGU=0',
		'PXP2_Student.aspx?AGU=0',
		'PXP2_Documents.aspx?AGU=0',
		'PXP2_Messages.aspx?AGU=0',
		'PXP2_Calendar.aspx?AGU=0',
		'PXP2_ReportCard.aspx?AGU=0',
		'PXP2_ClassSchedule.aspx?AGU=0',
		'PXP2_SchoolInformation.aspx?AGU=0'
	].filter(
		(path) =>
			!process.env.TRACE_PAGES ||
			process.env.TRACE_PAGES.split(',').some((name) => path.includes(name))
	);
	const summaries = [];
	for (const path of pages) {
		const response = await page.goto(new URL(`/${path}`, base).href, { waitUntil: 'networkidle' });
		if (path.includes('Attendance')) {
			const detail = page.locator('button[aria-label="Show Course Details"]:visible').first();
			if (await detail.count()) {
				await detail.click({ force: true });
				await page.waitForTimeout(1_000);
			}
		}
		const html = await page.content();
		const variables = [
			...new Set([...html.matchAll(/\b(PXP\.[A-Za-z0-9_.]+)\s*=\s*/g)].map((match) => match[1]))
		].sort();
		const globals = await page.evaluate(() => {
			const pxp = globalThis.PXP ?? {};
			return {
				CalendarData: pxp.CalendarData,
				GradesData: pxp.GradesData,
				SchedCalendarData: pxp.SchedCalendarData,
				TodayContent: pxp.TodayContent,
				StudentAttendanceData: pxp.StudentAttendanceData
			};
		});
		const contracts = Object.fromEntries(
			Object.entries(globals)
				.filter(([, value]) => value !== undefined)
				.map(([name, value]) => [name, keys(value)])
		);
		const fieldLabels = await page
			.locator('.tbl_label, th, label')
			.evaluateAll((nodes) =>
				[
					...new Set(
						nodes
							.map((node) => node.textContent?.replace(/\s+/g, ' ').replace(/:\s*$/, '').trim())
							.filter(Boolean)
					)
				].slice(0, 100)
			);
		const tables = await page.locator('table').evaluateAll((nodes) =>
			nodes
				.map((table) => ({
					id: table.id,
					classes: table.className,
					headers: [...table.querySelectorAll('th')].map((cell) =>
						cell.textContent?.replace(/\s+/g, ' ').trim()
					),
					rowCount: table.querySelectorAll('tbody tr').length,
					firstRow: [...(table.querySelector('tbody tr')?.children ?? [])].map((cell) => ({
						tag: cell.tagName,
						classes: cell.className,
						attributes: [...cell.attributes]
							.map((attribute) => attribute.name)
							.filter((name) => name.startsWith('data-'))
					}))
				}))
				.filter((table) => table.headers.length || table.rowCount)
		);
		const attendanceStructure = path.includes('Attendance')
			? await page
					.locator('table.table-striped')
					.first()
					.evaluate((table) => {
						const describe = (element) => ({
							tag: element.tagName,
							id: element.id,
							classes: element.className,
							children: [...element.children].map((child) => ({
								tag: child.tagName,
								id: child.id,
								classes: child.className
							}))
						});
						const chain = [];
						let cursor = table;
						for (let index = 0; cursor && index < 6; index += 1, cursor = cursor.parentElement)
							chain.push(describe(cursor));
						return {
							chain,
							rows: [...table.querySelectorAll(':scope > tbody > tr')].slice(0, 8).map((row) => ({
								classes: row.className,
								cells: [...row.children].map((cell) => ({
									tag: cell.tagName,
									classes: cell.className,
									hasButton: Boolean(cell.querySelector('button')),
									textLength: cell.textContent?.replace(/\s+/g, ' ').trim().length,
									childTags: [...cell.children].map((child) => child.tagName)
								})),
								buttons: [...row.querySelectorAll('button')].map((button) => ({
									classes: button.className,
									attributes: [...button.attributes]
										.map((attribute) => attribute.name)
										.filter((name) => name.startsWith('data-'))
								})),
								nestedHeaders: [...row.querySelectorAll('table')].map((nested) =>
									[...nested.querySelectorAll('th')].map((cell) =>
										cell.textContent?.replace(/\s+/g, ' ').trim()
									)
								)
							}))
						};
					})
			: undefined;
		const controls = await page
			.locator('button, input[type="button"], input[type="submit"], main a, #content a')
			.evaluateAll((nodes) =>
				nodes
					.map((node) => ({
						tag: node.tagName,
						id: node.id,
						classes: node.className,
						aria: node.getAttribute('aria-label'),
						hrefPath:
							node instanceof HTMLAnchorElement && node.href ? new URL(node.href).pathname : null
					}))
					.filter(
						(item) =>
							item.id ||
							item.aria ||
							(item.hrefPath && !/^\/(?:PXP2_|Home_|Login_|accessibility)/.test(item.hrefPath))
					)
					.slice(0, 40)
			);
		summaries.push({
			path,
			status: response?.status(),
			finalPath: new URL(page.url()).pathname,
			variables,
			contracts,
			fieldLabels,
			attendanceStructure,
			tables: process.env.TRACE_STRUCTURE_ONLY ? undefined : tables,
			controls: process.env.TRACE_STRUCTURE_ONLY ? undefined : controls
		});
	}
	console.log(JSON.stringify({ pages: summaries, calls }, null, 2));
} finally {
	await context.close();
	await browser.close();
}
