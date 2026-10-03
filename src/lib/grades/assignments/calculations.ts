import type {
	AdjustmentAssignment,
	Assignment,
	Calculable,
	CalculableWithCategory,
	Category,
	Flowed,
	PointsByCategory
} from './types';

export function calculateGradePercentage(pointsEarned: number, pointsPossible: number) {
	if (!Number.isFinite(pointsEarned) || !Number.isFinite(pointsPossible) || pointsPossible < 0)
		return NaN;
	if (pointsPossible === 0) return pointsEarned === 0 ? 0 : NaN;
	return (pointsEarned / pointsPossible) * 100;
}

export function calculateCourseGradePercentageFromCategories(
	pointsByCategory: PointsByCategory,
	gradeCategories: Category[]
) {
	let gradePercentage = 0;
	if (Object.entries(pointsByCategory).length === 0) return 0;

	let totalWeight = 0;

	for (const [categoryName, categoryPoints] of Object.entries(pointsByCategory)) {
		const category = gradeCategories.find((category) => category.name === categoryName);
		if (!category) continue;
		if (!Number.isFinite(category.weightPercentage)) return NaN;
		if (category.weightPercentage <= 0) continue;
		if (
			!Number.isFinite(categoryPoints.pointsEarned) ||
			!Number.isFinite(categoryPoints.pointsPossible) ||
			categoryPoints.pointsPossible <= 0
		)
			return NaN;

		gradePercentage +=
			(categoryPoints.pointsEarned / categoryPoints.pointsPossible) * category.weightPercentage;
		totalWeight += category.weightPercentage;
	}

	gradePercentage = (gradePercentage / totalWeight) * 100;

	return Number.isFinite(gradePercentage) ? gradePercentage : NaN;
}

export function calculateCourseGradePercentageFromTotals<T extends Assignment>(
	assignments: Calculable<T>[]
) {
	const { pointsEarned, pointsPossible } = getAssignmentPointTotals(assignments);
	if (assignments.length > 0 && pointsPossible <= 0) return NaN;
	return calculateGradePercentage(pointsEarned, pointsPossible);
}

function flowAssignmentFromTotals<T extends Assignment>(
	assignment: Calculable<T>,
	totalPointsEarned: number,
	totalPointsPossible: number
): { assignment: Flowed<T>; totalPointsEarned: number; totalPointsPossible: number } {
	const { pointsEarned, pointsPossible, extraCredit } = assignment;

	const priorGrade = calculateGradePercentage(totalPointsEarned, totalPointsPossible);

	totalPointsEarned += pointsEarned;
	totalPointsPossible += extraCredit ? 0 : pointsPossible;

	const afterGrade = calculateGradePercentage(totalPointsEarned, totalPointsPossible);

	const gradePercentageChange = afterGrade - priorGrade;

	const calculable = { ...assignment, gradePercentageChange };

	return { assignment: calculable, totalPointsEarned, totalPointsPossible };
}

function flowAssignmentFromCategories<T extends Assignment>(
	assignment: CalculableWithCategory<T>,
	pointsByCategory: PointsByCategory,
	gradeCategories: Category[]
): { assignment: Flowed<T>; pointsByCategory: PointsByCategory } {
	const { pointsEarned, pointsPossible, category, extraCredit } = assignment;

	const priorGrade = calculateCourseGradePercentageFromCategories(
		pointsByCategory,
		gradeCategories
	);

	const categoryPoints = pointsByCategory[category] ?? { pointsEarned: 0, pointsPossible: 0 };
	pointsByCategory[category] = {
		pointsEarned: categoryPoints.pointsEarned + pointsEarned,
		pointsPossible: categoryPoints.pointsPossible + (extraCredit ? 0 : pointsPossible)
	};

	const afterGrade = calculateCourseGradePercentageFromCategories(
		pointsByCategory,
		gradeCategories
	);

	const gradePercentageChange = afterGrade - priorGrade;

	const calculable = { ...assignment, gradePercentageChange };

	return { assignment: calculable, pointsByCategory };
}

