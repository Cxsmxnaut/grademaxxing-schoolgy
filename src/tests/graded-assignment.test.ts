import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
import { isGradedAssignment } from '$lib/grades/course';
import { describe, expect, test } from 'vitest';

function assignment(overrides: Partial<AssignmentEntity> = {}): AssignmentEntity {
	return {
		Resources: null,
		Standards: null,
		_GradebookID: '1',
		_Measure: 'Quiz',
		_Type: 'Quiz',
		_Date: '9/1/2026',
		_DueDate: '9/2/2026',
		_DisplayScore: 'Not Graded',
		_TimeSincePost: '1d',
		_TotalSecondsSincePost: '86400',
		_ScoreType: 'Raw Score',
		_Points: '10 Points Possible',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '9/1/2026',
		_DropEndDate: '9/2/2026',
		...overrides
	};
}

describe('isGradedAssignment', () => {
	test('accepts an official percentage when weighted earned points are unavailable', () => {
		expect(isGradedAssignment(assignment({ _DisplayScore: '', _AssignmentPercentage: '80' }))).toBe(
			true
		);
		expect(isGradedAssignment(assignment({ _DisplayScore: '', _AssignmentPercentage: '0' }))).toBe(
			true
		);
		expect(isGradedAssignment(assignment({ _AssignmentPercentage: 'NaN' }))).toBe(false);
	});

	test('rejects posted-but-ungraded assignments', () => {
		expect(isGradedAssignment(assignment())).toBe(false);
	});

	test('accepts a graded assignment with a numeric score', () => {
		expect(
			isGradedAssignment(
				assignment({
					_DisplayScore: '9 out of 10',
					_Score: '9',
					_ScoreCalValue: '9',
					_ScoreMaxValue: '10',
					_Points: '9 / 10',
					_Point: '9',
					_PointPossible: '10'
				})
			)
		).toBe(true);
	});

	test('treats a zero in a score field as graded even with an empty points value', () => {
		expect(
			isGradedAssignment(
				assignment({
					_DisplayScore: '0 out of 10',
					_Score: '0',
					_ScoreCalValue: '0',
					_ScoreMaxValue: '10',
					_Points: '0 / 10',
					_Point: '',
					_PointPossible: '10'
				})
			)
		).toBe(true);
	});

	test('rejects district posts where score fields exist but are empty strings', () => {
		expect(
			isGradedAssignment(
				assignment({
					_Score: '',
					_ScoreCalValue: '',
					_Point: '',
					_PointPossible: '10'
				})
			)
		).toBe(false);
	});

	test('rejects non-numeric score strings', () => {
		expect(isGradedAssignment(assignment({ _Score: '—', _Point: 'TBD' }))).toBe(false);
	});

	test('rejects assignments the portal displays as Not Graded', () => {
		expect(isGradedAssignment(assignment({ _DisplayScore: 'Not Graded', _Score: '10' }))).toBe(
			false
		);
	});

	test('excludes work marked not for grading even when a score exists', () => {
		expect(
			isGradedAssignment(assignment({ _Score: '9', _Notes: '(Not For Grading) completion only' }))
		).toBe(false);
	});
});
