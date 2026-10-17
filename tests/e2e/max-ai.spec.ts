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
	action?: string;
	conversationMemory?: { title: string; messages: { role: string; text: string }[] }[];
	studentDataContext?: {
		screen?: string;
		courses?: { course: string }[];
		gpa?: { displayUnweighted: string; displayWeighted: string };
		attendance?: { status: string; courseTotals: { present: number; tardy: number }[] };
		schedule?: { classes: { startTime: string }[] };
	} | null;
	userQuery?: string;
	history?: { role: string; text: string }[];
	stream?: boolean;
}

let maxBodies: MaxRequestBody[];

test.beforeEach(async ({ page }) => {
	maxBodies = [];
	await page.addInitScript(() => {
		if (!localStorage.getItem('token'))
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
				CourseTotals: [
					{ Course: 'AP Calculus BC', Present: 25, Tardy: 2, Absent: 1, Excused: 1, Unexcused: 0 }
				],
				DailyRecords: [],
				TotalExcused: {},
				TotalTardies: {},
				TotalUnexcused: {},
				TotalActivities: {},
				TotalUnexcusedTardies: {}
			},
			schedule: {
				date: '2026-10-16',
				classes: [
					{
						period: '1',
						courseTitle: 'AP Calculus BC',
						startTime: '08:30',
						endTime: '09:30',
						teacher: 'Synthetic private teacher',
						teacherEmail: 'private@example.test',
						room: '101',
						schoolName: 'Synthetic school',
						date: '2026-10-16'
					}
				]
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
test('the Max AI sidebar tab opens the full-bleed chat with its empty state and uncluttered composer', async ({
	page
}) => {
	await page.goto('/grades');
	await page.getByTestId('sidebar-nav-max').click();
	await expect(page).toHaveURL(/\/max$/);
	await expect(page.getByTestId('sidebar-nav-max')).toHaveAttribute('aria-current', 'page');

	await expect(page.getByTestId('max-chat-window')).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Ask Max', exact: true })).toBeVisible();
	await expect(page.getByText(/Max can make mistakes/)).toHaveCount(0);
	await expect(page.getByText(/Share this question/)).toHaveCount(0);
	await expect(page.getByTestId('max-chat-input')).toHaveAttribute(
		'placeholder',
		'Ask Max anything…'
	);
	await expect(page.getByTestId('max-chat-send')).toBeDisabled();
	await expect(page.getByText(/relevant saved-chat excerpts/)).toHaveCount(0);

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
		if (route.request().postDataJSON().action === 'title')
			return route.fulfill({ json: { title: 'Final Grade Strategy' } });
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

	await expect(page.getByRole('log').getByText('what do I need on the final?')).toBeVisible();
	await expect(page.getByText('Aiming for a 93.5% on the final.')).toBeVisible();
	// Max's markdown renders as real elements, not literal asterisks.
	await expect(page.getByTestId('max-chat-window').locator('strong')).toHaveText('93.5%');
	await expect(page.getByText('**93.5%**')).toHaveCount(0);
	await expect(page.getByText('groq · test-model')).toHaveCount(0);
	await expect(input).toBeEnabled();

	expect(maxBodies).toHaveLength(1);
	const [first] = maxBodies;
	expect(first?.stream).toBe(true);
	expect(first?.studentDataContext?.gpa).toMatchObject({
		displayUnweighted: '4.00',
		displayWeighted: '4.50'
	});
	expect(first?.studentDataContext?.attendance).toMatchObject({
		status: 'available',
		courseTotals: [{ course: 'AP Calculus BC', present: 25, tardy: 2, absent: 1 }]
	});
	expect(first?.studentDataContext?.schedule?.classes[0]?.startTime).toBe('08:30');
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
	expect(serialized).not.toContain('Synthetic private teacher');
	expect(serialized).not.toContain('private@example.test');

	// A second question carries the recent turns as stateless history.
	await input.fill('and if I skip the homework?');
	await input.press('Enter');
	await expect(page.getByText('and if I skip the homework?')).toBeVisible();
	await expect.poll(() => maxBodies.length).toBe(2);
	expect(maxBodies[1]?.history).toEqual([
		{ role: 'user', text: 'what do I need on the final?' },
		{ role: 'assistant', text: 'Aiming for a **93.5%** on the final.' }
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

	await expect(page.getByRole('log').getByText('hello?')).toBeVisible();
	await expect(page.getByText(/No provider keys configured/)).toBeVisible();
	await expect(input).toBeEnabled();
	await expect(page.getByTestId('max-chat-send')).toBeDisabled();
});

test('Max fits phone and desktop panes while long replies keep the composer accessible', async ({
	page
}) => {
	await page.route('**/api/max', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: `data: ${JSON.stringify({ done: true, text: 'A useful explanation. '.repeat(250), provider: 'provider', model: 'a-very-long-model-label-that-must-fit' })}`
		})
	);
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('Explain my options');
	await page.getByTestId('max-chat-send').click();
	await expect(page.getByRole('log')).toContainText('A useful explanation.');
	for (const width of [320, 375, 414, 768, 1440]) {
		await page.setViewportSize({ width, height: 827 });
		await expect(page.getByTestId('max-chat-input')).toBeInViewport();
		await expect(page.getByTestId('max-chat-send')).toBeInViewport();
		await expect
			.poll(() =>
				page.getByRole('log').evaluate((log) => log.scrollHeight - log.clientHeight - log.scrollTop)
			)
			.toBeLessThanOrEqual(2);
		const geometry = await page.getByTestId('max-ai-panel').evaluate((panel) => {
			const box = panel.getBoundingClientRect();
			return {
				right: box.right,
				viewport: innerWidth,
				overflow: panel.scrollWidth > panel.clientWidth
			};
		});
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewport);
		expect(geometry.overflow).toBe(false);
	}
	const log = page.getByRole('log');
	await log.hover();
	await page.mouse.wheel(0, -10000);
	await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(0);
	await page.setViewportSize({ width: 1024, height: 700 });
	await expect.poll(() => log.evaluate((element) => element.scrollTop)).toBe(0);
	await page.getByTestId('max-chat-input').fill('Another question');
	await page.getByTestId('max-chat-send').click();
	await expect(page.locator('.max-reply')).toHaveCount(2);
	await expect
		.poll(() =>
			log.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop)
		)
		.toBeLessThanOrEqual(2);
});

test('a truncated stream keeps its partial answer and reports interruption', async ({ page }) => {
	await page.route('**/api/max', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: 'data: {"t":"Partial answer"}\n\n'
		})
	);
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('Explain');
	await page.getByTestId('max-chat-send').click();
	await expect(page.getByRole('log')).toContainText('Partial answer');
	await expect(page.getByRole('log')).toContainText('The reply was interrupted.');
	await expect(page.getByTestId('max-chat-input')).toBeEnabled();
});