export function calculateAssignmentGPCsFromCategories<T extends Assignment>(
	assignments: T[],
	gradeCategories: Category[]
) {
	let pointsByCategory: PointsByCategory = {};

	const flowedAssignments: (T | Flowed<T>)[] = assignments
		.toReversed()
		.map((assignment) => {
			const [calculable] = getCalculableAssignmentsWithCategories([assignment]);
			if (!calculable) return { ...assignment, gradePercentageChange: undefined };

			const flowed = flowAssignmentFromCategories(calculable, pointsByCategory, gradeCategories);

			pointsByCategory = flowed.pointsByCategory;

			return {
				...assignment,
				gradePercentageChange: Number.isFinite(flowed.assignment.gradePercentageChange)
					? flowed.assignment.gradePercentageChange
					: undefined
			};
		})
		.toReversed();

	return flowedAssignments;
}

export function calculateAssignmentGPCsFromTotals<T extends Assignment>(assignments: T[]) {
	let totalPointsEarned = 0;
	let totalPointsPossible = 0;

	const flowedAssignments: (T | Flowed<T>)[] = assignments
		.toReversed()
		.map((assignment) => {
			const calculable = getCalculableAssignment(assignment);
			if (!calculable) return { ...assignment, gradePercentageChange: undefined };

			const flowed = flowAssignmentFromTotals(calculable, totalPointsEarned, totalPointsPossible);
			totalPointsEarned = flowed.totalPointsEarned;
			totalPointsPossible = flowed.totalPointsPossible;
			return {
				...assignment,
				gradePercentageChange: Number.isFinite(flowed.assignment.gradePercentageChange)
					? flowed.assignment.gradePercentageChange
					: undefined
			};
		})
		.toReversed();

	return flowedAssignments;
}

export function calculateAssignmentGPCs<T extends Assignment>(
	assignments: T[],
	gradeCategories?: Category[]
) {
	if (gradeCategories === undefined) {
		return calculateAssignmentGPCsFromTotals(assignments);
	}

	return calculateAssignmentGPCsFromCategories(assignments, gradeCategories);
}

export const randomAssignmentID = () => Math.random().toString(36).substring(2, 15);

export function getPointsByCategory<T extends Assignment>(
	assignments: CalculableWithCategory<T>[]
) {
	const pointsByCategory: PointsByCategory = {};

	assignments.forEach((assignment) => {
		const { category, pointsEarned, pointsPossible, extraCredit } = assignment;

		const categoryPoints = pointsByCategory[category] ?? { pointsEarned: 0, pointsPossible: 0 };

		pointsByCategory[category] = {
			pointsEarned: categoryPoints.pointsEarned + pointsEarned,
			pointsPossible: categoryPoints.pointsPossible + (extraCredit ? 0 : pointsPossible)
		};
	});

	return pointsByCategory;
}

export function getPointsByCategoryMap<T extends Assignment>(
	assignments: CalculableWithCategory<T>[]
) {
	const pointsByCategory: Map<string, { pointsEarned: number; pointsPossible: number }> = new Map();

	assignments.forEach((assignment) => {
		const { category, pointsEarned, pointsPossible, extraCredit } = assignment;

		const categoryPoints = pointsByCategory.get(category) ?? { pointsEarned: 0, pointsPossible: 0 };

		pointsByCategory.set(category, {
			pointsEarned: categoryPoints.pointsEarned + pointsEarned,
			pointsPossible: categoryPoints.pointsPossible + (extraCredit ? 0 : pointsPossible)
		});
	});

	return pointsByCategory;
}

/** Points below this difference are floating-point noise, not a real gap. */
const CATEGORY_RECONCILIATION_EPSILON = 1e-6;

/**
 * StudentVUE's official category rows are the source of truth for the course
 * grade, but the assignment rows feeding them occasionally contradict them (a
 * mistyped point maximum, hidden or dropped work, a manual override). Build
 * one adjustment record per mismatched category so every local calculation —
 * hypothetical grades, per-assignment impact, the finals planner, the trend
 * chart — starts from the official totals instead of a drifted sum.
 *
 * Adjustments are calculation inputs only: they are marked `hidden` and never
 * rendered as assignments.
 */
