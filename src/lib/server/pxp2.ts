import { DISTRICTS } from '$lib/data/districts';
import { parseStudentVueTranscript } from '$lib/grades/transcript';
import { load } from 'cheerio';
import { Buffer } from 'node:buffer';

function portalBasePath(pathname: string) {
	const path = pathname.replace(/^\/+|\/+$/g, '');
	return path ? `/${path}/` : '/';
}

const knownStudentVueTargets = DISTRICTS.map((district) => {
	const url = new URL(`https://${district.domain}`);
	return { hostname: url.hostname.toLowerCase(), basePath: portalBasePath(url.pathname) };
}).sort((a, b) => b.basePath.length - a.basePath.length);

type Credentials = { username: string; password: string };

export type Pxp2SessionState = {
	baseUrl: string;
	cookies: Record<string, string>;
	messageToken?: string;
};

/** A payload-free timing record for local performance diagnostics. */
export type Pxp2RequestMetric = {
	path: string;
	status?: number;
	durationMs: number;
	outcome: 'response' | 'network-error' | 'timeout';
};

export type PortalDocument = { id: string; title: string; date: string; category: string };
export type PortalFile = { base64: string; mimeType: string; fileName: string };
export type PortalCalendarEvent = {
	id: string;
	type: string;
	title: string;
	description: string;
	details: string;
	date: string;
	time: string;
};
export type PortalScheduleClass = {
	period: string;
	courseTitle: string;
	teacher: string;
	teacherEmail: string;
	room: string;
	startTime: string;
	endTime: string;
	schoolName: string;
	date: string;
};
export type PortalReportingPeriod = {
	name: string;
	index: number;
	startDate: string;
	endDate: string;
};
export type PortalGradebook = {
	courses: PortalCourse[];
	reportingPeriods: PortalReportingPeriod[];
	selectedPeriod: PortalReportingPeriod;
	/**
	 * False only when the portal's rendered course headers were safely used as a
	 * quick first view. Those headers contain official current marks but not the
	 * assignment/category detail required by charts and what-if calculations.
	 */
	detailed?: boolean;
};

export class Pxp2InputError extends Error {}
export class Pxp2AuthenticationError extends Error {}
export class Pxp2SessionExpiredError extends Error {}
export class Pxp2TimeoutError extends Error {}

type CourseFocus = { courseId: string; control: string; parameters: Record<string, unknown> };
type CourseContentItem = Record<string, unknown> & {
	itemID?: unknown;
	title?: unknown;
	assignmentType?: unknown;
	date?: unknown;
	due_date?: unknown;
	gradeMark?: unknown;
	points?: unknown;
	pointsPossible?: unknown;
	commentText?: unknown;
	publicNote?: unknown;
};

type ClassData = {
	enabled?: unknown;
	isAssignmentWeightingOn?: unknown;
	students?: Array<Record<string, unknown>>;
	measureTypes?: Array<Record<string, unknown>>;
	assignments?: Array<Record<string, unknown>>;
	measureTypeGrades?: Array<Record<string, unknown>>;
};

type GradingPeriod = {
	Name?: unknown;
	GroupName?: unknown;
	GU?: unknown;
	OrgYearGU?: unknown;
	schoolID?: unknown;
	defaultFocus?: unknown;
	MarkPeriods?: Array<{ Name?: unknown; GU?: unknown }>;
};

type PortalCourse = {
	id: string;
	period: string;
	title: string;
	room: string;
	teacher: string;
	teacherEmail: string;
	score: string;
	scoreRaw: string;
	missing: string;
	categories: PortalGradeCategory[];
	assignments: Array<Record<string, string>>;
};

export type PortalGradeCategory = {
	name: string;
	weight: string;
	points: string;
	pointsPossible: string;
	weightedPercentage: string;
	calculatedMark: string;
};

const pages = {
	attendance: 'PXP2_Attendance.aspx?AGU=0',
	calendar: 'PXP2_Calendar.aspx?AGU=0',
	gradebook: 'PXP2_Gradebook.aspx?AGU=0',
	messages: 'PXP2_Messages.aspx?AGU=0',
	documents: 'PXP2_Documents.aspx?AGU=0',
	reportCards: 'PXP2_ReportCard.aspx?AGU=0',
	schedule: 'PXP2_ClassSchedule.aspx?AGU=0',
	schoolInfo: 'PXP2_SchoolInformation.aspx?AGU=0',
	studentInfo: 'PXP2_Student.aspx?AGU=0'
} as const;

type PageName = keyof typeof pages;

/**
 * Minimal, read-only client for the current PXP2 StudentVUE portal.
 * It deliberately keeps portal cookies in this server-side instance only.
 */
export class Pxp2Client {
	private readonly cookies = new Map<string, string>();
	private gradebookTail: Promise<void> = Promise.resolve();
	private messageToken?: string;

	private constructor(
		private readonly baseUrl: URL,
		private readonly onRequestMetric?: (metric: Pxp2RequestMetric) => void
	) {}

	static async login(
		districtUrl: string,
		credentials: Credentials,
		onRequestMetric?: (metric: Pxp2RequestMetric) => void
	) {
		const client = new Pxp2Client(normalizeDistrictUrl(districtUrl), onRequestMetric);
		await client.authenticate(credentials);
		return client;
	}

