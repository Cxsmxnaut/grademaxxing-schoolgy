import { parseStudentVueTranscript } from '$lib/grades/transcript';
import { load } from 'cheerio';
import { Buffer } from 'node:buffer';
import { mapWithConcurrency } from './pxp2/concurrency';
import {
	Pxp2AuthenticationError,
	Pxp2InputError,
	Pxp2SessionExpiredError,
	Pxp2TimeoutError
} from './pxp2/errors';
import {
	assignmentCategories,
	attendanceCourseRecords,
	attendanceDays,
	attendancePeriodRecords,
	buildGradebookContext,
	courseAssignment,
	courseFocuses,
	dateMatches,
	decodeHtml,
	decodeOpaqueId,
	documentRows,
	elementInnerHtml,
	escapeRegExp,
	extractCourseHeaders,
	flattenCourseItems,
	gradeCategories,
	gradeLetter,
	identifier,
	isUuid,
	jsonAssignment,
	mdyDate,
	missingGradedAssignmentIds,
	normalizeCourseTitle,
	normalizeGradebookContext,
	numericText,
	parseGradebookAssignmentDetail,
	parseGradebookClassDetail,
	portalDate,
	reconcileAssignmentPoints,
	tableFields,
	text
} from './pxp2/parsers';
import { responseBytes, responseJson, responseText } from './pxp2/response';
import type {
	ClassData,
	Credentials,
	GradebookContext,
	GradingPeriod,
	PortalCalendarEvent,
	PortalFile,
	PortalGradebook,
	PortalGradeCategory,
	PortalScheduleClass,
	Pxp2RequestMetric,
	Pxp2SessionState,
	Pxp2TimingSpan
} from './pxp2/types';
import { normalizeDistrictUrl } from './pxp2/url';