export function getCategoryAdjustments<T extends Assignment>(
	assignments: T[],
	gradeCategories: Category[]
): AdjustmentAssignment[] {
	const pointsByCategory = getPointsByCategoryMap(
		getCalculableAssignmentsWithCategories(assignments)
	);

	return gradeCategories.flatMap((category) => {
		if (
			!Number.isFinite(category.pointsEarned) ||
			!Number.isFinite(category.pointsPossible) ||
			category.pointsPossible <= 0
		)
			return [];

		const summed = pointsByCategory.get(category.name) ?? { pointsEarned: 0, pointsPossible: 0 };
		const earnedGap = category.pointsEarned - summed.pointsEarned;
		const possibleGap = category.pointsPossible - summed.pointsPossible;
		if (
			Math.abs(earnedGap) < CATEGORY_RECONCILIATION_EPSILON &&
			Math.abs(possibleGap) < CATEGORY_RECONCILIATION_EPSILON
		)
			return [];

		const adjustment: AdjustmentAssignment = {
			name: `Official category totals — ${category.name}`,
			id: `official-totals:${category.name}`,
			pointsEarned: earnedGap,
			pointsPossible: possibleGap,
			unscaledPoints: undefined,
			extraCredit: false,
			gradePercentageChange: undefined,
			notForGrade: false,
			hidden: true,
			category: category.name,
			date: new Date(0),
			newHypothetical: false
		};
		return [adjustment];
	});
}

function countDecimalPlaces(num: number) {
	const numStr = num.toString();
	const decimalIndex = numStr.indexOf('.');

	if (decimalIndex === -1) return 0;

	return numStr.length - decimalIndex - 1;
}

function roundToPrecision(num: number, precision: number) {
	const factor = Math.pow(10, precision);
	return Math.round(num * factor) / factor;
}

function floorToPrecision(num: number, precision: number) {
	const factor = Math.pow(10, precision);
	return Math.floor(num * factor) / factor;
}

export function gradesMatch(rawGrade: number, expectedGrade: number) {
	const leastPrecision = Math.min(countDecimalPlaces(rawGrade), countDecimalPlaces(expectedGrade));

	const roundedMatches =
		roundToPrecision(rawGrade, leastPrecision) === roundToPrecision(expectedGrade, leastPrecision);

	const flooredMatches =
		floorToPrecision(rawGrade, leastPrecision) === floorToPrecision(expectedGrade, leastPrecision);

	return roundedMatches || flooredMatches;
}

export function getAssignmentPointTotals<T extends Assignment>(assignments: Calculable<T>[]) {
	let pointsEarned = 0;
	let pointsPossible = 0;

	assignments.forEach((assignment) => {
		const { pointsEarned: earned, pointsPossible: possible, extraCredit } = assignment;

		pointsEarned += earned;
		if (!extraCredit) pointsPossible += possible;
	});

	return { pointsEarned, pointsPossible };
}

export function getCalculableAssignments<T extends Assignment>(assignments: T[]) {
	return assignments
		.map((assignment) => getCalculableAssignment(assignment))
		.filter((assignment) => assignment !== null);
}

export function getCalculableAssignmentsWithCategories<T extends Assignment>(assignments: T[]) {
	return assignments
		.map((assignment) => {
			const calculable = getCalculableAssignment(assignment);
			return calculable && assignment.category !== undefined
				? { ...calculable, category: assignment.category }
				: null;
		})
		.filter((assignment) => assignment !== null);
}

function getCalculableAssignment<T extends Assignment>(assignment: T): Calculable<T> | null {
	if (assignment.notForGrade || assignment.calculationUnavailable) return null;
	const published = assignment.publishedPoints;
	const untouched =
		published &&
		!assignment.newHypothetical &&
		assignment.pointsEarned === published.pointsEarned &&
		assignment.pointsPossible === published.pointsPossible &&
		assignment.extraCredit === published.extraCredit;
	const pointsEarned =
		untouched && !assignment.extraCredit && assignment.calculationPointsEarned !== undefined
			? assignment.calculationPointsEarned
			: assignment.pointsEarned;
	const pointsPossible = assignment.extraCredit ? 0 : assignment.pointsPossible;
	if (
		pointsEarned === undefined ||
		pointsPossible === undefined ||
		!Number.isFinite(pointsEarned) ||
		!Number.isFinite(pointsPossible) ||
		(!assignment.hidden && !assignment.extraCredit && pointsPossible <= 0)
	)
		return null;
	return { ...assignment, pointsEarned, pointsPossible, notForGrade: false };
}