	static resume(state: Pxp2SessionState, onRequestMetric?: (metric: Pxp2RequestMetric) => void) {
		const baseUrl = normalizeDistrictUrl(state.baseUrl);
		const client = new Pxp2Client(baseUrl, onRequestMetric);
		const entries = Object.entries(state.cookies ?? {});
		if (entries.length === 0 || entries.length > 50)
			throw new Error('StudentVUE session cookie state is invalid.');
		for (const [name, value] of entries) {
			if (
				!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name) ||
				typeof value !== 'string' ||
				value.length > 4_096 ||
				/[;\r\n]/.test(value)
			)
				throw new Error('StudentVUE session cookie state is invalid.');
			client.cookies.set(name, value);
		}
		if (state.messageToken !== undefined) {
			if (typeof state.messageToken !== 'string' || state.messageToken.length > 4_096)
				throw new Error('StudentVUE message session state is invalid.');
			client.messageToken = state.messageToken;
		}
		return client;
	}

	exportSessionState(): Pxp2SessionState {
		return {
			baseUrl: this.baseUrl.toString(),
			cookies: Object.fromEntries(this.cookies),
			...(this.messageToken ? { messageToken: this.messageToken } : {})
		};
	}

	/**
	 * Touch a lightweight authenticated page so StudentVUE's sliding server session
	 * remains alive while the student is actively using the app. No profile data is
	 * parsed or returned; following a login redirect is treated as an expired session.
	 */
	async keepAlive() {
		await this.pageHtml('studentInfo');
	}

	async gradebook(reportPeriod?: number, summary = false): Promise<PortalGradebook> {
		// A StudentVUE login has one mutable gradebook focus. Serialize whole gradebook
		// reads so two tabs requesting different periods cannot corrupt one another.
		const result = this.gradebookTail.then(() => this.loadGradebook(reportPeriod, summary));
		this.gradebookTail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async loadGradebook(reportPeriod?: number, summary = false): Promise<PortalGradebook> {
		const html = await this.pageHtml('gradebook');
		const focus = jsonAssignment(html, 'PXP.GBCurrentFocus') as {
			FocusArgs?: Record<string, unknown>;
		};
		if (!focus?.FocusArgs) throw new Error('StudentVUE grade book context was not found.');
		const focusData = jsonAssignment(html, 'PXP.GBFocusData') as
			{ GradingPeriods?: GradingPeriod[] } | undefined;
		const periods = (focusData?.GradingPeriods ?? []).filter((period) => identifier(period.GU));
		if (periods.length === 0) throw new Error('StudentVUE grading periods were not found.');
		if (
			reportPeriod !== undefined &&
			(!Number.isSafeInteger(reportPeriod) || reportPeriod < 0 || reportPeriod >= periods.length)
		) {
			throw new Pxp2InputError(`reportPeriod must be between 0 and ${periods.length - 1}.`);
		}
		const defaultIndex = Math.max(
			0,
			periods.findIndex((period) => period.defaultFocus === true)
		);
		const selectedIndex = reportPeriod ?? defaultIndex;
		const selected = periods[selectedIndex]!;
		const args = focus.FocusArgs;
		let gradebookHtml = html;
		if (identifier(selected.GU) !== identifier(args.gradePeriodGU)) {
			const loaded = await this.serviceCall<{ html?: unknown }>('LoadControl', {
				request: {
					control: 'Gradebook_SchoolClasses',
					parameters: {
						schoolID: selected.schoolID,
						OrgYearGU: selected.OrgYearGU,
						gradePeriodGU: selected.GU,
						GradingPeriodGroup: selected.GroupName,
						AGU: args.AGU
					}
				}
			});
			gradebookHtml = typeof loaded.html === 'string' ? loaded.html : '';
			if (!gradebookHtml.includes('data-focus'))
				throw new Error('StudentVUE did not load the requested grading period.');
		}
		const markPeriod = selected.MarkPeriods?.[0];
		const classes = await this.serviceCall<Array<Record<string, unknown>>>(
			'GradebookFocusClassInfo',
			{
				request: {
					gradingPeriodGU: selected.GU,
					AGU: args.AGU,
					orgYearGU: selected.OrgYearGU,
					schoolID: selected.schoolID,
					markPeriodGU: markPeriod?.GU
				}
			},
			'Classes'
		);

		const headers = extractCourseHeaders(gradebookHtml);
		const focuses = courseFocuses(gradebookHtml);
		const headerEntries = [...headers.values()];
		const summaryHeaders = classes.map((course, index) => {
			const courseId =
				identifier(course.ID) || identifier(course.ClassID) || identifier(course.SectionGU);
			const byId = headers.get(courseId);
			if (byId) return byId;
			// Some StudentVUE builds use one internal id in GradebookFocusClassInfo and
			// another in the rendered header. Only use positional matching when the class
			// counts agree and the visible titles independently match.
			const byPosition = headerEntries[index];
			return headers.size === classes.length &&
				byPosition &&
				normalizeCourseTitle(byPosition.title) === normalizeCourseTitle(text(course.Name))
				? byPosition
				: undefined;
		});
		// Do not return an incomplete summary. District markup differs, so fall back to the
		// complete proven path unless every returned class has a matching, usable header.
		const safeSummary =
			summary &&
			summaryHeaders.length > 0 &&
			summaryHeaders.every((header) => Boolean(header?.score));
		const assignmentsByCourse = new Map<string, Array<Record<string, string>>>();
		const gradesByCourse = new Map<
			string,
			{ letter: string; percentage: string; categories: PortalGradeCategory[] }
		>();
		// StudentVUE keeps the selected class in the server session, so these focus changes
		// must remain serial. Gradebook_ClassDetails contains the complete category and
		// assignment grids in one response. The newer course-content endpoint is faster to
		// parse, but silently omits some rows that still contribute to the official grade.
		for (const focus of safeSummary ? [] : focuses) {
			const loaded = await this.serviceCall<{ html?: unknown }>('LoadControl', {
				request: {
					control: focus.control,
					parameters: focus.parameters
				}
			});
			const detailHtml = typeof loaded.html === 'string' ? loaded.html : '';
			const detail = parseGradebookClassDetail(detailHtml);
			if (detail.hasAssignmentGrid) {
				assignmentsByCourse.set(focus.courseId, detail.assignments);
				gradesByCourse.set(focus.courseId, {
					letter: detail.letter,
					percentage: detail.percentage,
					categories: detail.categories
				});
				continue;
			}

			// Some districts ship an older ClassDetails control without inline grids.
			// Keep the structured endpoints as a compatibility fallback for those portals.
			const [payload, gradeCard, classData] = await Promise.all([
				this.clientSideCall<{ responseData?: { data?: unknown[] } }>(
					'pxp.course.content.items',
					'LoadWithOptions',
					{
						loadOptions: {
							sort: [{ selector: 'due_date', desc: true }],
							filter: [],
							group: [],
							requireTotalCount: true,
							userData: {}
						},
						clientState: {}
					}
				),
				this.clientSideCall<{ classGrade?: unknown; classPct?: unknown }>(
					'pxp.course.grade.card',
					'get',
					{}
				),
				this.clientSideCall<ClassData>('genericdata.classdata', 'GetClassData', {})
			]);
			const items = flattenCourseItems(payload.responseData?.data ?? []);
			const categoriesByAssignment = assignmentCategories(classData);
			const visibleAssignments = items
				.map((item) => courseAssignment(item, categoriesByAssignment))
				.filter((assignment) => assignment.Date);
			const visibleIds = new Set(visibleAssignments.map((assignment) => assignment.AssignmentID));
			const missingGradedIds = (classData.assignments ?? []).flatMap((assignment) => {
				const assignmentId = identifier(assignment.gradeBookId);
				const hasScore =
					assignment.score !== undefined &&
					assignment.score !== null &&
					identifier(assignment.score) !== '';
				return assignmentId && hasScore && !visibleIds.has(assignmentId) ? [assignmentId] : [];
			});
			const recoveredAssignments = (
				await Promise.all(
					missingGradedIds.map(async (assignmentId) => {
						try {
							const detail = await this.serviceCall<{ html?: unknown }>('LoadControl', {
								request: {
									control: 'Gradebook_AssignmentDetails',
									parameters: {
										...focus.parameters,
										viewName: null,
										assignmentID: Number(assignmentId)
									}
								}
							});
							return parseGradebookAssignmentDetail(
								typeof detail.html === 'string' ? detail.html : '',
								assignmentId
							);
						} catch {
							// One malformed or unavailable detail must not hide the rest of the class.
							return undefined;
						}
					})
				)
			).filter((assignment): assignment is Record<string, string> => assignment !== undefined);
			assignmentsByCourse.set(
				focus.courseId,
				[...visibleAssignments, ...recoveredAssignments].toSorted(
					(a, b) =>
						(mdyDate(b.Date ?? '')?.getTime() ?? 0) - (mdyDate(a.Date ?? '')?.getTime() ?? 0)
				)
			);
			const authoritativeGrade = classData.students?.[0];
			const cardLetter = gradeLetter(text(gradeCard.classGrade));
			const authoritativeLetter =
				gradeLetter(text(authoritativeGrade?.calculatedMark)) ||
				gradeLetter(text(authoritativeGrade?.manualMark));
			gradesByCourse.set(focus.courseId, {
				letter: cardLetter || authoritativeLetter,
				percentage:
					numericText(gradeCard.classPct) ||
					(cardLetter || authoritativeLetter ? numericText(authoritativeGrade?.percentage) : ''),
				categories: classData.enabled === false ? [] : gradeCategories(classData)
			});
		}
		const courses = classes.map((course, index) => {
			const portalId =
				identifier(course.ID) || identifier(course.ClassID) || identifier(course.SectionGU);
			const id = portalId || `course-${index + 1}`;
			const header = summaryHeaders[index] ?? headers.get(portalId);
			const structuredGrade = gradesByCourse.get(portalId);
			const headerScore = header?.score ?? '';
			return {
				id,
				period: header?.period || String(index + 1),
				title: header?.title || text(course.Name) || `Course ${index + 1}`,
				room: header?.room ?? '',
				teacher: text(course.TeacherName),
				teacherEmail: text(course.TeacherEmail),
				score: structuredGrade?.letter || gradeLetter(headerScore) || 'N/A',
				scoreRaw: structuredGrade?.percentage || numericText(headerScore),
				missing: header?.missing ?? '0',
				categories: structuredGrade?.categories ?? [],
				assignments: assignmentsByCourse.get(portalId) ?? []
			};
		});
		const reportingPeriods = periods.map((period, index) => ({
			name: text(period.Name) || text(period.MarkPeriods?.[0]?.Name) || `Period ${index + 1}`,
			index,
			startDate: '',
			endDate: ''
		}));
		return {
			courses,
			reportingPeriods,
			selectedPeriod: reportingPeriods[selectedIndex]!,
			detailed: !safeSummary
		};
	}

	async attendance() {
		const data = jsonAssignment(await this.pageHtml('attendance'), 'PXP.StudentAttendanceData') as
			Record<string, unknown> | undefined;
		return attendanceDays(data);
	}

	async attendanceDetails() {
		const html = await this.pageHtml('attendance');
		const payload = jsonAssignment(html, 'PXP.StudentAttendanceData') as
			Record<string, unknown> | undefined;
		if (!payload) throw new Error('StudentVUE did not provide structured attendance data.');
		const studentDetails = payload.stuAttendanceDetails as Record<string, unknown> | undefined;
		return {
			...payload,
			days: attendanceDays(payload),
			courses: attendanceCourseRecords(html),
			periods: attendancePeriodRecords(html),
			schoolName: text(studentDetails?.schoolName)
		};
	}

	async calendar(month?: number, year?: number) {
		const payload = jsonAssignment(await this.pageHtml('calendar'), 'PXP.CalendarData') as
			| {
					startDate?: unknown;
					endDate?: unknown;
					showAssignments?: unknown;
					showSchedule?: unknown;
					rotationDayDefs?: unknown;
					rotationDays?: unknown;
					filters?: Array<Record<string, unknown>>;
					events?: Array<Record<string, unknown>>;
			  }
			| undefined;
		if (!payload?.events) throw new Error('StudentVUE did not provide structured calendar data.');
		const events: PortalCalendarEvent[] = payload.events.flatMap((event) => {
			const date = portalDate(text(event.date));
			if (!date || (month !== undefined && year !== undefined && !dateMatches(date, month, year)))
				return [];
			return [
				{
					id: identifier(event.eventGU),
					type: identifier(event.eventType),
					title: text(event.title),
					description: text(event.description),
					details: text(event.details),
					date,
					time: text(event.time)
				}
			];
		});
		return {
			startDate: portalDate(text(payload.startDate)),
			endDate: portalDate(text(payload.endDate)),
			showAssignments: Boolean(payload.showAssignments),
			showSchedule: Boolean(payload.showSchedule),
			rotationDayDefinitions: payload.rotationDayDefs ?? {},
			rotationDays: payload.rotationDays ?? {},
			filters: payload.filters ?? [],
			events
		};
	}

	async studentInfo() {
		const html = await this.pageHtml('studentInfo');
		const fields = tableFields(html);
		if (Object.keys(fields).length === 0)
			throw new Error('StudentVUE did not provide structured student information.');
		const $ = load(html);
		const photoPath = $('img[alt="Student Photo"]').first().attr('src')?.trim();
		let photo: PortalFile | undefined;
		if (photoPath) {
			try {
				const downloaded = await this.download(photoPath, 'StudentVUE student photo');
				if (/^image\/(?:gif|jpeg|png|webp)$/.test(downloaded.mimeType)) photo = downloaded;
			} catch {
				// Student information remains usable if a district blocks or omits its portrait file.
			}
		}
		return {
			name: fields['Student Name'] ?? fields.Name ?? '',
			permId: fields['Perm ID'] ?? '',
			grade: fields.Grade ?? '',
			gender: fields.Gender ?? '',
			photo,
			fields
		};
	}

	async reportCards() {
		const grades = jsonAssignment(await this.pageHtml('reportCards'), 'PXP.GradesData') as
			Record<string, unknown> | undefined;
		if (!grades) throw new Error('StudentVUE did not provide structured report-card data.');
		const documents = (await this.documents()).filter((document) =>
			/report card|progress report/i.test(`${document.category} ${document.title}`)
		);
		// Do not send the raw PXP.GradesData object to the browser. It can contain more
		// student-record detail than the GPA screen needs, and its shape varies by district.
		return { transcript: parseStudentVueTranscript(grades), documents };
	}

	async schedule() {
		const payload = jsonAssignment(await this.pageHtml('schedule'), 'PXP.TodayContent') as
			| {
					date?: unknown;
					dateToLoad?: unknown;
					attendance?: unknown;
					schools?: Array<{ schoolName?: unknown; classes?: Array<Record<string, unknown>> }>;
			  }
			| undefined;
		if (!payload?.schools) throw new Error('StudentVUE did not provide structured schedule data.');
		const date = portalDate(text(payload.date)) || portalDate(text(payload.dateToLoad));
		const classes: PortalScheduleClass[] = payload.schools.flatMap((school) =>
			(school.classes ?? []).map((course) => ({
				period: identifier(course.period),
				courseTitle: text(course.className),
				teacher: text(course.teacherNameFNLN) || text(course.teacherName),
				teacherEmail: text(course.teacherEmail),
				room: text(course.roomName),
				startTime: text(course.startTime),
				endTime: text(course.endTime),
				schoolName: text(school.schoolName),
				date
			}))
		);
		return { date, attendance: payload.attendance ?? null, classes };
	}

	async schoolInfo() {
		const fields = tableFields(await this.pageHtml('schoolInfo'));
		if (Object.keys(fields).length === 0)
			throw new Error('StudentVUE did not provide structured school information.');
		return {
			name: fields['School Name'] ?? '',
			principal: fields.Principal ?? '',
			address: fields.Address ?? '',
			phone: fields.Phone ?? '',
			fax: fields.Fax ?? '',
			website: fields['Website URL'] ?? '',
			fields
		};
	}

	async documents() {
		const html = await this.pageHtml('documents');
		return documentRows(html);
	}

	async document(documentId: string): Promise<PortalFile> {
		const token = decodeOpaqueId(documentId);
		if (!token || token.length > 4096 || !/^[A-Za-z0-9._~+/=-]+$/.test(token))
			throw new Pxp2InputError('Invalid document identifier.');
		const query = new URLSearchParams({ AGU: '', docToken: token });
		return this.download(`PXP_ShowDocument.aspx?${query}`, 'StudentVUE document');
	}

	async messages() {
		const html = await this.pageHtml('messages');
		const accessToken = html.match(
			/ST\.Authorization\s*=\s*\{\s*"access_token"\s*:\s*"([^"]+)"/m
		)?.[1];
		if (!accessToken) throw new Error('StudentVUE message authorization was not available.');
		this.messageToken = accessToken;
		const payload = await this.studentVueService<{
			Result?: { data?: Array<Record<string, unknown>> };
		}>(
			'ST.Messaging',
			'GetMessages',
			{
				folderId: null,
				folderType: 0,
				languageCode: 'en',
				showDeleted: false,
				skip: 0,
				take: 100,
				requireTotalCount: true
			},
			accessToken
		);
		// Return the inbox index immediately. Message bodies and attachments are loaded
		// on demand so a 100-message inbox does not create 101 upstream requests.
		return payload.Result?.data ?? [];
	}

	async mailbox() {
		const html = await this.pageHtml('messages');
		const accessToken = html.match(
			/ST\.Authorization\s*=\s*\{\s*"access_token"\s*:\s*"([^"]+)"/m
		)?.[1];
		if (!accessToken) throw new Error('StudentVUE message authorization was not available.');
		this.messageToken = accessToken;
		const folderPayload = await this.studentVueService<{ Result?: Array<Record<string, unknown>> }>(
			'ST.Messaging',
			'GetFolders',
			{},
			accessToken
		);
		const folders = folderPayload.Result ?? [];
		const messages = await mapWithConcurrency(folders, 4, async (folder) => {
			const payload = await this.studentVueService<{
				Result?: { data?: Array<Record<string, unknown>>; totalCount?: number };
			}>(
				'ST.Messaging',
				'GetMessages',
				{
					folderId: folder.folderId ?? null,
					folderType: folder.folderType,
					languageCode: 'en',
					showDeleted: false,
					skip: 0,
					take: 500,
					requireTotalCount: true
				},
				accessToken
			);
			return (payload.Result?.data ?? []).map((message) => ({
				...message,
				portalFolderType: folder.folderType,
				portalFolderId: folder.folderId ?? null,
				portalFolderName: folder.name
			}));
		});
		return { folders, messages: messages.flat() };
	}

	async messageDetails(messageId: string, isSystemMessage = false, existingToken?: string) {
		if (!isUuid(messageId)) throw new Pxp2InputError('Invalid message identifier.');
		const accessToken = existingToken ?? (await this.messageAccessToken());
		const payload = await this.studentVueService<{ Result?: Record<string, unknown> }>(
			'ST.Messaging',
			'GetMessage',
			{ id: messageId, languageCode: 'en', markAsRead: false, isSystemMessage },
			accessToken
		);
		if (!payload.Result) throw new Error('StudentVUE could not find that message.');
		return payload.Result;
	}

	async attachment(attachmentId: string): Promise<PortalFile> {
		if (!isUuid(attachmentId)) throw new Pxp2InputError('Invalid attachment identifier.');
		const query = new URLSearchParams({ fdID: attachmentId, dbID: '3' });
		return this.download(`FileDownload.aspx?${query}`, 'StudentVUE attachment');
	}

	private async messageAccessToken() {
		if (this.messageToken) return this.messageToken;
		const html = await this.pageHtml('messages');
		const token = html.match(/ST\.Authorization\s*=\s*\{\s*"access_token"\s*:\s*"([^"]+)"/m)?.[1];
		if (!token) throw new Error('StudentVUE message authorization was not available.');
		this.messageToken = token;
		return token;
	}

	private async download(path: string, label: string): Promise<PortalFile> {
		const response = await this.request(path);
		const finalUrl = new URL(response.url);
		if (finalUrl.origin !== this.baseUrl.origin || response.url.includes('PXP2_Login'))
			throw new Pxp2SessionExpiredError(`${label} session expired.`);
		if (!response.ok) throw new Error(`${label} download failed.`);
		const bytes = await responseBytes(response, 25 * 1024 * 1024, label);
		if (bytes.length === 0) throw new Error(`${label} has an invalid size.`);
		const disposition = response.headers.get('content-disposition') ?? '';
		const encodedName =
			disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1] ??
			disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
			'download';
		let decodedName = encodedName;
		try {
			decodedName = decodeURIComponent(encodedName);
		} catch {
			/* Preserve malformed upstream names as plain text. */
		}
		const fileName =
			decodedName
				.split(/[\\/]/)
				.at(-1)
				// Upstream filenames are untrusted; strip ASCII control characters.
				// eslint-disable-next-line no-control-regex
				?.replace(/[\u0000-\u001f\u007f]/g, '')
				.slice(0, 255) || 'download';
		const upstreamMime = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
		const mimeType =
			upstreamMime && /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(upstreamMime)
				? upstreamMime
				: 'application/octet-stream';
		return { base64: Buffer.from(bytes).toString('base64'), mimeType, fileName };
	}

	private async authenticate(credentials: Credentials) {
		const loginPath = 'PXP2_Login_Student.aspx?regenerateSessionId=true';
		const form = await this.request(loginPath);
		const html = await responseText(form, false);
		if (
			!/name=["']__VIEWSTATE["']/i.test(html) &&
			/<title>\s*maintenance\s*<\/title>/i.test(html)
		) {
			throw new Error('StudentVUE is currently under maintenance. Please try again later.');
		}
		const field = (name: string, required = true) => {
			const match = html.match(
				new RegExp(`<input[^>]+name=["']${escapeRegExp(name)}["'][^>]+value=["']([^"']+)["']`, 'i')
			);
			if (!match?.[1]) {
				if (required) throw new Error('StudentVUE login form is invalid.');
				return undefined;
			}
			if (match[1].length > 262_144) throw new Error('StudentVUE login form is invalid.');
			return decodeHtml(match[1]);
		};
		const body = new URLSearchParams();
		body.set('__VIEWSTATE', field('__VIEWSTATE')!);
		for (const name of ['__VIEWSTATEGENERATOR', '__EVENTVALIDATION']) {
			const value = field(name, false);
			if (value) body.set(name, value);
		}
		body.set('ctl00$MainContent$username', credentials.username);
		body.set('ctl00$MainContent$password', credentials.password);
		body.set('ctl00$MainContent$Submit1', 'Login');
		const response = await this.request(loginPath, {
			method: 'POST',
			body,
			redirect: 'manual',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
		});
		if (response.status < 300 || response.status >= 400)
			throw new Pxp2AuthenticationError('StudentVUE authentication failed.');
		const location = response.headers.get('location');
		if (!location) throw new Error('StudentVUE did not create a session.');
		const destination = new URL(location, this.baseUrl);
		if (destination.origin !== this.baseUrl.origin)
			throw new Error('StudentVUE returned an unexpected login redirect.');
		const home = await this.request(`${destination.pathname}${destination.search}`);
		const homeHtml = await responseText(home, false);
		if (home.url.includes('PXP2_Login') || !homeHtml.includes('StudentVUE'))
			throw new Pxp2AuthenticationError('StudentVUE authentication failed.');
	}

	private async pageHtml(name: PageName) {
		const response = await this.request(pages[name]);
		const html = await responseText(response);
		if (response.url.includes('PXP2_Login'))
			throw new Pxp2SessionExpiredError('StudentVUE session expired.');
		return html;
	}

	private async serviceCall<T>(method: string, body: unknown, property?: string): Promise<T> {
		const response = await this.request(`service/PXP2Communication.asmx/${method}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
			body: JSON.stringify(body)
		});
		const payload = await responseJson<{ d?: { Data?: unknown; Error?: { Message?: string } } }>(
			response
		);
		if (payload.d?.Error || payload.d?.Data === undefined)
			throw new Error(payload.d?.Error?.Message ?? 'StudentVUE did not return the requested data.');
		const data = payload.d.Data as Record<string, unknown>;
		return (property ? data[property] : data) as T;
	}

	private async studentVueService<T>(
		service: string,
		method: string,
		body: Record<string, unknown>,
		accessToken: string
	): Promise<T> {
		const response = await this.request(`st_api/${service}/${method}?PORTAL=StudentVUE`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${accessToken}`,
				'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
			},
			body: new URLSearchParams({ data: JSON.stringify(body) })
		});
		const html = await responseText(response);
		const encoded = elementInnerHtml(html, 'json-result');
		if (!encoded) throw new Error('StudentVUE service returned an unexpected response.');
		try {
			return JSON.parse(decodeHtml(encoded)) as T;
		} catch {
			throw new Error('StudentVUE service returned invalid JSON.');
		}
	}

	private async clientSideCall<T>(
		friendlyName: string,
		method: string,
		parameters: Record<string, unknown>
	): Promise<T> {
		const action = encodeURIComponent(`${friendlyName}-${method}`);
		const response = await this.request(`api/GB/ClientSideData/Transfer?action=${action}`, {
			method: 'POST',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				FriendlyName: friendlyName,
				Method: method,
				Parameters: JSON.stringify(parameters)
			})
		});
		if (!response.ok) throw new Error('StudentVUE grade book data request failed.');
		const payload = await responseJson<
			T & { errorMessage?: unknown; Error?: { Message?: unknown } }
		>(response);
		if (text(payload.errorMessage) || payload.Error) {
			throw new Error(
				text(payload.errorMessage) ||
					text(payload.Error?.Message) ||
					'StudentVUE grade book data request failed.'
			);
		}
		return payload;
	}

	private async request(path: string, init: RequestInit = {}) {
		const url = new URL(path, this.baseUrl);
		if (url.origin !== this.baseUrl.origin || url.protocol !== 'https:')
			throw new Error('Blocked unexpected StudentVUE request destination.');
		const headers = new Headers(init.headers);
		if (!headers.has('Accept')) headers.set('Accept', 'text/html,application/xhtml+xml');
		if (!headers.has('Accept-Encoding')) headers.set('Accept-Encoding', 'gzip, deflate, br');
		if (this.cookies.size)
			headers.set(
				'Cookie',
				[...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ')
			);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 45_000);
		let response: Response;
		const startedAt = performance.now();
		try {
			response = await fetch(url, { ...init, headers, signal: init.signal ?? controller.signal });
		} catch (cause) {
			const durationMs = Math.round(performance.now() - startedAt);
			if (controller.signal.aborted) {
				this.onRequestMetric?.({ path: url.pathname, durationMs, outcome: 'timeout' });
				throw new Pxp2TimeoutError('StudentVUE took too long to respond. Please try again.');
			}
			this.onRequestMetric?.({ path: url.pathname, durationMs, outcome: 'network-error' });
			throw cause;
		} finally {
			clearTimeout(timeout);
		}
		this.onRequestMetric?.({
			path: url.pathname,
			status: response.status,
			durationMs: Math.round(performance.now() - startedAt),
			outcome: 'response'
		});
		for (const cookie of response.headers.getSetCookie()) {
			const first = cookie.split(';', 1)[0] ?? '';
			const equal = first.indexOf('=');
			if (equal > 0) {
				const name = first.slice(0, equal);
				const value = first.slice(equal + 1);
				const deleted =
					/(?:^|;)\s*max-age=0(?:;|$)/i.test(cookie) ||
					/(?:^|;)\s*expires=(?:Thu, 01 Jan 1970|Wed, 31 Dec 1969)/i.test(cookie);
				if (deleted) this.cookies.delete(name);
				else this.cookies.set(name, value);
			}
		}
		return response;
	}
}