test('Max can open directly and marks failed attendance unavailable while keeping app grades', async ({
	page
}) => {
	await page.route('**/api/studentvue/attendance', (route) =>
		route.fulfill({
			status: 502,
			contentType: 'application/json',
			body: JSON.stringify({ error: 'Synthetic unavailable attendance' })
		})
	);
	await page.route('**/api/max', (route) => {
		if (route.request().postDataJSON().action === 'title')
			return route.fulfill({ json: { title: 'Final Grade Strategy' } });
		maxBodies.push(route.request().postDataJSON() as MaxRequestBody);
		return route.fulfill({
			status: 200,
			contentType: 'text/event-stream',
			body: 'data: {"done":true,"text":"Attendance is unavailable; please refresh it. Your GPA estimate is 4.00.","provider":"test","model":"test"}\n\n'
		});
	});
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('What are my GPA and attendance?');
	await expect(page.getByTestId('max-chat-send')).toBeEnabled();
	await page.getByTestId('max-chat-input').press('Enter');
	await expect(page.locator('.max-reply')).toContainText('Attendance is unavailable');
	expect(maxBodies[0]?.studentDataContext?.attendance?.status).toBe('unavailable');
	expect(maxBodies[0]?.studentDataContext?.gpa?.displayUnweighted).toBe('4.00');
});

