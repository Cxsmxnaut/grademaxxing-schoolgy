import {
	calculatePointsNeededForTargetGrade,
	type Assignment,
	type Calculable,
	type CalculableWithCategory
} from '$lib/grades/assignments';
import { expect, test } from 'vitest';

function assignment(
	id: string,
	pointsEarned: number,
	pointsPossible: number,
	category?: string
): Calculable<Assignment> {
	return {
		id,
		name: id,
		pointsEarned,
		pointsPossible,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category,
		date: new Date('2026-08-30'),
		newHypothetical: false
	};
}

test('finals planner solves a points-based target', () => {
	const required = calculatePointsNeededForTargetGrade({
		targetGradePercentage: 93,
		assignmentPointsPossible: 100,
		hasCategories: false,
		otherAssignments: [assignment('existing', 90, 100)]
	});

	expect(required).toBe(96);
});

test('finals planner respects weighted category totals', () => {
	const otherAssignments = [
		assignment('assessment', 125, 140, 'Assessments'),
		assignment('homework', 80, 85, 'Homework')
	] as CalculableWithCategory<Assignment>[];

	const required = calculatePointsNeededForTargetGrade({
		targetGradePercentage: 93,
		assignmentPointsPossible: 100,
		hasCategories: true,
		otherAssignments,
		gradeCategoryWeightProportions: new Map([
			['Assessments', 0.6],
			['Homework', 0.4]
		]),
		assignmentCategoryName: 'Assessments'
	});

	expect(required).toBeCloseTo(96.4118, 3);
});