export function normalizeDistrictUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value.includes('://') ? value : `https://${value}`);
	} catch {
		throw new Pxp2InputError('Use a valid HTTPS Edupoint district portal URL.');
	}
	if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
		throw new Pxp2InputError('Use a supported HTTPS StudentVUE district portal URL.');

	if (url.hostname.endsWith('.edupoint.com')) return new URL('/', url);

	const hostname = url.hostname.toLowerCase();
	const requestedPath = portalBasePath(url.pathname).toLowerCase();
	const target = knownStudentVueTargets.find(
		(candidate) =>
			candidate.hostname === hostname &&
			(candidate.basePath === '/' ||
				requestedPath === candidate.basePath.toLowerCase() ||
				requestedPath.startsWith(candidate.basePath.toLowerCase()))
	);
	if (!target) throw new Pxp2InputError('Use a supported HTTPS StudentVUE district portal URL.');
	return new URL(target.basePath, url.origin);
}

async function responseText(response: Response, detectExpiredSession = true) {
	if (detectExpiredSession && response.url.includes('PXP2_Login'))
		throw new Pxp2SessionExpiredError('StudentVUE session expired.');
	if (!response.ok && response.status !== 302 && response.status !== 303)
		throw new Error('StudentVUE portal request failed.');
	return new TextDecoder().decode(
		await responseBytes(response, 5 * 1024 * 1024, 'StudentVUE portal response')
	);
}

