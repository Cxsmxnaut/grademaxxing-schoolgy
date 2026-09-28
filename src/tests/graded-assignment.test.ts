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

	test('treats an empty points-earned value as graded (scored zero)', () => {
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

	test('excludes work marked not for grading even when a score exists', () => {
		expect(
			isGradedAssignment(assignment({ _Score: '9', _Notes: '(Not For Grading) completion only' }))
		).toBe(false);
	});
});