export type {
	PortalCalendarEvent,
	PortalCourse,
	PortalDocument,
	PortalFile,
	PortalGradebook,
	PortalGradeCategory,
	PortalReportingPeriod,
	PortalScheduleClass,
	Pxp2RequestMetric,
	Pxp2SessionState,
	Pxp2TimingSpan
} from './pxp2/types';
export {
	attendanceCourseRecords,
	attendancePeriodRecords,
	normalizeDistrictUrl,
	parseGradebookAssignmentDetail,
	parseGradebookClassDetail,
	Pxp2AuthenticationError,
	Pxp2InputError,
	Pxp2SessionExpiredError,
	Pxp2TimeoutError
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
	private gradebookContext?: GradebookContext;

	private constructor(
		private readonly baseUrl: URL,
		private readonly onRequestMetric?: (metric: Pxp2RequestMetric) => void,
		private readonly onTimingSpan?: (span: Pxp2TimingSpan) => void
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

	static resume(
		state: Pxp2SessionState,
		onRequestMetric?: (metric: Pxp2RequestMetric) => void,
		onTimingSpan?: (span: Pxp2TimingSpan) => void
	) {
		const baseUrl = normalizeDistrictUrl(state.baseUrl);
		const client = new Pxp2Client(baseUrl, onRequestMetric, onTimingSpan);
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
		if (state.gradebookContext) {
			const context = normalizeGradebookContext(state.gradebookContext);
			if (context) client.gradebookContext = context;
		}
		return client;
	}

	exportSessionState(): Pxp2SessionState {
		return {
			baseUrl: this.baseUrl.toString(),
			cookies: Object.fromEntries(this.cookies),
			...(this.messageToken ? { messageToken: this.messageToken } : {}),
			...(this.gradebookContext ? { gradebookContext: this.gradebookContext } : {})
		};
	}

	/**
	 * Touch a lightweight authenticated page so StudentVUE's sliding server session
	 * remains alive while the student is actively using the app. No profile data is
	 * parsed or returned; following a login redirect is treated as an expired session.
	 */
	async keepAlive() {
		await this.pageHtml('studentInfo', 'keepalive_portal');
	}

	async gradebook(reportPeriod?: number, summary = false, fresh = false): Promise<PortalGradebook> {
		// A StudentVUE login has one mutable gradebook focus. Serialize whole gradebook
		// reads so two tabs requesting different periods cannot corrupt one another.
		const result = this.gradebookTail.then(() =>
			this.loadGradebook(reportPeriod, fresh ? false : summary, fresh)
		);
		this.gradebookTail = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async loadGradebook(
		reportPeriod?: number,
		summary = false,
		fresh = false
	): Promise<PortalGradebook> {
		let html: string;
		let focus: { FocusArgs?: Record<string, unknown> } | undefined;
		let periods: GradingPeriod[] = [];
		// An explicit refresh reloads the canonical portal context as well as every
		// class. The compact context is metadata, not a cached grade response, but
		// its period catalog can become stale after a district changes terms.
		if (fresh) this.gradebookContext = undefined;
		const cached = fresh ? undefined : await this.loadCachedGradebookState(reportPeriod);
		if (cached) {
			html = cached.html;
			periods = cached.context.periods.map((period) => ({
				Name: period.Name,
				GroupName: period.GroupName,
				GU: period.GU,
				OrgYearGU: period.OrgYearGU,
				schoolID: period.schoolID,
				defaultFocus: period.defaultFocus,
				MarkPeriods: period.markPeriodGU ? [{ GU: period.markPeriodGU }] : []
			}));
		} else {
			html = await this.pageHtml('gradebook', 'gb_context');
			this.timedSync('gb_context_parse', () => {
				focus = jsonAssignment(html, 'PXP.GBCurrentFocus') as {
					FocusArgs?: Record<string, unknown>;
				};
				if (!focus?.FocusArgs) throw new Error('StudentVUE grade book context was not found.');
				const focusData = jsonAssignment(html, 'PXP.GBFocusData') as
					{ GradingPeriods?: GradingPeriod[] } | undefined;
				periods = (focusData?.GradingPeriods ?? []).filter((period) => identifier(period.GU));
				this.gradebookContext = buildGradebookContext(focus.FocusArgs, periods);
			});
		}
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
		const args = focus?.FocusArgs ?? {
			AGU: cached?.context.AGU,
			gradePeriodGU: selected.GU
		};
		let gradebookHtml = html;
		if (identifier(selected.GU) !== identifier(args.gradePeriodGU)) {
			const loaded = await this.serviceCall<{ html?: unknown }>(
				'LoadControl',
				{
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
				},
				undefined,
				'gb_period'
			);
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
			'Classes',
			'gb_classes'
		);

		const { headers, focuses } = this.timedSync('gb_headers_parse', () => ({
			headers: extractCourseHeaders(gradebookHtml),
			focuses: courseFocuses(gradebookHtml)
		}));
		// The compact class control is expected to include the same focus metadata as the
		// full page. If a district omits it, reload once through the proven compatibility
		// path instead of returning a misleading incomplete detailed response.
		if (cached && !summary && focuses.length === 0) {
			this.gradebookContext = undefined;
			return this.loadGradebook(reportPeriod, summary);
		}
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
		const recoverMissingAssignments = async (
			classData: ClassData,
			visibleAssignments: Array<Record<string, string>>,
			focus: (typeof focuses)[number],
			classOrdinal: number
		) =>
			(
				await Promise.all(
					missingGradedAssignmentIds(classData, visibleAssignments).map(
						async (assignmentId, index) => {
							try {
								const detail = await this.serviceCall<{ html?: unknown }>(
									'LoadControl',
									{
										request: {
											control: 'Gradebook_AssignmentDetails',
											parameters: {
												...focus.parameters,
												viewName: null,
												assignmentID: /^\d+$/.test(assignmentId)
													? Number(assignmentId)
													: assignmentId
											}
										}
									},
									undefined,
									`gb_assignment_detail_${classOrdinal}_${index + 1}`
								);
								return this.timedSync(`gb_assignment_parse_${classOrdinal}_${index + 1}`, () =>
									parseGradebookAssignmentDetail(
										typeof detail.html === 'string' ? detail.html : '',
										assignmentId
									)
								);
							} catch {
								// Preserve the rest of the upstream class if one detail is unavailable.
								return undefined;
							}
						}
					)
				)
			).filter((assignment): assignment is Record<string, string> => assignment !== undefined);
		// StudentVUE keeps the selected class in the server session, so these focus changes
		// must remain serial. Gradebook_ClassDetails supplies the rendered category and
		// assignment grids; GetClassData supplies the bulk ID list so omitted rows can be
		// retrieved. The newer course-content endpoint also omits some graded rows.
		for (const [focusIndex, focus] of (safeSummary ? [] : focuses).entries()) {
			const classOrdinal = focusIndex + 1;
			const loaded = await this.serviceCall<{ html?: unknown }>(
				'LoadControl',
				{
					request: {
						control: focus.control,
						parameters: focus.parameters
					}
				},
				undefined,
				`gb_class_detail_${classOrdinal}`
			);
			const detailHtml = typeof loaded.html === 'string' ? loaded.html : '';
			const detail = this.timedSync(`gb_class_parse_${classOrdinal}`, () =>
				parseGradebookClassDetail(detailHtml)
			);
			if (detail.hasAssignmentGrid) {
				// The rendered grid can omit graded rows. The bulk class data identifies
				// them without guessing from the difference in category totals.
				const classData = await this.clientSideCall<ClassData>(
					'genericdata.classdata',
					'GetClassData',
					{},
					`gb_class_data_${classOrdinal}`
				).catch(() => undefined);
				const recovered = classData
					? await recoverMissingAssignments(classData, detail.assignments, focus, classOrdinal)
					: [];
				const { categories, letter, percentage } = this.timedSync(
					`gb_class_prepare_${classOrdinal}`,
					() => {
						const structuredCategories = classData ? gradeCategories(classData) : [];
						const renderedNames = new Set(detail.categories.map((category) => category.name));
						const usedCategoryNames = new Set(
							classData ? assignmentCategories(classData).values() : []
						);
						const categories =
							detail.categories.length > 0
								? [
										...detail.categories,
										...structuredCategories.filter(
											(category) =>
												!renderedNames.has(category.name) &&
												(Number(category.weight) === 0 ||
													(!usedCategoryNames.has(category.name) &&
														Number(category.points) === 0 &&
														Number(category.pointsPossible) === 0))
										)
									]
								: structuredCategories;
						const authoritativeGrade = classData?.students?.[0];
						const letter =
							detail.letter ||
							gradeLetter(text(authoritativeGrade?.calculatedMark)) ||
							gradeLetter(text(authoritativeGrade?.manualMark));
						const percentage =
							detail.percentage || (letter ? numericText(authoritativeGrade?.percentage) : '');
						return { categories, letter, percentage };
					}
				);
				assignmentsByCourse.set(
					focus.courseId,
					this.timedSync(`gb_class_reconcile_${classOrdinal}`, () =>
						reconcileAssignmentPoints(
							[...detail.assignments, ...recovered].toSorted(
								(a, b) =>
									(mdyDate(b.Date ?? '')?.getTime() ?? 0) - (mdyDate(a.Date ?? '')?.getTime() ?? 0)
							),
							categories,
							percentage,
							classData
						)
					)
				);
				gradesByCourse.set(focus.courseId, {
					letter,
					percentage,
					categories
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
					},
					`gb_course_items_${classOrdinal}`
				),
				this.clientSideCall<{ classGrade?: unknown; classPct?: unknown }>(
					'pxp.course.grade.card',
					'get',
					{},
					`gb_grade_card_${classOrdinal}`
				),
				this.clientSideCall<ClassData>(
					'genericdata.classdata',
					'GetClassData',
					{},
					`gb_class_data_${classOrdinal}`
				)
			]);
			const visibleAssignments = this.timedSync(`gb_class_prepare_${classOrdinal}`, () => {
				const items = flattenCourseItems(payload.responseData?.data ?? []);
				const categoriesByAssignment = assignmentCategories(classData);
				const visibleAssignments = items
					.map((item) => courseAssignment(item, categoriesByAssignment))
					.filter((assignment) => assignment.Date);
				return visibleAssignments;
			});
			const recoveredAssignments = await recoverMissingAssignments(
				classData,
				visibleAssignments,
				focus,
				classOrdinal
			);
			const categories = classData.enabled === false ? [] : gradeCategories(classData);
			const officialPercentage =
				numericText(gradeCard.classPct) || numericText(classData.students?.[0]?.percentage);
			assignmentsByCourse.set(
				focus.courseId,
				this.timedSync(`gb_class_reconcile_${classOrdinal}`, () =>
					reconcileAssignmentPoints(
						[...visibleAssignments, ...recoveredAssignments].toSorted(
							(a, b) =>
								(mdyDate(b.Date ?? '')?.getTime() ?? 0) - (mdyDate(a.Date ?? '')?.getTime() ?? 0)
						),
						categories,
						officialPercentage,
						classData
					)
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
				categories
			});
		}
		return this.timedSync('gb_result', () => {
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
		});
	}

	private async loadCachedGradebookState(reportPeriod?: number) {
		const context = this.gradebookContext;
		if (!context) return undefined;
		const defaultIndex = Math.max(
			0,
			context.periods.findIndex((period) => period.defaultFocus)
		);
		const selectedIndex = reportPeriod ?? defaultIndex;
		if (
			reportPeriod !== undefined &&
			(!Number.isSafeInteger(reportPeriod) ||
				reportPeriod < 0 ||
				reportPeriod >= context.periods.length)
		)
			throw new Pxp2InputError(`reportPeriod must be between 0 and ${context.periods.length - 1}.`);
		const selected = context.periods[selectedIndex];
		if (!selected) return undefined;
		const loaded = await this.serviceCall<{ html?: unknown }>(
			'LoadControl',
			{
				request: {
					control: 'Gradebook_SchoolClasses',
					parameters: {
						schoolID: selected.schoolID,
						OrgYearGU: selected.OrgYearGU,
						gradePeriodGU: selected.GU,
						GradingPeriodGroup: selected.GroupName,
						AGU: context.AGU
					}
				}
			},
			undefined,
			'gb_period'
		);
		const html = typeof loaded.html === 'string' ? loaded.html : '';
		if (!html.includes('data-focus') || extractCourseHeaders(html).size === 0) return undefined;
		return { html, context };
	}

	async attendance() {
		const data = jsonAssignment(await this.pageHtml('attendance'), 'PXP.StudentAttendanceData') as
			Record<string, unknown> | undefined;
		return attendanceDays(data);
	}

	async attendanceDetails() {
		const html = await this.pageHtml('attendance', 'attendance_portal');
		return this.timedSync('attendance_parse', () => {
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
		});
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
		const html = await this.pageHtml('studentInfo', 'student_profile_portal');
		const { fields, photoPath } = this.timedSync('student_profile_parse', () => {
			const fields = tableFields(html);
			if (Object.keys(fields).length === 0)
				throw new Error('StudentVUE did not provide structured student information.');
			const $ = load(html);
			return { fields, photoPath: $('img[alt="Student Photo"]').first().attr('src')?.trim() };
		});
		let photo: PortalFile | undefined;
		if (photoPath) {
			try {
				const downloaded = await this.download(
					photoPath,
					'StudentVUE student photo',
					'student_photo'
				);
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
		const html = await this.pageHtml('documents', 'documents_portal');
		return this.timedSync('documents_parse', () => documentRows(html));
	}

	async document(documentId: string): Promise<PortalFile> {
		const token = decodeOpaqueId(documentId);
		if (!token || token.length > 4096 || !/^[A-Za-z0-9._~+/=-]+$/.test(token))
			throw new Pxp2InputError('Invalid document identifier.');
		const query = new URLSearchParams({ AGU: '', docToken: token });
		return this.download(`PXP_ShowDocument.aspx?${query}`, 'StudentVUE document');
	}

	async folders() {
		const html = await this.pageHtml('messages', 'mail_portal');
		const accessToken = this.timedSync(
			'mail_parse',
			() => html.match(/ST\.Authorization\s*=\s*\{\s*"access_token"\s*:\s*"([^"]+)"/m)?.[1]
		);
		if (!accessToken) throw new Error('StudentVUE message authorization was not available.');
		this.messageToken = accessToken;
		const payload = await this.studentVueService<{ Result?: Array<Record<string, unknown>> }>(
			'ST.Messaging',
			'GetFolders',
			{},
			accessToken
		);
		return payload.Result ?? [];
	}

	/**
	 * List message previews for one folder. Defaults preserve the original inbox
	 * behavior; folder ids come from `folders()`.
	 */
	async messages(folderId: string | null = null, folderType = 0) {
		if (folderId !== null && (typeof folderId !== 'string' || folderId.length > 128))
			throw new Pxp2InputError('Invalid folder identifier.');
		if (!Number.isSafeInteger(folderType) || folderType < 0 || folderType > 64)
			throw new Pxp2InputError('Invalid folder type.');
		const html = await this.pageHtml('messages', 'mail_portal');
		const accessToken = this.timedSync(
			'mail_parse',
			() => html.match(/ST\.Authorization\s*=\s*\{\s*"access_token"\s*:\s*"([^"]+)"/m)?.[1]
		);
		if (!accessToken) throw new Error('StudentVUE message authorization was not available.');
		this.messageToken = accessToken;
		const payload = await this.studentVueService<{
			Result?: { data?: Array<Record<string, unknown>> };
		}>(
			'ST.Messaging',
			'GetMessages',
			{
				folderId,
				folderType,
				languageCode: 'en',
				showDeleted: false,
				skip: 0,
				take: 100,
				requireTotalCount: true
			},
			accessToken,
			'mail_inbox'
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

	private async download(path: string, label: string, timingName?: string): Promise<PortalFile> {
		const response = await this.timedStage(timingName, 'network', () => this.request(path));
		return this.timedStage(timingName, 'body', async () => {
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
			const upstreamMime = response.headers
				.get('content-type')
				?.split(';')[0]
				?.trim()
				.toLowerCase();
			const mimeType =
				upstreamMime &&
				/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(upstreamMime)
					? upstreamMime
					: 'application/octet-stream';
			return { base64: Buffer.from(bytes).toString('base64'), mimeType, fileName };
		});
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

	private async pageHtml(name: PageName, timingName?: string) {
		const response = await this.timedStage(timingName, 'network', () => this.request(pages[name]));
		return this.timedStage(timingName, 'body', async () => {
			const html = await responseText(response);
			if (response.url.includes('PXP2_Login'))
				throw new Pxp2SessionExpiredError('StudentVUE session expired.');
			return html;
		});
	}

	private async serviceCall<T>(
		method: string,
		body: unknown,
		property?: string,
		timingName?: string
	): Promise<T> {
		const response = await this.timedStage(timingName, 'network', () =>
			this.request(`service/PXP2Communication.asmx/${method}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
				body: JSON.stringify(body)
			})
		);
		return this.timedStage(timingName, 'body', async () => {
			const payload = await responseJson<{ d?: { Data?: unknown; Error?: { Message?: string } } }>(
				response
			);
			if (payload.d?.Error || payload.d?.Data === undefined)
				throw new Error(
					payload.d?.Error?.Message ?? 'StudentVUE did not return the requested data.'
				);
			const data = payload.d.Data as Record<string, unknown>;
			return (property ? data[property] : data) as T;
		});
	}

	private async studentVueService<T>(
		service: string,
		method: string,
		body: Record<string, unknown>,
		accessToken: string,
		timingName?: string
	): Promise<T> {
		const response = await this.timedStage(timingName, 'network', () =>
			this.request(`st_api/${service}/${method}?PORTAL=StudentVUE`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${accessToken}`,
					'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
				},
				body: new URLSearchParams({ data: JSON.stringify(body) })
			})
		);
		return this.timedStage(timingName, 'body', async () => {
			const html = await responseText(response);
			const encoded = elementInnerHtml(html, 'json-result');
			if (!encoded) throw new Error('StudentVUE service returned an unexpected response.');
			try {
				return JSON.parse(decodeHtml(encoded)) as T;
			} catch {
				throw new Error('StudentVUE service returned invalid JSON.');
			}
		});
	}

	private async clientSideCall<T>(
		friendlyName: string,
		method: string,
		parameters: Record<string, unknown>,
		timingName?: string
	): Promise<T> {
		const action = encodeURIComponent(`${friendlyName}-${method}`);
		const response = await this.timedStage(timingName, 'network', () =>
			this.request(`api/GB/ClientSideData/Transfer?action=${action}`, {
				method: 'POST',
				headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					FriendlyName: friendlyName,
					Method: method,
					Parameters: JSON.stringify(parameters)
				})
			})
		);
		return this.timedStage(timingName, 'body', async () => {
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
		});
	}

	private timedStage<T>(
		name: string | undefined,
		stage: 'network' | 'body',
		operation: () => Promise<T>
	) {
		return this.timed(name ? `${name}_${stage}` : undefined, operation);
	}

	private async timed<T>(name: string | undefined, operation: () => Promise<T>): Promise<T> {
		if (!name || !this.onTimingSpan) return operation();
		const startedAt = performance.now();
		try {
			return await operation();
		} finally {
			this.onTimingSpan({ name, durationMs: performance.now() - startedAt });
		}
	}

	private timedSync<T>(name: string, operation: () => T): T {
		if (!this.onTimingSpan) return operation();
		const startedAt = performance.now();
		try {
			return operation();
		} finally {
			this.onTimingSpan({ name, durationMs: performance.now() - startedAt });
		}
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
			response = await fetch(url, {
				...init,
				cache: 'no-store',
				headers,
				signal: init.signal ?? controller.signal
			});
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
