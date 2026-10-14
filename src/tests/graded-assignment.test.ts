import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
import { getCourseAssignmentImpacts, isGradedAssignment } from '$lib/grades/course';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import { parseGradebookXML } from '$lib/synergy';
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

	test('rejects ungraded assignments after gradebook XML serialization', () => {
		const xml = gradebookXml([
			{
				id: 'course-1',
				period: '1',
				title: 'Pre-Calculus',
				room: '101',
				teacher: 'Teacher Example',
				teacherEmail: '',
				score: 'A',
				scoreRaw: '95',
				missing: '0',
				categories: [],
				assignments: [
					{
						AssignmentID: 'ungraded-1',
						Measure: '#32',
						Type: 'Homework',
						Date: '10/12/2026',
						DueDate: '10/12/2026',
						Score: 'Not Graded',
						Points: '10 Points Possible'
					},
					{
						AssignmentID: 'ungraded-2',
						Measure: 'Practicas 1-2',
						Type: 'Classwork',
						Date: '10/12/2026',
						DueDate: '10/12/2026',
						Score: '',
						Points: '10'
					},
					{
						AssignmentID: 'graded-1',
						Measure: 'Chapter 1 Test',
						Type: 'Tests',
						Date: '10/12/2026',
						DueDate: '10/12/2026',
						Score: '17 out of 23',
						Points: '17 / 23',
						Point: '17',
						PointPossible: '23',
						AssignmentPercentage: '73.91'
					}
				]
			}
		]);
		const assignments =
			parseGradebookXML(xml).Courses.Course[0]?.Marks?.Mark[0]?.Assignments?.Assignment ?? [];
		expect(assignments.filter(isGradedAssignment).map((item) => item._Measure)).toEqual([
			'Chapter 1 Test'
		]);
	});

	test('computes per-assignment grade impact deltas when course calculation matches official grade', () => {
		const xml = gradebookXml([
			{
				id: 'course-1',
				period: '1',
				title: 'Spanish II',
				room: '204',
				teacher: 'Teacher Example',
				teacherEmail: '',
				score: 'A-',
				scoreRaw: '90',
				missing: '0',
				categories: [
					{
						name: 'Assessments',
						weight: '100%',
						points: '90',
						pointsPossible: '100',
						weightedPercentage: '90%',
						calculatedMark: 'A-'
					}
				],
				assignments: [
					{
						AssignmentID: 'a2',
						Measure: 'Quiz 2',
						Type: 'Assessments',
						Date: '10/12/2026',
						DueDate: '10/12/2026',
						Score: '40 out of 50',
						Points: '40 / 50',
						Point: '40',
						PointPossible: '50'
					},
					{
						AssignmentID: 'a1',
						Measure: 'Quiz 1',
						Type: 'Assessments',
						Date: '10/05/2026',
						DueDate: '10/05/2026',
						Score: '50 out of 50',
						Points: '50 / 50',
						Point: '50',
						PointPossible: '50'
					}
				]
			}
		]);
		const course = parseGradebookXML(xml).Courses.Course[0]!;
		const impacts = getCourseAssignmentImpacts(course);
		expect(impacts.get('a1')).toBe(100);
		expect(impacts.get('a2')).toBe(-10);
	});
});

describe('getCourseAssignmentImpacts', () => {
	test('tolerates assignments that omit the Notes attribute entirely', () => {
		const xml = `<Gradebook><ReportingPeriod Index="0" GradePeriod="Quarter 1"/><ReportingPeriods><ReportPeriod Index="0" GradePeriod="Quarter 1"/></ReportingPeriods><Courses><Course CourseID="cache" CourseName="Cache Preview" Period="1" Staff="Example Teacher" Room="101"><Marks><Mark MarkName="Quarter 1" CalculatedScoreRaw="94" CalculatedScoreString="A"><Assignments><Assignment GradebookID="cache-assignment" Measure="Saved assignment" Type="Homework" Date="9/1/2026" DueDate="9/1/2026" Point="94" PointPossible="100"/></Assignments></Mark></Marks></Course></Courses></Gradebook>`;
		const gradebook = parseGradebookXML(xml);
		const course = gradebook.Courses.Course[0]!;
		expect(() => getCourseAssignmentImpacts(course)).not.toThrow();
	});
});
