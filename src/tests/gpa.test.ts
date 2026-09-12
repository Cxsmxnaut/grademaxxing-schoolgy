import type { Course } from '$lib/contracts/studentvue/gradebook';
import {
	calculateCourseGpas,
	calculateCreditWeightedGpa,
	calculateGpa,
	calculateGpaPipelines,
	formatGpa,
	isWeightedCourseName,
	letterGradePoints
} from '$lib/grades/gpa';
import { parseStudentVueTranscript } from '$lib/grades/transcript';
import { describe, expect, test } from 'vitest';

function course(name: string, letter: string, percentage = 90): Course {
	return {
		Marks: {
			Mark: [
				{
					StandardViews: null,
					GradeCalculationSummary: null,
					Assignments: null,
					AssignmentsSinceLastAccess: null,
					_MarkName: 'Quarter 1',
					_ShortMarkName: 'Q1',
					_CalculatedScoreString: letter,
					_CalculatedScoreRaw: String(percentage)
				}
			]
		},
		_Period: '1',
		_Title: name,
		_CourseName: name,
		_CourseID: name,
		_Room: '',
		_Staff: '',
		_StaffEMail: '',
		_StaffGU: '',
		_ImageType: '',
		_HighlightPercentageCutOffForProgressBar: '0',
		_UsesRichContent: false
	};
}

test('uses the PUSD provisional flat four-point grade matrix', () => {
	expect(letterGradePoints('A-')).toBe(4);
	expect(letterGradePoints('B+')).toBe(3);
	expect(letterGradePoints('F')).toBe(0);
	expect(letterGradePoints('NC')).toBe(0);
	expect(letterGradePoints('NP')).toBe(0);
	expect(letterGradePoints('P')).toBeUndefined();
});

test('recognizes common advanced course names', () => {
	expect(isWeightedCourseName('AP Calculus BC')).toBe(true);
	expect(isWeightedCourseName('English 10 Honors')).toBe(true);
	expect(isWeightedCourseName('IB Biology')).toBe(true);
	expect(isWeightedCourseName('Pre-Calculus')).toBe(false);
});

test('calculates estimated weighted and unweighted GPAs', () => {
	const result = calculateCourseGpas([course('AP Calculus BC', 'A'), course('English', 'B+')]);
	expect(result.unweighted).toBe(3.5);
	expect(result.weighted).toBe(4);
	expect(result.graded).toHaveLength(2);
});

test('returns no GPA for an empty set of points', () => {
	expect(calculateGpa([])).toBeUndefined();
});

test('calculates the three transcript pipelines from a filtered enrollment ledger', () => {
	const result = calculateGpaPipelines([
		{
			courseName: 'AP Calculus',
			letter: 'A-',
			credits: 5,
			gradeLevel: 10,
			excludeFromGpa: false,
			academic: true
		},
		{
			courseName: 'English Honors',
			letter: 'B+',
			credits: 5,
			gradeLevel: 11,
			excludeFromGpa: false,
			academic: true
		},
		{
			courseName: 'Physical Education',
			letter: 'A',
			credits: 5,
			gradeLevel: 11,
			excludeFromGpa: false,
			academic: false
		},
		{
			courseName: 'AP Algebra 1',
			letter: 'A',
			credits: 5,
			gradeLevel: 8,
			excludeFromGpa: false,
			academic: true
		},
		{
			courseName: 'AP Chemistry',
			letter: 'F',
			credits: 5,
			gradeLevel: 10,
			excludeFromGpa: true,
			academic: true
		}
	]);
	expect(result).toEqual({
		unweighted: 3.667,
		weighted: 4.167,
		academicWeighted: 4.25,
		attemptedCredits: 15,
		academicCredits: 10
	});
});

test('does not apply a rigor bonus below the C-passing threshold', () => {
	const result = calculateGpaPipelines([
		{
			courseName: 'AP Biology',
			letter: 'D+',
			credits: 5,
			gradeLevel: 10,
			excludeFromGpa: false,
			academic: true
		},
		{
			courseName: 'AP Biology',
			letter: 'C-',
			credits: 5,
			gradeLevel: 10,
			excludeFromGpa: false,
			academic: true
		}
	]);
	expect(result.weighted).toBe(2);
});

test('counts no-credit and no-pass outcomes as failing attempted credits', () => {
	const result = calculateGpaPipelines([
		{
			courseName: 'English',
			letter: 'A',
			credits: 5,
			gradeLevel: 10,
			excludeFromGpa: false,
			academic: true
		},
		{
			courseName: 'Elective',
			letter: 'NC',
			credits: 5,
			gradeLevel: 10,
			excludeFromGpa: false,
			academic: false
		}
	]);
	expect(result.unweighted).toBe(2);
	expect(result.attemptedCredits).toBe(10);
});

