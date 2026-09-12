import { getHiddenAssignmentsFromCategories } from '$lib/grades/assignments';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import { parseGradebookXML } from '$lib/synergy';
import { expect, test } from 'vitest';

test('course letter and percentage survive the StudentVUE adapter', () => {
	const xml = gradebookXml([
		{
			id: 'course-1',
			period: '1',
			title: 'Example Course',
			room: '100',
			teacher: 'Example Teacher',
			teacherEmail: '',
			score: 'A',
			scoreRaw: '94.5',
			missing: '0',
			categories: [
				{
					name: 'Assessments',
					weight: '40',
					points: '2',
					pointsPossible: '6',
					weightedPercentage: '13.3333333333',
					calculatedMark: 'F'
				}
			],
			assignments: []
		}
	]);
	const mark = parseGradebookXML(xml).Courses.Course[0]?.Marks?.Mark[0];

	expect(mark?._CalculatedScoreString).toBe('A');
	expect(mark?._CalculatedScoreRaw).toBe('94.5');
	expect(mark?.GradeCalculationSummary?.AssignmentGradeCalc).toEqual([
		{
			_Type: 'Assessments',
			_Weight: '40',
			_Points: '2',
			_PointsPossible: '6',
			_WeightedPct: '13.3333333333',
			_CalculatedMark: 'F'
		}
	]);
});

test('authoritative category totals synthesize a discrepancy when every graded assignment is hidden', () => {
	const hidden = getHiddenAssignmentsFromCategories(
		[
			{
				name: 'Assessments',
				weightPercentage: 40,
				pointsEarned: 2,
				pointsPossible: 6,
				weightedPercentage: 13.3333333333,
				gradeLetter: 'F'
			}
		],
		{}
	);

	expect(hidden).toHaveLength(1);
	expect(hidden[0]).toMatchObject({
		name: 'Point Discrepancy in Assessments',
		pointsEarned: 2,
		pointsPossible: 6,
		category: 'Assessments',
		hidden: true
	});
});