async function responseJson<T>(response: Response): Promise<T> {
	const body = await responseText(response);
	try {
		return JSON.parse(body) as T;
	} catch {
		throw new Error('StudentVUE portal returned invalid JSON.');
	}
}

async function responseBytes(response: Response, maximumBytes: number, label: string) {
	const declaredLength = Number(response.headers.get('content-length') ?? '0');
	if (Number.isFinite(declaredLength) && declaredLength > maximumBytes)
		throw new Error(`${label} is too large.`);
	if (!response.body) return new Uint8Array();

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > maximumBytes) {
				await reader.cancel();
				throw new Error(`${label} is too large.`);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function text(value: unknown) {
	return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}
function identifier(value: unknown) {
	return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}
function numericText(value: unknown) {
	return identifier(value).match(/-?\d+(?:\.\d+)?/)?.[0] ?? '';
}
function gradeLetter(value: string) {
	const normalized = value.trim();
	if (!normalized || /^(?:N\/?A|N\.A\.|--|—)$/i.test(normalized)) return '';
	return normalized.match(/\b[A-F][+-]?(?![A-Z])/i)?.[0] ?? '';
}

function gradeCategories(classData: ClassData): PortalGradeCategory[] {
	if (classData.isAssignmentWeightingOn !== true) return [];
	const names = new Map(
		(classData.measureTypes ?? []).map((measureType) => [
			identifier(measureType.id),
			text(measureType.name)
		])
	);
	return (classData.measureTypeGrades ?? []).flatMap((grade) => {
		const name = names.get(identifier(grade.measureTypeId));
		const weight = numericText(grade.measureTypeWeight);
		const points = numericText(grade.points);
		const pointsPossible = numericText(grade.pointsPossible);
		if (!name || !weight || !points || !pointsPossible) return [];
		const weightedPercentage =
			Number(pointsPossible) === 0
				? '0'
				: String((Number(points) / Number(pointsPossible)) * Number(weight));
		return [
			{
				name,
				weight,
				points,
				pointsPossible,
				weightedPercentage,
				calculatedMark: text(grade.calculatedMark)
			}
		];
	});
}

function assignmentCategories(classData: ClassData) {
	const names = new Map(
		(classData.measureTypes ?? []).map((measureType) => [
			identifier(measureType.id),
			text(measureType.name)
		])
	);
	return new Map(
		(classData.assignments ?? []).flatMap((assignment) => {
			const assignmentId = identifier(assignment.gradeBookId);
			const category = names.get(identifier(assignment.measureTypeId));
			return assignmentId && category ? [[assignmentId, category] as const] : [];
		})
	);
}
function escapeRegExp(value: string) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function decodeHtml(value: string) {
	return value
		.replace(/&#x([0-9a-f]+);/gi, (_, digits: string) =>
			String.fromCodePoint(Number.parseInt(digits, 16))
		)
		.replace(/&#(\d+);/g, (_, digits: string) => String.fromCodePoint(Number(digits)))
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&nbsp;/g, '\u00a0')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&');
}
function stripHtml(value: string) {
	return decodeHtml(
		value
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function elementInnerHtml(html: string, id: string) {
	const open = new RegExp(`<([a-z][a-z0-9]*)[^>]*id=["']${escapeRegExp(id)}["'][^>]*>`, 'i').exec(
		html
	);
	if (!open) return undefined;
	const close = html.toLowerCase().lastIndexOf(`</${open[1]!.toLowerCase()}>`);
	const start = open.index + open[0].length;
	return close >= start ? html.slice(start, close) : undefined;
}

function jsonAssignment(html: string, variable: string): unknown {
	const marker = `${variable} = `;
	const start = html.indexOf(marker);
	const jsonStart = start + marker.length;
	if (start < 0 || html[jsonStart] !== '{') return undefined;
	let depth = 0,
		inString = false,
		escaped = false;
	for (let index = jsonStart; index < html.length; index += 1) {
		const char = html[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '{') depth += 1;
		else if (char === '}' && --depth === 0) {
			try {
				return JSON.parse(html.slice(jsonStart, index + 1));
			} catch {
				return undefined;
			}
		}
	}
}

function extractCourseHeaders(html: string) {
	const output = new Map<
		string,
		{ title: string; period: string; room: string; score: string; missing: string }
	>();
	const $ = load(html);
	$('.gb-class-header').each((_index, header) => {
		const details = $(header).next('.gb-class-row');
		const classId = details.attr('data-guid')?.trim();
		if (!classId) return;
		const titleText = $(header).find('.course-title').first().text().replace(/\s+/g, ' ').trim();
		const headerText = $(header).text();
		output.set(classId, {
			title: titleText.replace(/^\d+:\s*/, ''),
			period: titleText.match(/^(\d+):/)?.[1] ?? '',
			room: headerText.match(/Room:\s*([^\n]+)/i)?.[1]?.trim() ?? '',
			score: details.find('.mark').first().text().replace(/\s+/g, ' ').trim(),
			missing: details.text().match(/(\d+)\s+Missing Assignments/i)?.[1] ?? '0'
		});
	});
	return output;
}

function normalizeCourseTitle(value: string) {
	return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function tableFields(html: string) {
	const fields: Record<string, string> = {};
	for (const match of html.matchAll(
		/<[^>]*class=["'][^"']*tbl_label[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>([\s\S]*?)<\/t[dr]>/gi
	)) {
		const key = stripHtml(match[1] ?? '').replace(/:\s*$/, '');
		const value = stripHtml(match[2] ?? '');
		if (key && value) fields[key] = value;
	}
	return fields;
}

export function attendanceCourseRecords(html: string) {
	const $ = load(html);
	const table = $(
		'#attendance-by-course > .detail-grid > .school-detail > table.table-striped'
	).first();
	if (!table.length) return [];
	const rows = table.children('tbody').first().children('tr').toArray();
	const courses: Array<{
		course: string;
		totals: Record<string, number>;
		events: Array<Record<string, string>>;
	}> = [];
	for (let index = 0; index < rows.length; index += 1) {
		const row = $(rows[index]!);
		if (row.hasClass('empty-row') || row.hasClass('att-course-details')) continue;
		const cells = row
			.children('td')
			.toArray()
			.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
		if (cells.length < 7 || !cells[1]) continue;
		const detailRow = row.next('tr.att-course-details');
		const events = detailRow
			.find('table tbody tr')
			.toArray()
			.flatMap((eventRow) => {
				const values = $(eventRow)
					.children('td')
					.toArray()
					.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
				if (values.length < 5 || !portalDate(values[0] ?? '')) return [];
				return [
					{
						date: portalDate(values[0]!),
						startTime: values[1] ?? '',
						endTime: values[2] ?? '',
						absence: values[3] ?? '',
						reason: values[4] ?? ''
					}
				];
			});
		courses.push({
			course: cells[1],
			totals: {
				present: Number(cells[2]) || 0,
				tardy: Number(cells[3]) || 0,
				absent: Number(cells[4]) || 0,
				excused: Number(cells[5]) || 0,
				unexcused: Number(cells[6]) || 0
			},
			events
		});
	}
	return courses;
}

export function attendancePeriodRecords(html: string) {
	const $ = load(html);
	const table = $(
		'#attendance-by-period > .detail-grid > .school-detail > table.table-striped'
	).first();
	if (!table.length) return [];
	const rows = table.children('tbody').first().children('tr').toArray();
	const periods: Array<{
		period: string;
		startTime: string;
		endTime: string;
		totals: Record<string, number>;
		events: Array<Record<string, string>>;
	}> = [];
	for (const rowElement of rows) {
		const row = $(rowElement);
		if (row.hasClass('empty-row') || row.hasClass('att-course-details')) continue;
		const cells = row
			.children('td')
			.toArray()
			.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
		if (cells.length < 8 || !cells[1]) continue;
		const detailRow = row.next('tr.att-course-details');
		const events = detailRow
			.find('table tbody tr')
			.toArray()
			.flatMap((eventRow) => {
				const values = $(eventRow)
					.children('td')
					.toArray()
					.map((cell) => $(cell).text().replace(/\s+/g, ' ').trim());
				if (values.length < 3 || !portalDate(values[0] ?? '')) return [];
				return [
					{
						date: portalDate(values[0]!),
						absence: values[1] ?? '',
						reason: values[2] ?? ''
					}
				];
			});
		periods.push({
			period: cells[1],
			startTime: cells[2] ?? '',
			endTime: cells[3] ?? '',
			totals: {
				tardy: Number(cells[4]) || 0,
				absent: Number(cells[5]) || 0,
				excused: Number(cells[6]) || 0,
				unexcused: Number(cells[7]) || 0
			},
			events
		});
	}
	return periods;
}

function attendanceDays(data: Record<string, unknown> | undefined) {
	const attendanceData = data?.attendanceData as Record<string, unknown> | undefined;
	const calendar = attendanceData?.Calendar as Record<string, unknown> | undefined;
	const entries = calendar?.attData;
	if (!Array.isArray(entries))
		throw new Error('StudentVUE did not provide structured attendance data.');
	const start = mdyDate(text(calendar?.startDate));
	if (!start) throw new Error('StudentVUE returned an invalid attendance start date.');
	return entries.map((raw, index) => {
		const entry = raw as Record<string, unknown>;
		const date = new Date(start);
		date.setDate(start.getDate() + index);
		return {
			date: date.toISOString().slice(0, 10),
			type: identifier(entry.Type),
			reason: text(entry.Reason),
			holidayType: text(entry.HolType),
			pending: Boolean(entry.Pending)
		};
	});
}

function courseFocuses(html: string): CourseFocus[] {
	const output = new Map<string, CourseFocus>();
	const $ = load(html);
	$('.course-title[data-focus]').each((_index, element) => {
		const encoded = $(element).attr('data-focus');
		if (!encoded) return;
		try {
			const parsed = JSON.parse(decodeHtml(encoded)) as {
				LoadParams?: { ControlName?: unknown };
				FocusArgs?: unknown;
			};
			if (
				typeof parsed.LoadParams?.ControlName === 'string' &&
				parsed.FocusArgs &&
				typeof parsed.FocusArgs === 'object'
			) {
				const parameters = parsed.FocusArgs as Record<string, unknown>;
				const courseId = identifier(parameters.classID);
				if (courseId)
					output.set(courseId, { courseId, control: parsed.LoadParams.ControlName, parameters });
			}
		} catch {
			// Ignore malformed portal markup; it should not block every course.
		}
	});
	return [...output.values()];
}

function flattenCourseItems(items: unknown[]): CourseContentItem[] {
	const output: CourseContentItem[] = [];
	for (const item of items) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		if (Array.isArray(record.items)) output.push(...flattenCourseItems(record.items));
		else if (identifier(record.itemID) && text(record.title))
			output.push(record as CourseContentItem);
	}
	return output;
}

function courseAssignment(
	item: CourseContentItem,
	categoriesByAssignment: Map<string, string>
): Record<string, string> {
	const score = text(item.gradeMark);
	const possible = text(item.pointsPossible);
	const portalPoints = text(item.points);
	const assignmentId = identifier(item.itemID);
	const dueDate = portalDate(text(item.due_date));
	const assignedDate = portalDate(text(item.date)) || dueDate;
	return {
		AssignmentID: assignmentId,
		Measure: text(item.title),
		Type: categoriesByAssignment.get(assignmentId) || text(item.assignmentType),
		Date: assignedDate,
		DueDate: dueDate || assignedDate,
		Score: score,
		ScoreType: 'Raw Score',
		Points: pointPair(score, possible) || portalPoints,
		Notes: [text(item.commentText), text(item.publicNote)].filter(Boolean).join(' — '),
		Description: text(item.publicNote)
	};
}

/** Parse a modern Gradebook_AssignmentDetails fragment into the legacy assignment contract. */
export function parseGradebookAssignmentDetail(
	html: string,
	assignmentId: string
): Record<string, string> | undefined {
	const $ = load(html);
	const values: Record<string, string> = {};
	$('.info_tbl td').each((_index, cell) => {
		const label = $(cell).find('.tbl_label').first().text().replace(/:\s*$/, '').trim();
		const value = $(cell).find('.tbl_value').first().text().replace(/\s+/g, ' ').trim();
		if (label) values[label] = value;
	});
	const measure = values.Assignment ?? '';
	const date = portalDate(values.Date ?? values['Due Date'] ?? '');
	if (!measure || !date) return undefined;
	return {
		AssignmentID: assignmentId,
		Measure: measure,
		Type: values['Assignment Type'] ?? '',
		Date: date,
		DueDate: portalDate(values['Due Date'] ?? '') || date,
		Score: values.Score ?? '',
		ScoreType: values['Score Type'] ?? 'Raw Score',
		Points: values.Points ?? pointPair(values.Score, values.Points),
		Notes: values.Notes ?? '',
		Description: values.Description ?? ''
	};
}

const assignmentGridKeys = ['GBAssignment', 'GBPoints', 'GradebookID', 'Measure'];
const categoryGridKeys = [
	'CategoryName',
	'Category',
	'Weight',
	'WeightPercentage',
	'CategoryWeight',
	'WeightedPct',
	'CalculatedMark'
];

/** Parse the complete modern Gradebook_ClassDetails fragment. Exported for fixtures. */
export function parseGradebookClassDetail(html: string) {
	const gradeAnchor = html.indexOf('current-grade');
	const gradeSection = gradeAnchor < 0 ? '' : html.slice(gradeAnchor, gradeAnchor + 1200);
	const markText = stripHtml(
		/class=["']mark["'][^>]*>([\s\S]*?)<\//i.exec(gradeSection)?.[1] ?? ''
	);
	const letter = gradeLetter(markText);
	const displayedPercentage =
		/class=["']score["'][^>]*>\s*([-+]?\d+(?:\.\d+)?)\s*%/i.exec(gradeSection)?.[1] ?? '';
	const percentage =
		/^(?:N\/?A|N\.A\.|--|—)$/i.test(markText) && Number(displayedPercentage) === 0
			? ''
			: displayedPercentage;
	const split = html.indexOf('AssignmentsGrid');
	const categoryRows = findDataSourceWithKeys(
		split < 0 ? '' : html.slice(0, split),
		categoryGridKeys
	);
	const assignmentRows = findDataSourceWithKeys(
		split < 0 ? html : html.slice(split),
		assignmentGridKeys
	);
	return {
		hasAssignmentGrid: split >= 0,
		letter,
		percentage,
		categories: categoryRows.flatMap(detailCategory),
		assignments: assignmentRows.map(detailAssignment).filter((assignment) => assignment.Date)
	};
}

function detailCategory(row: Record<string, unknown>): PortalGradeCategory[] {
	const first = (...keys: string[]) => {
		for (const key of keys)
			if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
	};
	const name = stripHtml(cellText(first('CategoryName', 'Category', 'Type')));
	const weight = numericText(cellText(first('Weight', 'WeightPercentage', 'CategoryWeight')));
	if (!name || !weight) return [];
	return [
		{
			name,
			weight,
			points: numericText(cellText(first('Points', 'PointsEarned'))),
			pointsPossible: numericText(cellText(first('PointsPossible', 'PointPossible'))),
			weightedPercentage: numericText(cellText(first('WeightedPct', 'WeightedPercentage'))),
			calculatedMark: stripHtml(cellText(first('CalculatedMark', 'Mark', 'Letter')))
		}
	];
}

function detailAssignment(row: Record<string, unknown>): Record<string, string> {
	if (!('GBAssignment' in row || 'GBPoints' in row)) {
		return Object.fromEntries(
			Object.entries(row).flatMap(([key, value]) => {
				const normalized = cellText(value);
				return normalized === '' ? [] : [[key, normalized]];
			})
		);
	}

	const assignmentCell = row.GBAssignment;
	const assignmentSource =
		typeof assignmentCell === 'string' ? assignmentCell : JSON.stringify(assignmentCell ?? '');
	const minedId = /["']assignmentID\\?["']\s*:\s*["']?(-?\d+)/i.exec(
		decodeHtml(assignmentSource)
	)?.[1];
	const id =
		cellText(row.gradeBookId ?? row.GBAssignmentID ?? row.GradebookID ?? row.AssignmentID) ||
		minedId ||
		'';
	const pointsText = stripHtml(cellText(row.GBPoints));
	const scoreText = stripHtml(cellText(row.GBScore));
	const fraction = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(pointsText);
	const rawScore = /^(-?\d+(?:\.\d+)?)\s+out of\s+(-?\d+(?:\.\d+)?)$/i.exec(scoreText);
	const barePoints = /^-?\d+(?:\.\d+)?$/.test(pointsText);
	const bareScore = /^-?\d+(?:\.\d+)?$/.test(scoreText);
	let point = '';
	let pointPossible = '';
	if (fraction) {
		point = fraction[1]!;
		pointPossible = fraction[2]!;
	} else if (barePoints) {
		pointPossible = pointsText;
		if (bareScore) point = scoreText;
	}
	const rawDiffers = Boolean(
		rawScore &&
		(!fraction ||
			Number(rawScore[1]) !== Number(fraction[1]) ||
			Number(rawScore[2]) !== Number(fraction[2]))
	);
	return {
		AssignmentID: id,
		Measure: stripHtml(cellText(assignmentCell)),
		Type: stripHtml(cellText(row.GBAssignmentType ?? row.Type)),
		Date: portalDate(cellText(row.Date)),
		DueDate: portalDate(cellText(row.DueDate) || cellText(row.Date)),
		Score: scoreText,
		ScoreType: stripHtml(cellText(row.GBScoreType)) || 'Raw Score',
		Points: pointsText,
		...(point || fraction ? { Point: point } : {}),
		...(pointPossible ? { PointPossible: pointPossible } : {}),
		...(rawDiffers ? { ScoreCalValue: rawScore![1]!, ScoreMaxValue: rawScore![2]! } : {}),
		Notes: stripHtml(cellText(row.GBNotes)),
		Description: stripHtml(cellText(row.GBDescription ?? row.MeasureDescription))
	};
}

function cellText(value: unknown): string {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (trimmed.startsWith('{') && trimmed.includes('"value"')) {
			try {
				return cellText(JSON.parse(trimmed));
			} catch {
				// It is ordinary text that happens to start with a brace.
			}
		}
		return value;
	}
	if (typeof value === 'number') return String(value);
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		const inner = (value as Record<string, unknown>).value;
		if (inner !== undefined && inner !== value) return cellText(inner);
	}
	return '';
}

function extractJsonAfter(source: string, needle: string): unknown {
	const anchor = source.indexOf(needle);
	if (anchor < 0) return undefined;
	let start = anchor + needle.length;
	while (start < source.length && source[start] !== '[' && source[start] !== '{') start += 1;
	if (start >= source.length) return undefined;
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

function findDataSourceWithKeys(html: string, keys: string[]): Array<Record<string, unknown>> {
	const needle = '"dataSource":';
	let from = 0;
	while (from < html.length) {
		const index = html.indexOf(needle, from);
		if (index < 0) return [];
		const value = extractJsonAfter(html.slice(index), needle);
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			value[0] &&
			typeof value[0] === 'object' &&
			keys.some((key) => key in (value[0] as Record<string, unknown>))
		)
			return value as Array<Record<string, unknown>>;
		from = index + needle.length;
	}
	return [];
}

function portalDate(value: string) {
	if (!value) return '';
	const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (mdy) return `${Number(mdy[1])}/${Number(mdy[2])}/${mdy[3]}`;
	const shortMdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:\D|$)/);
	if (shortMdy)
		return `${Number(shortMdy[1])}/${Number(shortMdy[2])}/${2000 + Number(shortMdy[3])}`;
	const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) return `${Number(iso[2])}/${Number(iso[3])}/${iso[1]}`;
	const dotNet = value.match(/^\/Date\((-?\d+)/);
	const parsed = dotNet ? new Date(Number(dotNet[1])) : new Date(value);
	if (!Number.isFinite(parsed.getTime())) return '';
	return `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}/${parsed.getUTCFullYear()}`;
}

function dateMatches(value: string, month: number, year: number) {
	const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	return Boolean(match && Number(match[1]) === month && Number(match[3]) === year);
}

function pointPair(score: string | undefined, points: string | undefined) {
	if (!score || !points) return points ?? '';
	const earned = score.match(/\d+(?:\.\d+)?/)?.[0];
	const values = [...points.matchAll(/\d+(?:\.\d+)?/g)];
	const possible = values.at(-1)?.[0];
	return earned && possible ? `${earned} / ${possible}` : points;
}

function mdyDate(value: string) {
	const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	return m ? new Date(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12) : undefined;
}

function documentRows(html: string): PortalDocument[] {
	const marker = 'dataSource';
	let cursor = 0;
	while ((cursor = html.indexOf(marker, cursor)) >= 0) {
		const start = html.indexOf('[', cursor);
		const candidate = jsonArray(html, start);
		cursor += marker.length;
		if (
			!Array.isArray(candidate) ||
			!candidate.some((item) => item && typeof item === 'object' && 'DocumentUploadDate' in item)
		)
			continue;
		return candidate.flatMap((item) => {
			if (!item || typeof item !== 'object') return [];
			const row = item as Record<string, unknown>;
			const rawTitle = text(row.DocumentTitle);
			const href = decodeHtml(
				rawTitle.match(/href=["']([^"']*PXP_ShowDocument\.aspx[^"']*)["']/i)?.[1] ?? ''
			);
			let token = '';
			try {
				token = new URL(href, 'https://studentvue.invalid/').searchParams.get('docToken') ?? '';
			} catch {
				/* Ignore invalid portal markup. */
			}
			const title = stripHtml(rawTitle);
			const date = text(row.DocumentUploadDate);
			const category = text(row.DocumentCategory);
			return title && date && token ? [{ id: encodeOpaqueId(token), title, date, category }] : [];
		});
	}
	return [];
}

function encodeOpaqueId(value: string) {
	return Buffer.from(value, 'utf8').toString('base64url');
}
function decodeOpaqueId(value: string) {
	if (!/^[A-Za-z0-9_-]{1,8192}$/.test(value))
		throw new Pxp2InputError('Invalid document identifier.');
	return Buffer.from(value, 'base64url').toString('utf8');
}
function isUuid(value: string) {
	return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
}

async function mapWithConcurrency<T, U>(
	items: T[],
	concurrency: number,
	operation: (item: T) => Promise<U>
): Promise<U[]> {
	const output = new Array<U>(items.length);
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			while (cursor < items.length) {
				const index = cursor++;
				output[index] = await operation(items[index]!);
			}
		})
	);
	return output;
}

function jsonArray(value: string, start: number): unknown {
	if (start < 0 || value[start] !== '[') return undefined;
	let depth = 0,
		inString = false,
		escaped = false;
	for (let index = start; index < value.length; index += 1) {
		const char = value[index];
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '[') depth += 1;
		else if (char === ']' && --depth === 0) {
			try {
				return JSON.parse(value.slice(start, index + 1));
			} catch {
				return undefined;
			}
		}
	}
}
