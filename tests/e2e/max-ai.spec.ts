import { expect, test } from '@playwright/test';

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

interface MaxRequestBody {
	studentDataContext?: { screen?: string; courses?: { course: string }[] } | null;
	userQuery?: string;
	history?: { role: string; text: string }[];
	stream?: boolean;
}

let maxBodies: MaxRequestBody[];

test.beforeEach(async ({ page }) => {
	maxBodies = [];
	await page.addInitScript(() => {
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'max-ai-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'max-ai-preview-session'
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
				username: 'max-ai-preview',
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
test('the Max AI sidebar tab opens the full-bleed chat with its empty state and privacy line', async ({
	page
}) => {
	await page.goto('/grades');
	await page.getByTestId('sidebar-nav-max').click();
	await expect(page).toHaveURL(/\/max$/);
	await expect(page.getByTestId('sidebar-nav-max')).toHaveAttribute('aria-current', 'page');

	await expect(page.getByTestId('max-chat-window')).toBeVisible();
	await expect(page.getByText('ask max.')).toBeVisible();
	await expect(page.getByText('max can make mistakes — double-check the math.')).toBeVisible();
	await expect(page.getByTestId('max-chat-input')).toHaveAttribute(
		'placeholder',
		'ask max anything…'
	);
	await expect(page.getByTestId('max-chat-send')).toBeDisabled();
	await expect(page.getByText(/never your name, ID, or photo/)).toBeVisible();

	// The chat fills the whole content area edge to edge.
	const panel = page.getByTestId('max-ai-panel');
	const box = (await panel.boundingBox())!;
	expect(box.height).toBeGreaterThan(500);
	const chat = (await page.getByTestId('max-chat-window').boundingBox())!;
	expect(chat.width).toBeCloseTo(box.width, 0);
	expect(chat.height).toBeCloseTo(box.height, 0);
});

test('asking Max streams a reply and ships the compact, non-identifying grade context', async ({
	page
}) => {
	await page.route('**/api/max', (route) => {
		maxBodies.push(route.request().postDataJSON() as MaxRequestBody);
		route.fulfill({
			status: 200,
			contentType: 'text/event-stream; charset=utf-8',
			body:
				'data: {"t":"Aiming"}\n\n' +
				'data: {"t":" for a **93.5%** on the final."}\n\n' +
				'data: {"done":true,"text":"Aiming for a **93.5%** on the final.","provider":"groq","model":"test-model","usage":null}\n\n'
		});
	});

	await page.goto('/max');
	const input = page.getByTestId('max-chat-input');
	await input.fill('what do I need on the final?');
	await input.press('Enter');

	await expect(page.getByText('what do I need on the final?')).toBeVisible();
	await expect(page.getByText('Aiming for a 93.5% on the final.')).toBeVisible();
	// Max's markdown renders as real elements, not literal asterisks.
	await expect(page.getByTestId('max-chat-window').locator('strong')).toHaveText('93.5%');
	await expect(page.getByText('**93.5%**')).toHaveCount(0);
	await expect(page.getByText('groq · test-model')).toBeVisible();
	await expect(input).toBeEnabled();

	expect(maxBodies).toHaveLength(1);
	const [first] = maxBodies;
	expect(first?.stream).toBe(true);
	expect(first?.userQuery).toBe('what do I need on the final?');
	expect(first?.studentDataContext?.screen).toBe('max-ai');
	expect(first?.studentDataContext?.courses?.map((course) => course.course)).toContain(
		'AP Calculus BC'
	);
	// No identifying student fields may ride along with the context.
	const serialized = JSON.stringify(first?.studentDataContext ?? {});
	expect(serialized).not.toContain('Bhavith');
	expect(serialized).not.toContain('123456');
	expect(serialized).not.toContain('PermID');
	expect(serialized).not.toContain('Photo');

	// A second question carries the recent turns as stateless history.
	await input.fill('and if I skip the homework?');
	await input.press('Enter');
	await expect(page.getByText('and if I skip the homework?')).toBeVisible();
	await expect.poll(() => maxBodies.length).toBe(2);
	expect(maxBodies[1]?.history).toEqual([
		{ role: 'user', text: 'what do I need on the final?' },
		{ role: 'max', text: 'Aiming for a **93.5%** on the final.' }
	]);
});

test('a failed Max request shows as a system line and keeps the chat usable', async ({ page }) => {
	await page.route('**/api/max', (route) =>
		route.fulfill({
			status: 503,
			contentType: 'application/json',
			body: JSON.stringify({
				error:
					'No provider keys configured. Set GROQ_API_KEYS / OPENROUTER_API_KEYS / MISTRAL_API_KEYS (comma-separated lists) in the server environment.',
				type: 'NotConfigured',
				retryable: false
			})
		})
	);

	await page.goto('/max');
	const input = page.getByTestId('max-chat-input');
	await input.fill('hello?');
	await input.press('Enter');

	await expect(page.getByText('hello?')).toBeVisible();
	await expect(page.getByText(/No provider keys configured/)).toBeVisible();
	await expect(input).toBeEnabled();
	await expect(page.getByTestId('max-chat-send')).toBeDisabled();
});