async function openChatSidebar(page: import('@playwright/test').Page) {
	const shell = page.getByTestId('max-chat-window');
	const width = (await shell.boundingBox())!.width;
	await expect(shell).toHaveAttribute('data-chat-layout', width < 720 ? 'drawer' : 'inline');
	const opener = page.getByRole('button', { name: 'Open chat sidebar', exact: true });
	if (await opener.isVisible()) await opener.click();
	return page.getByRole('complementary', { name: 'Chat history' });
}

test('dedicated sidebar names chats, restores encrypted history and supplies relevant previous context', async ({
	page
}) => {
	let namingCalls = 0;
	const requests: MaxRequestBody[] = [];
	await page.route('**/api/max', async (route) => {
		const body = route.request().postDataJSON();
		if (body.action === 'title') {
			namingCalls++;
			return route.fulfill({
				json: {
					title: body.userQuery.includes('Biology') ? 'Biology Recovery Plan' : 'Study Check In'
				}
			});
		}
		requests.push(body);
		return route.fulfill({
			contentType: 'text/event-stream',
			body: `data: ${JSON.stringify({ done: true, text: 'Let’s use your app records to plan your next step.', provider: 'test', model: 'test' })}\n\n`
		});
	});
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('Biology goal: improve my lab work');
	await page.getByTestId('max-chat-send').click();
	let sidebar = await openChatSidebar(page);
	await expect(
		sidebar.getByRole('button', { name: 'Biology Recovery Plan', exact: true })
	).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith('maxChats.v1.')))
		)
		.toBe(true);
	const encrypted = await page.evaluate(() =>
		Object.entries(localStorage)
			.filter(([key]) => key.startsWith('maxChats.v1.'))
			.map(([, value]) => value)
			.join('')
	);
	expect(encrypted).not.toContain('Biology');
	expect(encrypted).not.toContain('app records');
	const extractable = await page.evaluate(
		() =>
			new Promise<boolean>((resolve, reject) => {
				const request = indexedDB.open('grademaxxing-max-chats', 1);
				request.onerror = () => reject(new Error('Could not open chat key store'));
				request.onsuccess = () => {
					const database = request.result;
					const read = database.transaction('keys').objectStore('keys').getAll();
					read.onsuccess = () => {
						resolve(read.result.some((key: CryptoKey) => key.extractable));
						database.close();
					};
				};
			})
	);
	expect(extractable).toBe(false);
	await page.reload();
	await expect(page.getByRole('log')).toContainText('Biology goal: improve my lab work');
	sidebar = await openChatSidebar(page);
	await expect(
		sidebar.getByRole('button', { name: 'Biology Recovery Plan', exact: true })
	).toBeVisible();
	await sidebar.getByRole('button', { name: 'New chat', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Ask Max' })).toBeVisible();
	await page.getByTestId('max-chat-input').fill('What was my Biology goal from our previous chat?');
	await page.getByTestId('max-chat-send').click();
	await expect(page.locator('.max-reply')).toBeVisible();
	expect(requests[1]?.conversationMemory?.[0]?.messages).toContainEqual({
		role: 'user',
		text: 'Biology goal: improve my lab work'
	});
	expect(requests[1]?.history).toEqual([]);
	await expect.poll(() => namingCalls).toBe(2);
	await page.getByTestId('max-chat-input').fill('Continue that plan');
	await page.getByTestId('max-chat-send').click();
	await expect(page.locator('.max-reply')).toHaveCount(2);
	expect(namingCalls).toBe(2);
	sidebar = await openChatSidebar(page);
	await sidebar.getByRole('button', { name: 'Clear chat history', exact: true }).click();
	await sidebar.getByRole('button', { name: 'Delete all chats', exact: true }).click();
	await expect(sidebar.getByText('Your grade chats will show up here.')).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Ask Max' })).toBeVisible();
});

