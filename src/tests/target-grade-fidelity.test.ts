import {
	calculateCourseGradePercentageFromCategories,
	calculatePointsNeededForTargetGrade,
	getCalculableAssignmentsWithCategories,
	getPointsByCategory,
	type Assignment,
	type Category
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
	'a final target leaves an extra-credit-only category with %s earned inactive',
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
		expect(result).toBeCloseTo(106);
	}
);

test('targeting an inactive category retains its bonus and agrees with the forward calculation', () => {
	const otherAssignments = getCalculableAssignmentsWithCategories([
		work('Tests', 80, 100),
		work('Final', 2, 0, true)
	]);
	const weights = new Map([
		['Tests', 0.85],
		['Final', 0.15]
	]);
	const required = calculatePointsNeededForTargetGrade({
		hasCategories: true,
		targetGradePercentage: 83,
		assignmentPointsPossible: 100,
		assignmentCategoryName: 'Final',
		gradeCategoryWeightProportions: weights,
		otherAssignments
	});
	expect(required).toBeCloseTo(98);
	const categories: Category[] = [...weights].map(([name, weight]) => ({
		name,
		weightPercentage: weight * 100,
		pointsEarned: 0,
		pointsPossible: 0,
		weightedPercentage: 0,
		gradeLetter: ''
	}));
	expect(
		calculateCourseGradePercentageFromCategories(
			getPointsByCategory(
				getCalculableAssignmentsWithCategories([...otherAssignments, work('Final', required, 100)])
			),
			categories
		)
	).toBeCloseTo(83);
});

test.each([-1, NaN, Infinity])(
	'invalid category denominators %s still have no final target',
	(possible) => {
		expect(
			calculatePointsNeededForTargetGrade({
				hasCategories: true,
				targetGradePercentage: 83,
				assignmentPointsPossible: 100,
				assignmentCategoryName: 'Tests',
				gradeCategoryWeightProportions: new Map([
					['Tests', 0.85],
					['Invalid', 0.15]
				]),
				otherAssignments: [
					{
						...work('Invalid', 2, possible),
						category: 'Invalid',
						pointsEarned: 2,
						pointsPossible: possible,
						notForGrade: false
					}
				]
			})
		).toBeNaN();
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