test('uses credit weights and avoids the 3.675 display artifact', () => {
	expect(
		calculateCreditWeightedGpa([
			{ points: 4, credits: 5 },
			{ points: 3, credits: 10 }
		])
	).toBe(3.333);
	expect(formatGpa(3.675)).toBe('3.68');
});

test('uses the supplied live grade level instead of assuming ninth grade', () => {
	const eighthGradeResult = calculateCourseGpas([course('AP Algebra 1', 'A')], 8);
	const ninthGradeResult = calculateCourseGpas([course('AP Algebra 1', 'A')], 9);
	expect(eighthGradeResult.unweighted).toBeUndefined();
	expect(ninthGradeResult.weighted).toBe(5);
});

test('minimizes a report-card payload into a credit-bearing transcript ledger', () => {
	const transcript = parseStudentVueTranscript({
		schoolGrades: [
			{
				gradeLevel: 11,
				finalGrades: [
					{ courseTitle: 'AP Calculus', finalMark: 'A', creditsAttempted: '5' },
					{ courseTitle: 'Physical Education', finalMark: 'A', creditsAttempted: 5 }
				]
			}
		]
	});
	expect(transcript.enrollments).toEqual([
		{
			courseName: 'AP Calculus',
			letter: 'A',
			credits: 5,
			gradeLevel: 11,
			excludeFromGpa: false,
			academic: true
		},
		{
			courseName: 'Physical Education',
			letter: 'A',
			credits: 5,
			gradeLevel: 11,
			excludeFromGpa: false,
			academic: false
		}
	]);
});

test('does not invent missing transcript credit or grade-level values', () => {
	expect(
		parseStudentVueTranscript({ schoolGrades: [{ courseTitle: 'AP Biology', finalMark: 'A' }] })
			.enrollments
	).toEqual([]);
});

describe('synthetic transcript edge cases', () => {
	test('keeps a course rigor bonus dynamic as its current mark changes', () => {
		const base = {
			courseName: 'AP Physics',
			credits: 5,
			gradeLevel: 11,
			excludeFromGpa: false,
			academic: true
		};
		expect(calculateGpaPipelines([{ ...base, letter: 'D' }]).weighted).toBe(1);
		expect(calculateGpaPipelines([{ ...base, letter: 'A' }]).weighted).toBe(5);
	});

	test('handles a mixed synthetic student ledger without leaking excluded records', () => {
		const result = calculateGpaPipelines([
			{
				courseName: 'AP Calculus',
				letter: 'A-',
				credits: 5,
				gradeLevel: 11,
				excludeFromGpa: false,
				academic: true
			},
			{
				courseName: 'World Literature Honors',
				letter: 'B+',
				credits: 5,
				gradeLevel: 11,
				excludeFromGpa: false,
				academic: true
			},
			{
				courseName: 'Physical Education',
				letter: 'A',
				credits: 5,
				gradeLevel: 11,
				excludeFromGpa: false,
				academic: false
			},
			{
				courseName: 'Algebra 1',
				letter: 'A',
				credits: 5,
				gradeLevel: 8,
				excludeFromGpa: false,
				academic: true
			},
			{
				courseName: 'Repeated Chemistry',
				letter: 'F',
				credits: 5,
				gradeLevel: 10,
				excludeFromGpa: true,
				academic: true
			},
			{
				courseName: 'Service Learning',
				letter: 'CR',
				credits: 5,
				gradeLevel: 11,
				excludeFromGpa: false,
				academic: false
			}
		]);

		expect(result).toEqual({
			unweighted: 3.667,
			weighted: 4.167,
			academicWeighted: 4.25,
			attemptedCredits: 15,
			academicCredits: 10
		});
	});

	test.each([
		{ letter: 'P', expectedCredits: 0 },
		{ letter: 'CR', expectedCredits: 0 },
		{ letter: 'NC', expectedCredits: 5 },
		{ letter: 'NP', expectedCredits: 5 },
		{ letter: 'Unposted', expectedCredits: 0 }
	])('handles $letter consistently in a pass/fail profile', ({ letter, expectedCredits }) => {
		const result = calculateGpaPipelines([
			{
				courseName: 'Student Leadership',
				letter,
				credits: 5,
				gradeLevel: 10,
				excludeFromGpa: false,
				academic: false
			}
		]);
		expect(result.attemptedCredits).toBe(expectedCredits);
		expect(result.unweighted).toBe(0);
	});

	test('uses unequal credits rather than averaging course counts', () => {
		const result = calculateGpaPipelines([
			{
				courseName: 'English',
				letter: 'A',
				credits: 5,
				gradeLevel: 10,
				excludeFromGpa: false,
				academic: true
			},
			{
				courseName: 'Elective',
				letter: 'B',
				credits: 10,
				gradeLevel: 10,
				excludeFromGpa: false,
				academic: false
			}
		]);
		expect(result.unweighted).toBe(3.333);
		expect(result.academicWeighted).toBe(4);
	});
});