test('late model titles cannot resurrect deleted chats and compact sidebar dismisses with keyboard', async ({
	page
}) => {
	let finishNaming: (() => void) | undefined;
	const pending = new Promise<void>((resolve) => (finishNaming = resolve));
	await page.route('**/api/max', async (route) => {
		if (route.request().postDataJSON().action === 'title') {
			await pending;
			return route.fulfill({ json: { title: 'Deleted Chat Title' } }).catch(() => undefined);
		}
		return route.fulfill({
			contentType: 'text/event-stream',
			body: 'data: {"done":true,"text":"A short answer."}\n\n'
		});
	});
	await page.setViewportSize({ width: 375, height: 827 });
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('A temporary conversation');
	await page.getByTestId('max-chat-send').click();
	await expect(page.locator('.max-reply')).toHaveText('A short answer.');
	let sidebar = await openChatSidebar(page);
	await sidebar
		.getByRole('button', { name: 'Delete chat: A temporary conversation', exact: true })
		.click();
	finishNaming?.();
	await expect(sidebar.getByText('Your grade chats will show up here.')).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Open chat sidebar' })).toBeFocused();
	for (const width of [320, 375, 414, 768, 1440]) {
		await page.setViewportSize({ width, height: 827 });
		sidebar = await openChatSidebar(page);
		await expect(sidebar).toBeVisible();
		await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeCloseTo(260, 0);
		const bounds = await sidebar.boundingBox();
		expect(bounds!.x).toBeGreaterThanOrEqual(0);
		expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
		if ([375, 1440].includes(width))
			await page.screenshot({ path: `.local/max-validation/chat-sidebar-${width}.png` });
		await sidebar.getByRole('button', { name: 'Close chat sidebar' }).click();
		await expect(page.getByTestId('max-chat-send')).toBeInViewport();
		expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
			false
		);
	}
	await page.reload();
	await expect(page.getByRole('log')).not.toContainText('temporary conversation');
});

test('blocked chat storage keeps Max usable and reports unsaved conversations', async ({
	page
}) => {
	await page.addInitScript(() => {
		const original = Storage.prototype.setItem;
		Storage.prototype.setItem = function (key, value) {
			if (key.startsWith('maxChats.v1.'))
				throw new DOMException('Synthetic storage failure', 'QuotaExceededError');
			return original.call(this, key, value);
		};
	});
	await page.route('**/api/max', (route) =>
		route.fulfill({
			contentType: 'text/event-stream',
			body: 'data: {"done":true,"text":"You can still ask Max."}\n\n'
		})
	);
	await page.goto('/max');
	await expect(page.getByRole('status')).toContainText('Chats could not be saved');
	await page.getByTestId('max-chat-input').fill('Can I keep chatting?');
	await page.getByTestId('max-chat-send').click();
	await expect(page.locator('.max-reply')).toHaveText('You can still ask Max.');
});

test('saved conversations stay isolated between student accounts on the same device', async ({
	page
}) => {
	await page.route('**/api/max', (route) =>
		route.request().postDataJSON().action === 'title'
			? route.fulfill({ json: { title: 'First Account Goal' } })
			: route.fulfill({
					contentType: 'text/event-stream',
					body: 'data: {"done":true,"text":"A private synthetic goal."}\n\n'
				})
	);
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('My first account goal');
	await page.getByTestId('max-chat-send').click();
	let sidebar = await openChatSidebar(page);
	await expect(
		sidebar.getByRole('button', { name: 'First Account Goal', exact: true })
	).toBeVisible();
	await page.reload();
	sidebar = await openChatSidebar(page);
	await expect(
		sidebar.getByRole('button', { name: 'First Account Goal', exact: true })
	).toBeVisible();
	await page.evaluate(() => {
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'max-ai-second-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'max-second-preview-session'
			})
		);
	});
	await page.route('**/api/session/status', (route) =>
		route.fulfill({
			json: {
				signedIn: true,
				username: 'max-ai-second-preview',
				domain: 'ca-pleas-psv.edupoint.com'
			}
		})
	);
	await page.reload();
	await expect(page.getByRole('heading', { name: 'Ask Max' })).toBeVisible();
	sidebar = await openChatSidebar(page);
	await expect(sidebar.getByText('Your grade chats will show up here.')).toBeVisible();
	await expect(sidebar.getByText('First Account Goal')).toHaveCount(0);
	await expect(page.getByRole('log')).not.toContainText('first account goal');
});

