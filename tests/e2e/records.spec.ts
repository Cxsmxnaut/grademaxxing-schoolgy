import { expect, test, type Page } from '@playwright/test';

async function expectPassiveFileOpen(filePage: Page) {
	// Headed Chrome renders supported files at their blob URL. Chromium's
	// headless shell downloads the same blob instead because it has no PDF viewer.
	const outcome = await Promise.race([
		filePage
			.waitForURL(/^blob:/, { timeout: 20_000 })
			.then(() => 'inline')
			.catch(() => new Promise<never>(() => {})),
		filePage.waitForEvent('download', { timeout: 20_000 }).then(() => 'download')
	]);
	expect(['inline', 'download']).toContain(outcome);
}

const gradebookXml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="preview" CourseName="Theme Preview" Period="1" Staff="Teacher Example" Room="101"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="95" CalculatedScoreString="A"><Assignments></Assignments></Mark></Marks></Course></Courses></Gradebook>`;

const documents = [
	{
		_DocumentGU: 'report-card-q4',
		_DocumentFileName: 'Quarter 4 Report Card.pdf',
		_DocumentDate: '6/5/2026',
		_DocumentType: 'Report Card',
		_StudentGU: 'student',
		_DocumentComment: 'Quarter 4 Report Card'
	},
	{
		_DocumentGU: 'unofficial-transcript',
		_DocumentFileName: 'Unofficial Transcript.pdf',
		_DocumentDate: '6/10/2026',
		_DocumentType: 'Transcript',
		_StudentGU: 'student',
		_DocumentComment: 'Unofficial Transcript'
	}
];

const sender = {
	_RecipientType: 'From',
	_GU: 'counselor',
	_RecipientList: 'Staff',
	_GroupUserTypes: '',
	_Details1: 'College & Career Center',
	_Details2: 'Staff',
	_ReadCount: '',
	_PersonCount: ''
};

const recipient = {
	...sender,
	_RecipientType: 'To',
	_GU: 'student',
	_Details1: 'Student Example',
	_Details2: 'Student'
};

const message = {
	From: { RecipientXML: sender },
	To: { RecipientXML: recipient },
	CC: '',
	BCC: '',
	Attachments: {
		AttachmentXML: [{ _SmAttachmentGU: 'college-night', _DocumentName: 'College Night.pdf' }]
	},
	_SMMessageGU: 'message',
	_SMMsgPersonGU: 'message-person',
	_SendDateTime: '2026-08-28T09:15:00',
	_Subject: 'College information night — September 3',
	_MessageText:
		'<p>Students and families are invited to our fall college information night.</p><p><a href="https://example.edu/college-night">Reserve a seat online</a>.</p><a href="javascript:alert(1)">Unsafe link</a>',
	_FolderType: 'Inbox',
	_Priority: 'None',
	_IsItDraft: 'false',
	_MailRead: 'false',
	_SendDateTimeFormattedLong: 'Friday, August 28, 2026 at 9:15 AM',
	_SendDateTimeFormattedShort: '8/28/26',
	_IsSystemMessage: 'false'
};

test.beforeEach(async ({ context }) => {
	await context.addInitScript(() => {
		localStorage.setItem('mode-watcher-mode', 'dark');
		localStorage.setItem(
			'token',
			JSON.stringify({
				username: 'records-preview',
				domain: 'ca-pleas-psv.edupoint.com',
				sessionId: 'records-preview-session'
			})
		);
	});

	await context.route('**/api/session/status', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				signedIn: true,
				username: 'records-preview',
				domain: 'ca-pleas-psv.edupoint.com'
			})
		})
	);
	await context.route('**/api/session/keepalive', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ signedIn: true, updatedAt: Date.now() })
		})
	);

	await context.route('**/api/studentvue/**', (route) => {
		const resource = new URL(route.request().url()).pathname.split('/').at(-1);
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
			documents: { StudentDocumentDatas: { StudentDocumentData: documents } },
			document: {
				Base64Code: 'JVBERi0xLjQKJcTl8uXrCg==',
				_DocumentGU: 'report-card-q4',
				_FileName: 'Quarter 4 Report Card.pdf',
				_DocFileName: 'Quarter 4 Report Card.pdf',
				_DocType: 'application/pdf'
			},
			messages: { InboxItemListings: { MessageXML: [message] } },
			message,
			attachment: {
				Base64Code: 'JVBERi0xLjQKJcTl8uXrCg==',
				_SmAttachmentGU: 'college-night',
				_DocumentName: 'College Night.pdf',
				_MimeType: 'application/pdf'
			},
			'student-info': {
				FormattedName: 'Student, Example',
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
			body: JSON.stringify(bodies[resource ?? ''] ?? {})
		});
	});
});

test('published documents render, filter, and open through the real document flow', async ({
	page,
	context
}) => {
	await page.goto('/documents');
	const visibleRows = page.getByTestId('document-row').filter({ visible: true });
	await expect(visibleRows).toHaveCount(2);
	await expect(page.getByText('Loading documents…')).toBeHidden();
	await expect(visibleRows.getByText('Quarter 4 Report Card', { exact: true })).toBeVisible();
	await expect(visibleRows.getByText('Unofficial Transcript', { exact: true })).toBeVisible();
	await page.evaluate(() => document.documentElement.classList.remove('dark'));
	await expect(page.getByRole('tab', { name: 'All' })).toHaveCSS('color', 'rgb(15, 28, 46)');

	await page.getByRole('tab', { name: 'Transcript', exact: true }).click();
	await expect(page.getByTestId('document-row').filter({ visible: true })).toHaveCount(1);
	await expect(
		page
			.getByTestId('document-row')
			.filter({ visible: true })
			.getByText('Unofficial Transcript', { exact: true })
	).toBeVisible();

	await page.getByRole('tab', { name: 'All', exact: true }).click();
	const documentPagePromise = context.waitForEvent('page');
	await page.getByRole('link', { name: /Quarter 4 Report Card/ }).click();
	const documentPage = await documentPagePromise;
	await expectPassiveFileOpen(documentPage);
	await documentPage.close();
});

test('mail behaves like an inbox and safely opens message links and attachments', async ({
	page,
	context
}) => {
	await page.goto('/mail');
	await expect(page.getByRole('region', { name: 'Inbox' })).toContainText('1 unread');
	const row = page.getByTestId('mail-message');
	await expect(row).toHaveCount(1);
	await expect(row).toHaveAccessibleName(/Unread: College information night/);
	await expect(row.getByLabel('Unread')).toBeVisible();
	await expect(row).toContainText('1 link');
	await expect(row).toContainText('1 attachment');

	await row.click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await expect(
		dialog.getByRole('heading', { name: 'College information night — September 3' })
	).toBeVisible();
	await expect(dialog).toContainText('College & Career Center');
	await expect(
		page.frameLocator('iframe').getByText('Students and families are invited')
	).toBeVisible();
	await expect(page.frameLocator('iframe').getByText('Unsafe link')).toBeVisible();
	await expect(page.frameLocator('iframe').getByText('Unsafe link')).not.toHaveAttribute('href');
	await expect(dialog.getByRole('link', { name: 'example.edu' })).toHaveAttribute(
		'rel',
		'noopener noreferrer'
	);

	const attachmentPagePromise = context.waitForEvent('page');
	await dialog.getByRole('link', { name: /College Night.pdf/ }).click();
	const attachmentPage = await attachmentPagePromise;
	await expectPassiveFileOpen(attachmentPage);
	await attachmentPage.close();
});

test('record pages retain their layout and controls on a phone viewport', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/documents');
	await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toBeVisible();
	await expect(page.getByTestId('document-row').filter({ visible: true })).toHaveCount(2);
	await expect(page.getByText('Loading documents…')).toBeHidden();
	for (const width of [320, 375, 414, 768]) {
		await page.setViewportSize({ width, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('tab', { name: 'Report Card', exact: true }).click();
	await expect(page.getByTestId('document-row').filter({ visible: true })).toHaveCount(1);

	await page
		.getByRole('navigation', { name: 'Mobile navigation' })
		.getByRole('link', { name: 'Mail' })
		.click();
	await expect(page).toHaveURL(/\/mail$/);
	await page.getByTestId('mail-message').click();
	await expect(page.getByRole('dialog')).toBeVisible();
	expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
	await page.keyboard.press('Escape');
	for (const width of [320, 375, 414, 768]) {
		await page.setViewportSize({ width, height: 844 });
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
			width
		);
	}
});
