import type { Attendance, AttendanceEventTotal } from '$lib/contracts/studentvue/attendance';
import type { Gradebook } from '$lib/contracts/studentvue/gradebook';
import type { Schedule } from '$lib/contracts/studentvue/schedule';
import { parseSynergyAssignment } from '$lib/grades/assignments';
import { getSynergyCourseAssignmentCategories, isGradedAssignment } from '$lib/grades/course';
import { removeCourseType } from '$lib/grades/course-name';
import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
import { getAbsenceType, getDailyType } from '$lib/studentvue/attendance-status';
import { fitMaxContext, sanitizeMaxContext } from './context';

interface AppRecords {
	gradebook?: Gradebook;
	reportingPeriod: string;
	gradebookAsOf?: number;
	gradebookError?: boolean;
	assignmentDetailsAvailable: boolean;
	gradeLevel?: number;
	attendance?: Attendance;
	attendanceAsOf?: number;
	attendanceError?: boolean;
	schedule?: Schedule;
	scheduleAsOf?: number;
	scheduleError?: boolean;
}
const iso = (time?: number) =>
	time !== undefined && Number.isFinite(time) ? new Date(time).toISOString() : null;
const status = (
	data: unknown,
	time: number | undefined,
	failed: boolean | undefined,
	ttl: number
) => (!data ? 'unavailable' : failed || !time || Date.now() - time > ttl ? 'stale' : 'available');
const periodTotals = (total?: AttendanceEventTotal) =>
	(total?.PeriodTotal ?? []).map((entry) => ({
		period: entry._Number,
		total: entry._Total.trim() === '' ? null : Number(entry._Total)
	}));

/** Read only app records and reuse the product's calculation/parsing code. */
export function buildMaxContextFromRecords(
	records: AppRecords,
	query = '',
	maximumBytes = 16 * 1024
) {
	const sourceCourses = records.gradebook?.Courses.Course ?? [];
	const gpa = calculateCourseGpas(sourceCourses, records.gradeLevel);
	const gradesStatus = status(
		records.gradebook,
		records.gradebookAsOf,
		records.gradebookError,
		30 * 60 * 1000
	);
	const courses = sourceCourses.map((course) => {
		const mark = course.Marks?.Mark[0];
		const all = mark?.Assignments?.Assignment ?? [];
		// Prefer assignment names mentioned in the question, then newest work.
		const selected = all
			.toSorted((a, b) => {
				const match = (name: string) =>
					name && query.toLowerCase().includes(name.toLowerCase()) ? 1 : 0;
				return (
					match(b._Measure) - match(a._Measure) ||
					(Date.parse(b._DueDate || b._Date) || 0) - (Date.parse(a._DueDate || a._Date) || 0)
				);
			})
			.slice(0, 40);
		const categories = getSynergyCourseAssignmentCategories(course) ?? [];
		return {
			course: removeCourseType(course._CourseName),
			markName: mark?._MarkName ?? '',
			letter: mark?._CalculatedScoreString ?? '',
			percent: Number.parseFloat(mark?._CalculatedScoreRaw ?? ''),
			assignmentCount: all.length,
			assignmentsOmitted: all.length - selected.length,
			categoriesOmitted: Math.max(0, categories.length - 20),
			categories,
			assignments: selected.map((source) => {
				const parsed = parseSynergyAssignment(source);
				return {
					name: parsed.name,
					category: parsed.category,
					dueDate: source._DueDate || source._Date,
					pointsEarned: parsed.pointsEarned,
					pointsPossible: parsed.pointsPossible,
					percent: parsed.officialPercentage,
					graded: isGradedAssignment(source),
					notForGrade: parsed.notForGrade,
					calculationUnavailable: parsed.calculationUnavailable
				};
			})
		};
	});
	const attendance = records.attendance;
	const incidents = attendance?.Absences?.Absence ?? [];
	const incidentDates = new Set(incidents.map((entry) => entry._AbsenceDate));
	const attendanceRecords = [
		...incidents.map((entry) => ({
			date: entry._AbsenceDate,
			status: getAbsenceType(entry.Periods.Period ?? []),
			periods: (entry.Periods.Period ?? []).map((period) => ({
				period: period._Number,
				course: removeCourseType(period._Course),
				status: getAbsenceType([period])
			}))
		})),
		...(attendance?.DailyRecords ?? [])
			.filter((entry) => !incidentDates.has(entry.Date))
			.map((entry) => ({
				date: entry.Date,
				status: getDailyType(entry.Status, entry.Reason),
				periods: []
			}))
	].toSorted((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
	const context = sanitizeMaxContext({
		reportingPeriod: records.reportingPeriod,
		dataAsOf: iso(records.gradebookAsOf),
		gradesStatus,
		assignmentDetailsAvailable: records.assignmentDetailsAvailable,
		gpa: {
			status: records.gradebook ? gradesStatus : 'unavailable',
			gradeLevel: records.gradeLevel,
			unweighted: gpa.unweighted,
			weighted: gpa.weighted,
			academicWeighted: gpa.academicWeighted,
			displayUnweighted: formatGpa(gpa.unweighted),
			displayWeighted: formatGpa(gpa.weighted),
			displayAcademicWeighted: formatGpa(gpa.academicWeighted),
			gradedCourses: gpa.graded.length
		},
		courses,
		attendance: {
			status: status(attendance, records.attendanceAsOf, records.attendanceError, 60 * 60 * 1000),
			dataAsOf: iso(records.attendanceAsOf),
			courseTotals: attendance?.CourseTotals?.map((course) => ({
				course: removeCourseType(course.Course),
				present: course.Present,
				tardy: course.Tardy,
				absent: course.Absent,
				excused: course.Excused,
				unexcused: course.Unexcused
			})),
			records: attendanceRecords.slice(0, 40),
			recordsOmitted: Math.max(0, attendanceRecords.length - 40),
			periodTotals: {
				excused: periodTotals(attendance?.TotalExcused),
				tardies: periodTotals(attendance?.TotalTardies),
				unexcused: periodTotals(attendance?.TotalUnexcused),
				activities: periodTotals(attendance?.TotalActivities),
				unexcusedTardies: periodTotals(attendance?.TotalUnexcusedTardies)
			}
		},
		schedule: {
			status: status(records.schedule, records.scheduleAsOf, records.scheduleError, 30 * 60 * 1000),
			dataAsOf: iso(records.scheduleAsOf),
			date: records.schedule?.date,
			classes: records.schedule?.classes?.map((entry) => ({
				course: removeCourseType(entry.courseTitle),
				period: entry.period,
				startTime: entry.startTime,
				endTime: entry.endTime
			}))
		}
	});
	return context ? fitMaxContext(context, maximumBytes) : null;
}