test('whole-app questions include browser feedback capabilities only in the server request and stream rich answers', async ({
	page
}) => {
	const receipt = { id: '12345678-1234-1234-1234-123456789abc', replyToken: 'r'.repeat(43) };
	await page.addInitScript(
		(value) => localStorage.setItem('feedbackReceipts', JSON.stringify([value])),
		receipt
	);
	let sent: Record<string, unknown> | undefined;
	let sessionHeader: string | undefined;
	await page.route('**/api/max', (route) => {
		const body = route.request().postDataJSON();
		if (body.action === 'title')
			return route.fulfill({ json: { title: 'School Message And Feedback' } });
		sent = body;
		sessionHeader = route.request().headers()['x-grademaxxing-session'];
		return route.fulfill({
			contentType: 'text/event-stream',
			body: 'data: {"t":"**Dr Synthetic Rivera** sent the lab instructions. "}\n\ndata: {"t":"The Grademaxxing team marked your feedback planned."}\n\ndata: {"done":true,"text":"**Dr Synthetic Rivera** sent the lab instructions. The Grademaxxing team marked your feedback planned.","toolsUsed":["search_app_records","read_app_resource"]}\n\n'
		});
	});
	await page.goto('/max');
	await page
		.getByTestId('max-chat-input')
		.fill('Who sent the lab instructions, and what did the team say about my feedback?');
	await page.getByTestId('max-chat-send').click();
	await expect(page.locator('.max-reply strong')).toHaveText('Dr Synthetic Rivera');
	await expect(page.locator('.max-reply')).toContainText('feedback planned');
	expect(sent?.feedbackReceipts).toEqual([receipt]);
	expect(sessionHeader).toBe('max-ai-preview-session');
	expect(JSON.stringify(sent?.studentDataContext)).not.toContain(receipt.replyToken);
	await expect(page.getByRole('log')).not.toContainText(receipt.replyToken);
	await expect(
		page.getByText(
			/requested app records \(including mail, documents, profile, attendance, and feedback\)/
		)
	).toHaveCount(0);
});

test('reporting a reply sends only the fixed issue category and receipt, never chat text', async ({
	page
}) => {
	let submitted: unknown;
	const id = '11111111-1111-4111-8111-111111111111';
	const receipt = 'r'.repeat(43);
	await page.route('**/api/max', (route) =>
		route.request().postDataJSON().action === 'title'
			? route.fulfill({ json: { title: 'Synthetic GPA' } })
			: route.fulfill({
					contentType: 'text/event-stream',
					body:
						'data: ' +
						JSON.stringify({
							done: true,
							text: 'Synthetic private reply content.',
							diagnosticId: id,
							reportReceipt: receipt
						}) +
						'\n\n'
				})
	);
	await page.route('**/api/max/report', (route) => {
		submitted = route.request().postDataJSON();
		return route.fulfill({ status: 204 });
	});
	await page.goto('/max');
	await page.getByTestId('max-chat-input').fill('synthetic private question content');
	await page.getByTestId('max-chat-input').press('Enter');
	await page.getByLabel('Report a problem with this reply').selectOption('incorrect');
	await expect(page.getByText('Issue reported. The reply text was not shared.')).toBeVisible();
	expect(submitted).toEqual({ id, receipt, reason: 'incorrect' });
	await page.reload();
	await expect(page.getByText('Issue reported. The reply text was not shared.')).toBeVisible();
});
