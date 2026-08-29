import { chromium } from '@playwright/test';

const username = process.env.STUDENTVUE_USERNAME;
const password = process.env.STUDENTVUE_PASSWORD;
const district = process.env.DISTRICT_URL;

if (!username || !password || !district) {
	throw new Error('STUDENTVUE_USERNAME, STUDENTVUE_PASSWORD, and DISTRICT_URL are required.');
}

function shape(value, depth = 0) {
	if (depth > 10) return '…';
	if (Array.isArray(value))
		return {
			type: 'array',
			length: value.length,
			item: value.length ? shape(value[0], depth + 1) : null
		};
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [key, shape(item, depth + 1)])
		);
	}
	return value === null ? 'null' : typeof value;
}

function classDataSummary(payload) {
	return {
		enabled: payload.enabled,
		isAssignmentWeightingOn: payload.isAssignmentWeightingOn,
		students: payload.students?.map(({ percentage, calculatedMark, manualMark, lockScore }) => ({
			percentage,
			calculatedMark,
			manualMark,
			lockScore
		})),
		measureTypes: payload.measureTypes?.map(({ id, weight, dropScores }) => ({
			id,
			weight,
			dropScores
		})),
		assignments: payload.assignments?.map(
			({
				measureTypeId,
				gradeBookId,
				pointsPossible,
				score,
				originalScore,
				hideInPortal,
				isForGrading,
				excused,
				maxValue,
				maxScore,
				isGradeBookMissingMark
			}) => ({
				measureTypeId,
				gradeBookId,
				pointsPossible,
				score,
				originalScore,
				hideInPortal,
				isForGrading,
				excused,
				maxValue,
				maxScore,
				isGradeBookMissingMark
			})
		),
		measureTypeGrades: payload.measureTypeGrades,
		classGrades: payload.classGrades
	};
}

const browser = await chromium.launch({
	headless: process.env.PLAYWRIGHT_HEADLESS === '1',
	slowMo: 75,
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const calls = [];

page.on('response', async (response) => {
	const isTransfer = response.url().includes('/api/GB/ClientSideData/Transfer');
	const isLoadControl = response.url().includes('/service/PXP2Communication.asmx/LoadControl');
	if (!isTransfer && !isLoadControl) return;
	try {
		const posted = response.request().postDataJSON();
		const parameters = isTransfer
			? typeof posted.Parameters === 'string'
				? JSON.parse(posted.Parameters)
				: posted.Parameters
			: posted;
		const payload = await response.json();
		calls.push({
			status: response.status(),
			friendlyName: isTransfer ? posted.FriendlyName : 'LoadControl',
			method: isTransfer ? posted.Method : 'POST',
			durationMs: Math.round(response.request().timing().responseEnd),
			parameters: shape(parameters),
			response: isTransfer
				? posted.FriendlyName === 'genericdata.classdata'
					? classDataSummary(payload)
					: shape(payload)
				: 'intentionally omitted'
		});
		if (isLoadControl) {
			calls.at(-1).control = posted?.request?.control;
			calls.at(-1).viewName = posted?.request?.parameters?.viewName;
		}
	} catch (error) {
		calls.push({ error: error instanceof Error ? error.message : String(error) });
	}
});

try {
	const base = new URL(district);
	await page.goto(new URL('/PXP2_Login_Student.aspx?regenerateSessionId=true', base).href);
	await page.locator('input[name="ctl00$MainContent$username"]').fill(username);
	await page.locator('input[name="ctl00$MainContent$password"]').fill(password);
	await page.locator('input[name="ctl00$MainContent$Submit1"]').click();
	await page.waitForURL((url) => !url.pathname.includes('Login'), { timeout: 45_000 });
	await page.goto(new URL('/PXP2_Gradebook.aspx?AGU=0', base).href);
	const courseCount = await page.locator('.course-title').count();
	for (let index = 0; index < courseCount; index += 1) {
		if (index > 0) {
			await page.goto(new URL('/PXP2_Gradebook.aspx?AGU=0', base).href);
			await page.locator('.course-title').first().waitFor();
		}
		await page.locator('.course-title').nth(index).click();
		await page.waitForTimeout(2_000);
	}
	console.log(
		JSON.stringify(
			calls.filter(
				(call) =>
					call.friendlyName === 'LoadControl' ||
					call.friendlyName === 'pxp.course.content.items' ||
					call.friendlyName === 'genericdata.classdata'
			),
			null,
			2
		)
	);
} finally {
	await context.close();
	await browser.close();
}
