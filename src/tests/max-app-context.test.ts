import type { Attendance } from '$lib/contracts/studentvue/attendance';
import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
import { buildMaxContextFromRecords } from '$lib/max/app-context';
import { sanitizeMaxContext } from '$lib/max/context';
import { parseGradebookXML } from '$lib/synergy';
import { describe, expect, test } from 'vitest';

const assignment = (name: string, date = '10/01/2026') =>
	`<Assignment Measure="${name}" Type="Tests" Date="${date}" DueDate="${date}" Point="10" PointPossible="10" DisplayScore="10 out of 10" AssignmentPercentage="100" Notes="private teacher comment" StudentID="private-student-id"/>`;
const gradebook = (assignments = assignment('Quiz 1')) =>
	parseGradebookXML(
		`<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseName="AP Biology" CourseID="private-course-id" Staff="private-teacher"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="94.25" CalculatedScoreString="A"><GradeCalculationSummary><AssignmentGradeCalc Type="Tests" Weight="60%" Points="80" PointsPossible="100" CalculatedMark="B-"/></GradeCalculationSummary><Assignments>${assignments}</Assignments></Mark></Marks></Course><Course CourseName="English" CourseID="2"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="83.5" CalculatedScoreString="B"><Assignments/></Mark></Marks></Course></Courses></Gradebook>`
	);
const attendance = {
	Absences: {
		Absence: [
			{
				_AbsenceDate: '10/01/2026',
				_Note: 'private medical note',
				Periods: {
					Period: [
						{
							_Number: '1',
							_Name: 'Medical/Dent',
							_Course: 'AP Biology',
							_Staff: 'private-teacher'
						}
					]
				}
			}
		]
	},
	DailyRecords: [
		{ Date: '10/01/2026', Status: 'Absent', Reason: 'private reason' },
		{ Date: '10/02/2026', Status: 'Present', Reason: '' }
	],
	CourseTotals: [
		{ Course: 'AP Biology', Present: 25, Tardy: 2, Absent: 3, Excused: 1, Unexcused: 2 }
	],
	TotalExcused: { PeriodTotal: [{ _Number: '1', _Total: '1' }] },
	TotalTardies: { PeriodTotal: [{ _Number: '1', _Total: '2' }] }
} as Attendance;
const records = () => ({
	gradebook: gradebook(),
	reportingPeriod: 'Quarter 1',
	gradebookAsOf: Date.now(),
	assignmentDetailsAvailable: true,
	gradeLevel: 10,
	attendance,
	attendanceAsOf: Date.now()
});

describe('Max uses the same academic records as the app', () => {
	test('preserves official marks and uses the app GPA helper/display instead of an AI grade scale', () => {
		const input = records();
		const context = buildMaxContextFromRecords(input)!;
		const gpa = calculateCourseGpas(input.gradebook.Courses.Course, 10);
		expect(context.gpa.unweighted).toBe(3.5);
		expect(context.gpa.weighted).toBe(4);
		expect(context.gpa.displayUnweighted).toBe(formatGpa(gpa.unweighted));
		expect(context.gpa.displayWeighted).toBe(formatGpa(gpa.weighted));
		expect(context.courses[0]!.percent).toBe(94.25); // Assignments alone would imply 100.
		expect(context.courses[0]!.categories[0]).toMatchObject({
			weightPercentage: 60,
			pointsEarned: 80,
			pointsPossible: 100
		});
		expect(context.courses[0]!.assignments[0]).toMatchObject({
			name: 'Quiz 1',
			percent: 100,
			graded: true
		});
	});

	test('keeps attendance period/course totals and dated generic statuses without private reasons', () => {
		const context = buildMaxContextFromRecords(records())!;
		expect(context.attendance.status).toBe('available');
		expect(context.attendance.courseTotals[0]).toMatchObject({ present: 25, tardy: 2, absent: 3 });
		expect(context.attendance.periodTotals.tardies).toEqual([{ period: '1', total: 2 }]);
		expect(context.attendance.records).toHaveLength(2); // Duplicate day feed excluded.
		expect(context.attendance.records[1]).toMatchObject({ date: '10/01/2026', status: 'Excused' });
		for (const privateValue of [
			'private medical note',
			'private reason',
			'Medical/Dent',
			'private-teacher',
			'private-student-id',
			'private teacher comment'
		]) {
			expect(JSON.stringify(context)).not.toContain(privateValue);
		}
	});

	test('reads the latest reporting period and records on each request', () => {
		const input = records();
		const first = buildMaxContextFromRecords(input)!;
		input.reportingPeriod = 'Semester 2';
		input.gradebook.Courses.Course[0]!.Marks!.Mark[0]!._CalculatedScoreString = 'C';
		input.gradebook.Courses.Course[0]!.Marks!.Mark[0]!._CalculatedScoreRaw = '74';
		const next = buildMaxContextFromRecords(input)!;
		expect(first.courses[0]!.percent).toBe(94.25);
		expect(next.courses[0]!.percent).toBe(74);
		expect(next.reportingPeriod).toBe('Semester 2');
		expect(next.gpa.unweighted).toBe(2.5);
	});

	test('does not convert unavailable data into zero GPA or zero absences', () => {
		const context = buildMaxContextFromRecords({
			reportingPeriod: '',
			assignmentDetailsAvailable: false
		})!;
		expect(context.gradesStatus).toBe('unavailable');
		expect(context.gpa.unweighted).toBeNull();
		expect(context.gpa.displayUnweighted).toBe('—');
		expect(context.attendance.status).toBe('unavailable');
		expect(context.attendance.courseTotals).toEqual([]);
	});

	test('marks cached data stale after a failed refresh and preserves official values', () => {
		const context = buildMaxContextFromRecords({
			...records(),
			gradebookError: true,
			attendanceError: true
		})!;
		expect(context.gradesStatus).toBe('stale');
		expect(context.attendance.status).toBe('stale');
		expect(context.courses[0]!.percent).toBe(94.25);
	});

	test('large records fit a byte budget and report omitted details, keeping the named assignment', () => {
		const assignments = Array.from({ length: 100 }, (_, index) =>
			assignment(`Quiz ${index} 文`.repeat(6))
		).join('');
		const context = buildMaxContextFromRecords(
			{ ...records(), gradebook: gradebook(assignments) },
			'Quiz 0 文'.repeat(6),
			6000
		)!;
		expect(new TextEncoder().encode(JSON.stringify(context)).byteLength).toBeLessThanOrEqual(6000);
		expect(context.courses).toHaveLength(2);
		expect(context.courses[0]!.assignmentCount).toBe(100);
		expect(context.courses[0]!.assignmentsOmitted + context.courses[0]!.assignments.length).toBe(
			100
		);
		expect(context.courses[0]!.assignments[0]!.name).toContain('Quiz 0 文');
	});

	test('server allowlist retains app data and strips nested private fields', () => {
		const context = buildMaxContextFromRecords(records())!;
		const input = {
			...context,
			name: 'private-name',
			attendance: { ...context.attendance, cookie: 'private-cookie' },
			gpa: { ...context.gpa, profile: 'private-profile' }
		};
		const sanitized = sanitizeMaxContext(input)!;
		expect(sanitized).toEqual(context);
		for (const privateValue of ['private-name', 'private-cookie', 'private-profile'])
			expect(JSON.stringify(sanitized)).not.toContain(privateValue);
	});
});
