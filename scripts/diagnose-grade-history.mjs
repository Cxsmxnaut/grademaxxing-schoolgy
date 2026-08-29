import { chromium } from '@playwright/test';
import { load } from 'cheerio';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const required = ['STUDENTVUE_USERNAME', 'STUDENTVUE_PASSWORD', 'DISTRICT_URL'];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required.`);

const appUrl = process.env.GRADEMAXXING_URL ?? 'http://127.0.0.1:5173';
const districtUrl = new URL(process.env.DISTRICT_URL);
const browser = await chromium.launch({
	headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
	executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
});

async function fetchLegacySoapGradebook() {
	const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '_' });
	const body = builder.build({
		'soap12:Envelope': {
			'_xmlns:soap12': 'http://www.w3.org/2003/05/soap-envelope',
			'soap12:Body': {
				ProcessWebServiceRequest: {
					_xmlns: 'http://edupoint.com/webservices/',
					userID: process.env.STUDENTVUE_USERNAME,
					password: process.env.STUDENTVUE_PASSWORD,
					skipLoginLog: true,
					parent: false,
					webServiceHandleName: 'PXPWebServices',
					methodName: 'Gradebook',
					paramStr: '<Params></Params>'
				}
			}
		}
	});
	const response = await fetch(new URL('Service/PXPCommunication.asmx', districtUrl), {
		method: 'POST',
		headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
		body
	});
	const responseText = await response.text();
	if (!response.ok) return { status: response.status, error: `HTTP ${response.status}` };
	const envelope = new XMLParser({ ignoreDeclaration: true }).parse(responseText);
	const result =
		envelope?.['soap:Envelope']?.['soap:Body']?.ProcessWebServiceRequestResponse
			?.ProcessWebServiceRequestResult;
	if (typeof result !== 'string') return { status: response.status, error: 'Missing SOAP result' };
	const parsedResult = new XMLParser({
		ignoreAttributes: false,
		ignoreDeclaration: true,
		attributeNamePrefix: '_'
	}).parse(result);
	if (parsedResult.RT_ERROR)
		return { status: response.status, error: parsedResult.RT_ERROR._ERROR_MESSAGE };
	const courses = array(parsedResult.Gradebook?.Courses?.Course);
	return {
		status: response.status,
		courses: courses.map((course) => {
			const mark = array(course.Marks?.Mark)[0] ?? {};
			const assignments = array(mark.Assignments?.Assignment);
			const graded = assignments.filter(
				(row) => row._Point !== undefined && row._Point !== '' && row._PointPossible !== undefined
			);
			return {
				courseId: String(course._CourseID ?? ''),
				title: course._CourseName ?? course._Title,
				grade: mark._CalculatedScoreRaw,
				rows: assignments.length,
				graded: graded.length,
				gradedDates: [...new Set(graded.map((row) => row._Date).filter(Boolean))].sort(),
				ids: assignments.map((row) => String(row._GradebookID ?? '')).filter(Boolean)
			};
		})
	};
}

function array(value) {
	return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

function extractJsonAfter(source, needle) {
	const anchor = source.indexOf(needle);
	if (anchor < 0) return undefined;
	let start = anchor + needle.length;
	while (start < source.length && source[start] !== '[' && source[start] !== '{') start += 1;
	const open = source[start];
	const close = open === '[' ? ']' : '}';
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < source.length; index += 1) {
		const char = source[index];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (char === '\\') {
			escaped = true;
			continue;
		}
		if (char === '"') {
			inString = !inString;
			continue;
		}
		if (inString) continue;
		if (char === open) depth += 1;
		else if (char === close && --depth === 0) {
			try {
				return JSON.parse(source.slice(start, index + 1));
			} catch {
				return undefined;
			}
		}
	}
}

function findAssignmentRows(html) {
	const split = html.indexOf('AssignmentsGrid');
	const source = split < 0 ? html : html.slice(split);
	const needle = '"dataSource":';
	let from = 0;
	while (from < source.length) {
		const index = source.indexOf(needle, from);
		if (index < 0) return [];
		const value = extractJsonAfter(source.slice(index), needle);
		if (
			Array.isArray(value) &&
			value.length &&
			typeof value[0] === 'object' &&
			['GBAssignment', 'GBPoints', 'GradebookID', 'Measure'].some((key) => key in value[0])
		)
			return value;
		from = index + needle.length;
	}
	return [];
}

function cellText(value) {
	if (typeof value === 'number') return String(value);
	if (typeof value !== 'string') return value?.value === undefined ? '' : cellText(value.value);
	const trimmed = value.trim();
	if (trimmed.startsWith('{') && trimmed.includes('"value"')) {
		try {
			return cellText(JSON.parse(trimmed));
		} catch {
			return value;
		}
	}
	return value;
}

function originalStats(rows) {
	const graded = rows.filter((row) => {
		const points = cellText(row.GBPoints ?? row.Points);
		return /-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?/.test(points) || row.Point !== undefined;
	});
	return {
		rows: rows.length,
		graded: graded.length,
		gradedDates: [...new Set(graded.map((row) => cellText(row.Date)).filter(Boolean))].sort(),
		ids: rows.map((row) => cellText(row.gradeBookId ?? row.GradebookID)).filter(Boolean)
	};
}

function appStats(course) {
	const mark = array(course.Marks?.Mark)[0] ?? {};
	const assignments = array(mark.Assignments?.Assignment);
	const graded = assignments.filter(
		(row) => row._Point !== undefined && row._Point !== '' && row._PointPossible !== undefined
	);
	return {
		title: course._CourseName,
		grade: mark._CalculatedScoreRaw,
		rows: assignments.length,
		graded: graded.length,
		gradedDates: [...new Set(graded.map((row) => row._Date).filter(Boolean))].sort(),
		ids: assignments.map((row) => row._GradebookID).filter(Boolean)
	};
}

function flattenContent(items) {
	const output = [];
	for (const item of items ?? []) {
		if (!item || typeof item !== 'object') continue;
		if (Array.isArray(item.items)) output.push(...flattenContent(item.items));
		else if (item.itemID !== undefined) output.push(item);
	}
	return output;
}

async function clientSide(context, friendlyName, method, parameters = {}) {
	const action = encodeURIComponent(`${friendlyName}-${method}`);
	const response = await context.request.post(
		new URL(`api/GB/ClientSideData/Transfer?action=${action}`, districtUrl).href,
		{
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			data: {
				FriendlyName: friendlyName,
				Method: method,
				Parameters: JSON.stringify(parameters)
			}
		}
	);
	if (!response.ok()) throw new Error(`${friendlyName}/${method} returned ${response.status()}.`);
	return response.json();
}

function pick(record, keys) {
	return Object.fromEntries(
		keys.filter((key) => record?.[key] !== undefined).map((key) => [key, record[key]])
	);
}

const appContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const appPage = await appContext.newPage();
await appPage.goto(`${appUrl}/login`);
await appPage.getByLabel('StudentVUE Username').fill(process.env.STUDENTVUE_USERNAME);
await appPage.getByLabel('StudentVUE Password').fill(process.env.STUDENTVUE_PASSWORD);
await appPage.getByRole('button', { name: 'Log in', exact: true }).click();
await appPage.waitForURL(/\/dashboard$/, { timeout: 60_000 });
const token = JSON.parse(await appPage.evaluate(() => localStorage.getItem('token')));
const appGradebookResult = await appPage.evaluate(async (sessionId) => {
	const response = await fetch('/api/studentvue/gradebook', {
		headers: { 'X-Grademaxxing-Session': sessionId }
	});
	return { status: response.status, payload: await response.json() };
}, token.sessionId);
if (appGradebookResult.status !== 200)
	throw new Error(`App gradebook returned ${appGradebookResult.status}.`);
const { xml } = appGradebookResult.payload;
const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '_' }).parse(
	xml
).Gradebook;
const appCourses = new Map(
	array(parsed.Courses?.Course).map((course) => [String(course._CourseID), appStats(course)])
);

const originalContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const originalPage = await originalContext.newPage();
await originalPage.goto(
	new URL('PXP2_Login_Student.aspx?regenerateSessionId=true', districtUrl).href
);
await originalPage
	.locator('input[name="ctl00$MainContent$username"]')
	.fill(process.env.STUDENTVUE_USERNAME);
await originalPage
	.locator('input[name="ctl00$MainContent$password"]')
	.fill(process.env.STUDENTVUE_PASSWORD);
await originalPage.locator('input[name="ctl00$MainContent$Submit1"]').click();
await originalPage.waitForURL((url) => !url.pathname.includes('PXP2_Login'), { timeout: 60_000 });
await originalPage.goto(new URL('PXP2_Gradebook.aspx?AGU=0', districtUrl).href);
const focusElements = originalPage.locator('.course-title[data-focus]');
const focusCount = await focusElements.count();
const comparison = [];
const legacySoap = await fetchLegacySoapGradebook();
const legacyCourses = new Map(
	(legacySoap.courses ?? []).map((course) => [course.courseId, course])
);

for (let index = 0; index < focusCount; index += 1) {
	const element = focusElements.nth(index);
	const focus = JSON.parse(await element.getAttribute('data-focus'));
	const courseId = String(focus.FocusArgs.classID);
	const response = await originalContext.request.post(
		new URL('service/PXP2Communication.asmx/LoadControl', districtUrl).href,
		{ data: { request: { control: focus.LoadParams.ControlName, parameters: focus.FocusArgs } } }
	);
	if (!response.ok()) throw new Error(`Original ClassDetails returned ${response.status()}.`);
	const detailHtml = (await response.json()).d?.Data?.html ?? '';
	const source = originalStats(findAssignmentRows(detailHtml));
	const app = appCourses.get(courseId);
	await originalContext.request.post(
		new URL('service/PXP2Communication.asmx/LoadControl', districtUrl).href,
		{
			data: {
				request: {
					control: focus.LoadParams.ControlName,
					parameters: { ...focus.FocusArgs, viewName: 'courseContent' }
				}
			}
		}
	);
	const [contentPayload, gradeCard, classData] = await Promise.all([
		clientSide(originalContext, 'pxp.course.content.items', 'LoadWithOptions', {
			loadOptions: {
				sort: [{ selector: 'due_date', desc: true }],
				filter: [],
				group: [],
				requireTotalCount: true,
				userData: {}
			},
			clientState: {}
		}),
		clientSide(originalContext, 'pxp.course.grade.card', 'get'),
		clientSide(originalContext, 'genericdata.classdata', 'GetClassData')
	]);
	const contentRows = flattenContent(contentPayload.responseData?.data);
	const contentIds = new Set(contentRows.map((row) => String(row.itemID)));
	const hiddenDetails = [];
	for (const meta of classData.assignments ?? []) {
		const assignmentId = String(meta.gradeBookId ?? '');
		if (!assignmentId || contentIds.has(assignmentId)) continue;
		const detailResponse = await originalContext.request.post(
			new URL('service/PXP2Communication.asmx/LoadControl', districtUrl).href,
			{
				data: {
					request: {
						control: 'Gradebook_AssignmentDetails',
						parameters: {
							...focus.FocusArgs,
							viewName: null,
							assignmentID: Number(assignmentId)
						}
					}
				}
			}
		);
		const detailPayload = await detailResponse.json();
		const $ = load(detailPayload.d?.Data?.html ?? '');
		const values = {};
		$('.info_tbl td').each((_cellIndex, cell) => {
			const label = $(cell).find('.tbl_label').first().text().replace(/:\s*$/, '').trim();
			const value = $(cell).find('.tbl_value').first().text().replace(/\s+/g, ' ').trim();
			if (label) values[label] = value;
		});
		hiddenDetails.push({ assignmentId, values });
	}
	const structured = {
		gradeCard: pick(gradeCard, ['classGrade', 'classPct']),
		studentGrade: pick(classData.students?.[0], [
			'calculatedMark',
			'manualMark',
			'percentage',
			'points',
			'pointsPossible'
		]),
		weightingEnabled: classData.isAssignmentWeightingOn,
		items: contentRows.map((row) =>
			pick(row, [
				'itemID',
				'title',
				'assignmentType',
				'date',
				'due_date',
				'gradeMark',
				'points',
				'pointsPossible',
				'commentText',
				'publicNote'
			])
		),
		assignmentMeta: (classData.assignments ?? []).map((row) =>
			pick(row, [
				'gradeBookId',
				'measureTypeId',
				'points',
				'pointsPossible',
				'score',
				'percentage',
				'isHidden',
				'isMissing',
				'isForGrading',
				'dropScore'
			])
		),
		measureTypes: (classData.measureTypes ?? []).map((row) => pick(row, ['id', 'name'])),
		measureTypeGrades: (classData.measureTypeGrades ?? []).map((row) =>
			pick(row, [
				'measureTypeId',
				'measureTypeWeight',
				'points',
				'pointsPossible',
				'percentage',
				'calculatedMark'
			])
		),
		hiddenDetails
	};

	await appPage.goto(`${appUrl}/grades/${courseId}`);
	await appPage.getByLabel('Hypothetical Mode').waitFor({ state: 'visible', timeout: 30_000 });
	const chart = appPage.getByTestId('grade-trend-chart');
	const circles = await chart.locator('circle').count();
	const visiblePaths = await chart
		.locator('path')
		.evaluateAll((paths) =>
			paths.map((path) => path.getAttribute('d')).filter((d) => d && d.length > 20)
		);

	comparison.push({
		courseId,
		title: app?.title ?? (await element.innerText()),
		grade: app?.grade,
		original: source,
		structured,
		legacySoap: legacyCourses.get(courseId),
		app,
		missingFromApp: app ? source.ids.filter((id) => !app.ids.includes(id)) : source.ids,
		extraInApp: app ? app.ids.filter((id) => !source.ids.includes(id)) : [],
		chart: { circles, visiblePaths: visiblePaths.length }
	});
}

console.log(
	JSON.stringify({ legacySoapStatus: legacySoap.error ?? legacySoap.status, comparison }, null, 2)
);
await appContext.close();
await originalContext.close();
await browser.close();
