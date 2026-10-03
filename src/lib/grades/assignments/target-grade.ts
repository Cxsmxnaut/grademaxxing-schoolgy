import { getAssignmentPointTotals, getPointsByCategoryMap } from './calculations';
import type { Assignment, Calculable, CalculableWithCategory } from './types';

export type TargetGradeCalculatorCategoryDependentOptions<T extends Assignment> =
	| {
			hasCategories: false;
			otherAssignments: Calculable<T>[];
	  }
	| {
			hasCategories: true;
			otherAssignments: CalculableWithCategory<T>[];
			gradeCategoryWeightProportions: Map<string, number>;
			assignmentCategoryName: string;
	  };

type TargetGradeCalculatorOptions<T extends Assignment> = {
	targetGradePercentage: number;
	assignmentPointsPossible: number;
} & TargetGradeCalculatorCategoryDependentOptions<T>;

export function calculatePointsNeededForTargetGrade<T extends Assignment>({
	targetGradePercentage,
	assignmentPointsPossible,
	...categoryDependentParams
}: TargetGradeCalculatorOptions<T>) {
	if (
		!Number.isFinite(targetGradePercentage) ||
		!Number.isFinite(assignmentPointsPossible) ||
		assignmentPointsPossible <= 0
	)
		return NaN;
	const targetGradeProportion = targetGradePercentage / 100;

	if (categoryDependentParams.hasCategories) {
		const { otherAssignments, gradeCategoryWeightProportions, assignmentCategoryName } =
			categoryDependentParams;

		// Get the weight proportion for the target assignment's category
		const targetCategoryWeightProportion =
			gradeCategoryWeightProportions.get(assignmentCategoryName);
		if (!targetCategoryWeightProportion) {
			console.error(
				`Cannot calculate points needed for target grade: gradeCategories does not contain ${assignmentCategoryName}`
			);
			return NaN;
		}

		// Calculate categories' respective points earned/possible (excluding points from the target assignment)
		const otherPointsByCategory = getPointsByCategoryMap(otherAssignments);
		// An extra-credit-only category has no defined percentage to contribute
		// to a different category's target. It cannot be silently discarded.
		for (const [name, points] of otherPointsByCategory) {
			if (gradeCategoryWeightProportions.get(name) === 0) continue;
			if (
				!Number.isFinite(points.pointsEarned) ||
				!Number.isFinite(points.pointsPossible) ||
				points.pointsPossible < 0 ||
				(name !== assignmentCategoryName && points.pointsPossible === 0)
			)
				return NaN;
		}

		const categoryData = new Map<
			string,
			{ weightProportion: number; otherPointsEarned: number; otherPointsPossible: number }
		>();
		gradeCategoryWeightProportions.forEach((weightProportion, categoryName) => {
			const otherPoints = otherPointsByCategory.get(categoryName) ?? {
				pointsEarned: 0,
				pointsPossible: 0
			};

			categoryData.set(categoryName, {
				weightProportion,
				otherPointsEarned: otherPoints.pointsEarned,
				otherPointsPossible: otherPoints.pointsPossible
			});
		});
		if (categoryData.size === 0) {
			console.error('Cannot calculate points needed for target grade: no categories found');
			return NaN;
		}

		// Get all the other categories which are included in grade calculation (i.e. pointsPossible != 0)
		const otherCountableCategories = new Map(
			categoryData
				.entries()
				.filter(
					([categoryName, { otherPointsPossible }]) =>
						categoryName !== assignmentCategoryName && otherPointsPossible !== 0
				)
				.map(([name, { otherPointsEarned, otherPointsPossible, ...rest }]) => [
					name,
					{
						pointsEarned: otherPointsEarned, // since the target assignment's category is excluded, these ARE all the points in this category
						pointsPossible: otherPointsPossible,
						...rest
					}
				])
		);

		// Calculate the total weight of all categories included in grade calculation (plus the target assignment's category, if not otherwise included)
		const totalCountedWeightProportion =
			otherCountableCategories
				.values()
				.reduce((sum, { weightProportion }) => sum + weightProportion, 0) +
			targetCategoryWeightProportion;

		// Calculate the sum of the weighted grade proportions from all other countable categories
		const otherCountedCategoriesWeightedGradeProportion = otherCountableCategories
			.values()
			.reduce((sum, { weightProportion, pointsEarned, pointsPossible }) => {
				const gradeProportion = pointsEarned / pointsPossible;
				const weightedGradeProportion = gradeProportion * weightProportion;
				return sum + weightedGradeProportion;
			}, 0);

		// Calculate what the weighted grade proportion for the target assignment's category needs to be
		const targetCategoryWeightedGradeProportion =
			targetGradeProportion * totalCountedWeightProportion -
			otherCountedCategoriesWeightedGradeProportion;

		const targetCategoryGradeProportion =
			targetCategoryWeightedGradeProportion / targetCategoryWeightProportion;

		const { pointsEarned: categoryOtherPointsEarned, pointsPossible: categoryOtherPointsPossible } =
			getAssignmentPointTotals(
				otherAssignments.filter((assignment) => assignment.category === assignmentCategoryName)
			);

		const categoryTotalPointsPossible = categoryOtherPointsPossible + assignmentPointsPossible;

		const assignmentPointsNeeded =
			targetCategoryGradeProportion * categoryTotalPointsPossible - categoryOtherPointsEarned;

		return assignmentPointsNeeded;
	} else {
		const { otherAssignments } = categoryDependentParams;

		const { pointsEarned: otherPointsEarned, pointsPossible: otherPointsPossible } =
			getAssignmentPointTotals(otherAssignments);

		const pointsPossible = assignmentPointsPossible + otherPointsPossible;

		const assignmentPointsNeeded = targetGradeProportion * pointsPossible - otherPointsEarned;

		return assignmentPointsNeeded;
	}
}
