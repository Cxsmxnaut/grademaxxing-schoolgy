import {
	calculateCourseGpas,
	calculateGpa,
	isWeightedCourseName,
	letterGradePoints
} from '$lib/grades/gpa';
import type { Course } from '$lib/types/Gradebook';
import { expect, test } from 'vitest';

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

test('maps common letter grades to a four-point scale', () => {
	expect(letterGradePoints('A-')).toBe(3.7);
	expect(letterGradePoints('B+')).toBe(3.3);
	expect(letterGradePoints('F')).toBe(0);
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
	expect(result.unweighted).toBeCloseTo(3.65);
	expect(result.weighted).toBeCloseTo(4.15);
	expect(result.graded).toHaveLength(2);
});

test('returns no GPA for an empty set of points', () => {
	expect(calculateGpa([])).toBeUndefined();
});
