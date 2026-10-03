import {
	calculatePointsNeededForTargetGrade,
	getCalculableAssignmentsWithCategories,
	type Assignment
} from '$lib/grades/assignments';
import { expect, test } from 'vitest';

function work(category: string, earned: number, possible: number, extraCredit = false): Assignment {
	return {
		id: `${category}-${extraCredit ? 'bonus' : 'regular'}`,
		name: 'Sample work',
		category,
		pointsEarned: earned,
		pointsPossible: possible,
		unscaledPoints: undefined,
		extraCredit,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		newHypothetical: false,
		date: new Date('2026-09-01')
	};
}

test.each([0, 2])(
	'a final target cannot discard an extra-credit-only category with %s earned',
	(earned) => {
		const result = calculatePointsNeededForTargetGrade({
			hasCategories: true,
			targetGradePercentage: 93,
			assignmentPointsPossible: 100,
			assignmentCategoryName: 'Regular',
			gradeCategoryWeightProportions: new Map([
				['Regular', 0.9],
				['Bonus', 0.1]
			]),
			otherAssignments: getCalculableAssignmentsWithCategories([
				work('Regular', 80, 100),
				work('Bonus', earned, 0, true)
			])
		});
		expect(result).toBeNaN();
	}
);

test('extra credit within an ordinary category contributes to its final target', () => {
	const result = calculatePointsNeededForTargetGrade({
		hasCategories: true,
		targetGradePercentage: 93,
		assignmentPointsPossible: 100,
		assignmentCategoryName: 'Regular',
		gradeCategoryWeightProportions: new Map([['Regular', 1]]),
		otherAssignments: getCalculableAssignmentsWithCategories([
			work('Regular', 80, 100),
			work('Regular', 2, 0, true)
		])
	});
	expect(result).toBeCloseTo(104);
});

test('invalid final points have no target score', () => {
	expect(
		calculatePointsNeededForTargetGrade({
			hasCategories: false,
			targetGradePercentage: 93,
			assignmentPointsPossible: 0,
			otherAssignments: []
		})
	).toBeNaN();
});
