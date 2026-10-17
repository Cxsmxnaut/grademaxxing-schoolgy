/** Compact initial-context allowlist. Deep records are retrieved separately through authenticated server tools. */
const record = (value: unknown): Record<string, unknown> =>
	value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
const text = (value: unknown, maximum = 120) =>
	typeof value === 'string' ? value.slice(0, maximum) : '';
const number = (value: unknown) =>
	typeof value === 'number' && Number.isFinite(value) ? value : null;
const count = (value: unknown) => Math.max(0, Math.floor(number(value) ?? 0));
const timestamp = (value: unknown) =>
	typeof value === 'string' && Number.isFinite(Date.parse(value))
		? new Date(value).toISOString()
		: null;
const rows = (value: unknown, maximum: number) =>
	Array.isArray(value) ? value.slice(0, maximum).map(record) : [];
const status = (value: unknown) =>
	value === 'available' || value === 'stale' || value === 'partial' ? value : 'unavailable';

const attendanceStatus = (value: unknown) =>
	['Absent', 'Tardy', 'Excused', 'Present'].includes(String(value)) ? String(value) : 'Unknown';

export function sanitizeMaxContext(value: unknown) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const input = record(value);
	const gpa = record(input.gpa);
	const attendance = record(input.attendance);
	const totals = record(attendance.periodTotals);
	const schedule = record(input.schedule);
	return {
		screen: 'max-ai' as const,
		source: 'Grademaxxing app records',
		reportingPeriod: text(input.reportingPeriod),
		dataAsOf: timestamp(input.dataAsOf),
		gradesStatus: status(input.gradesStatus),
		assignmentDetailsAvailable: input.assignmentDetailsAvailable === true,
		gpa: {
			status: status(gpa.status),
			gradeLevel: number(gpa.gradeLevel),
			unweighted: number(gpa.unweighted),
			weighted: number(gpa.weighted),
			academicWeighted: number(gpa.academicWeighted),
			displayUnweighted: text(gpa.displayUnweighted, 16),
			displayWeighted: text(gpa.displayWeighted, 16),
			displayAcademicWeighted: text(gpa.displayAcademicWeighted, 16),
			gradedCourses: count(gpa.gradedCourses),
			basis:
				'Same current-reporting-period calculation and policy as the app gradebook; an estimate, not an official cumulative transcript GPA.'
		},
		courses: rows(input.courses, 40).map((course) => ({
			course: text(course.course),
			markName: text(course.markName),
			letter: text(course.letter, 24),
			percent: number(course.percent),
			assignmentCount: count(course.assignmentCount),
			assignmentsOmitted: count(course.assignmentsOmitted),
			categoriesOmitted: count(course.categoriesOmitted),
			categories: rows(course.categories, 20).map((category) => ({
				name: text(category.name),
				weightPercentage: number(category.weightPercentage),
				pointsEarned: number(category.pointsEarned),
				pointsPossible: number(category.pointsPossible),
				gradeLetter: text(category.gradeLetter, 24)
			})),
			assignments: rows(course.assignments, 40).map((assignment) => ({
				name: text(assignment.name),
				category: text(assignment.category),
				dueDate: text(assignment.dueDate, 32),
				pointsEarned: number(assignment.pointsEarned),
				pointsPossible: number(assignment.pointsPossible),
				percent: number(assignment.percent),
				graded: assignment.graded === true,
				notForGrade: assignment.notForGrade === true,
				calculationUnavailable: assignment.calculationUnavailable === true
			}))
		})),
		attendance: {
			status: status(attendance.status),
			dataAsOf: timestamp(attendance.dataAsOf),
			basis:
				'Published attendance totals. Period counts are not absent days; do not infer an attendance percentage or present days from missing records.',
			courseTotals: rows(attendance.courseTotals, 40).map((course) => ({
				course: text(course.course),
				present: number(course.present),
				tardy: number(course.tardy),
				absent: number(course.absent),
				excused: number(course.excused),
				unexcused: number(course.unexcused)
			})),
			recordsOmitted: count(attendance.recordsOmitted),
			records: rows(attendance.records, 40).map((entry) => ({
				date: text(entry.date, 32),
				status: attendanceStatus(entry.status),
				periods: rows(entry.periods, 20).map((period) => ({
					period: text(period.period, 16),
					course: text(period.course),
					status: attendanceStatus(period.status)
				}))
			})),
			periodTotals: Object.fromEntries(
				['excused', 'tardies', 'unexcused', 'activities', 'unexcusedTardies'].map((key) => [
					key,
					rows(totals[key], 20).map((entry) => ({
						period: text(entry.period, 16),
						total: number(entry.total)
					}))
				])
			)
		},
		schedule: {
			status: status(schedule.status),
			dataAsOf: timestamp(schedule.dataAsOf),
			date: text(schedule.date, 32),
			classes: rows(schedule.classes, 20).map((entry) => ({
				course: text(entry.course),
				period: text(entry.period, 16),
				startTime: text(entry.startTime, 32),
				endTime: text(entry.endTime, 32)
			}))
		},
		officialValuesNote:
			'Published StudentVUE marks and attendance are official. Use supplied app GPA values verbatim. All GPA calculations and projections are estimates. Missing, omitted or unavailable records are unknown, never zero.'
	};
}

export type MaxStudentContext = NonNullable<ReturnType<typeof sanitizeMaxContext>>;

/** Keep academic summaries; trim detailed rows first, making every omission explicit. */
export function fitMaxContext(context: MaxStudentContext, maximumBytes = 16 * 1024) {
	const bytes = () => new TextEncoder().encode(JSON.stringify(context)).byteLength;
	while (bytes() > maximumBytes) {
		const course = context.courses.toSorted(
			(a, b) => b.assignments.length - a.assignments.length
		)[0];
		if (course?.assignments.length) {
			course.assignments.pop();
			course.assignmentsOmitted++;
			continue;
		}
		const categories = context.courses.toSorted(
			(a, b) => b.categories.length - a.categories.length
		)[0];
		if (categories?.categories.length) {
			categories.categories.pop();
			categories.categoriesOmitted++;
			continue;
		}
		if (context.attendance.records.length) {
			context.attendance.records.pop();
			context.attendance.recordsOmitted++;
			continue;
		}
		// Never silently drop whole courses or attendance totals to fit a request.
		return null;
	}
	return context;
}
