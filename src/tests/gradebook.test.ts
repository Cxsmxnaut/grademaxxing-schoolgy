import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
import { parseSynergyAssignment, type RealAssignment } from '$lib/grades/assignments';
import { estimateHypotheticalLetter } from '$lib/grades/grade-scale';
import { expect, test } from 'vitest';

test('Normal Assignment', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: '3 out of 4',
		_ScoreCalValue: '3',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '3 / 4',
		_Point: '3',
		_PointPossible: '4',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual({
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: 3,
		pointsPossible: 4,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	});
});

test('Malformed assignment date falls back to the due date', () => {
	const assignment = {
		Resources: null,
		Standards: null,
		_GradebookID: 'bad-date',
		_Measure: 'Portal date edge case',
		_Type: 'Assignment',
		_Date: '/Date(not-a-number)/',
		_DueDate: '8/27/2026',
		_DisplayScore: 'Not Graded',
		_TimeSincePost: '',
		_TotalSecondsSincePost: '0',
		_ScoreType: 'Raw Score',
		_Points: '10 Points Possible',
		_Notes: '',
		_TeacherID: '',
		_StudentID: '',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '',
		_DropEndDate: ''
	} satisfies AssignmentEntity;

	expect(parseSynergyAssignment(assignment).date).toEqual(new Date('8/27/2026'));
});

test('Normal Assignment - _Point is empty string', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: '0 out of 4',
		_ScoreCalValue: '0',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '/ 4',
		_Point: '',
		_PointPossible: '4',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual({
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: 0,
		pointsPossible: 4,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	});
});

test('Not Graded Assignment - Points Possible', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: 'Not Graded',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '4 Points Possible',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	const match: RealAssignment = {
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: undefined,
		pointsPossible: 4,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual(match);

	synergyAssignment._ScoreMaxValue = undefined;

	expect(parseSynergyAssignment(synergyAssignment)).toEqual(match);
});

test('Not Graded Assignment - No Points Possible', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: 'Not Graded',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreType: 'Raw Score',
		_Points: 'Points Possible',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual({
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: undefined,
		pointsPossible: undefined,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	});
});

test('Extra Credit Assignment', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: '3 out of 4',
		_ScoreCalValue: '3',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '3 /',
		_Point: '3',
		_PointPossible: '',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual({
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: 3,
		pointsPossible: 4,
		unscaledPoints: undefined,
		extraCredit: true,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	});
});

test('Extra Credit Assignment - blank maximum never becomes NaN', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: 'extra-credit-blank-maximum',
		_Measure: 'Syllabus Signed',
		_Type: 'Practice',
		_Date: '8/21/2026',
		_DueDate: '8/21/2026',
		_DisplayScore: '0',
		_ScoreCalValue: '0',
		_TimeSincePost: '',
		_TotalSecondsSincePost: '0',
		_ScoreMaxValue: '',
		_ScoreType: 'Raw Score',
		_Points: '0 /',
		_Point: '0',
		_PointPossible: '',
		_Notes: '',
		_TeacherID: '',
		_StudentID: '',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '',
		_DropEndDate: ''
	};

	const parsed = parseSynergyAssignment(synergyAssignment);
	expect(parsed.pointsEarned).toBe(0);
	expect(parsed.pointsPossible).toBeUndefined();
	expect(parsed.extraCredit).toBe(true);
});

test('Not For Grading Assignment', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: '3 out of 4',
		_ScoreCalValue: '3',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '3 / 4',
		_Point: '3',
		_PointPossible: '4',
		_Notes: '(Not For Grading)',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual({
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: 3,
		pointsPossible: 4,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: true,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	});
});

test('recognizes a non-graded marker despite StudentVUE capitalization or whitespace', () => {
	const assignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: 'not-graded-marker',
		_Measure: 'Practice',
		_Type: 'Practice',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: '4 out of 4',
		_ScoreCalValue: '4',
		_TimeSincePost: '',
		_TotalSecondsSincePost: '0',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '4 / 4',
		_Point: '4',
		_PointPossible: '4',
		_Notes: '  (not for grading) teacher feedback',
		_TeacherID: '',
		_StudentID: '',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '',
		_DropEndDate: ''
	};

	const parsed = parseSynergyAssignment(assignment);
	expect(parsed.notForGrade).toBe(true);
	expect(parsed.comments).toBe('teacher feedback');
});

test('uses a class’s observed whole-letter style for hypothetical letters', () => {
	expect(estimateHypotheticalLetter(91, [{ percentage: 91, letter: 'A' }])).toEqual({
		letter: 'A',
		basis: 'observed'
	});
	expect(estimateHypotheticalLetter(90, [{ percentage: 91, letter: 'A' }])).toEqual({
		letter: 'A',
		basis: 'class-pattern'
	});
	expect(estimateHypotheticalLetter(91, [{ percentage: 91, letter: 'A-' }])).toEqual({
		letter: 'A-',
		basis: 'observed'
	});
	expect(estimateHypotheticalLetter(92, [{ percentage: 91, letter: 'A-' }])).toEqual({
		letter: 'A-',
		basis: 'class-pattern'
	});
	expect(estimateHypotheticalLetter(Number.NaN, [])).toBeUndefined();
});

test('Scaled Assignment', () => {
	const synergyAssignment: AssignmentEntity = {
		Resources: null,
		Standards: null,
		_GradebookID: '123456',
		_Measure: 'Ch. 3 Quiz',
		_Type: 'Quiz',
		_Date: '1/1/2024',
		_DueDate: '1/1/2024',
		_DisplayScore: '3 out of 4',
		_ScoreCalValue: '3',
		_TimeSincePost: '4h',
		_TotalSecondsSincePost: '17554.6023012',
		_ScoreMaxValue: '4',
		_ScoreType: 'Raw Score',
		_Points: '6 / 8',
		_Point: '6',
		_PointPossible: '8',
		_Notes: '',
		_TeacherID: '11111',
		_StudentID: '22222',
		_MeasureDescription: '',
		_HasDropBox: false,
		_DropStartDate: '1/1/2024',
		_DropEndDate: '1/1/2024'
	};

	expect(parseSynergyAssignment(synergyAssignment)).toEqual({
		name: 'Ch. 3 Quiz',
		id: '123456',
		pointsEarned: 6,
		pointsPossible: 8,
		unscaledPoints: {
			pointsEarned: 3,
			pointsPossible: 4
		},
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Quiz',
		date: new Date('1/1/2024'),
		newHypothetical: false
	});
});
