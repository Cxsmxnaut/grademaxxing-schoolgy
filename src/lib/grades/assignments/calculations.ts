import type {
	Assignment,
	Calculable,
	CalculableWithCategory,
	Category,
	Flowed,
	PointsByCategory
} from './types';

export function calculateGradePercentage(pointsEarned: number, pointsPossible: number) {
	let gradePercentage = (pointsEarned / pointsPossible) * 100;

	if (isNaN(gradePercentage)) gradePercentage = 0;

	return gradePercentage;
}

export function calculateCourseGradePercentageFromCategories(
	pointsByCategory: PointsByCategory,
	gradeCategories: Category[]
) {
	let gradePercentage = 0;
	if (Object.entries(pointsByCategory).length === 0) return 0;

	let totalWeight = 0;

	Object.entries(pointsByCategory).forEach(([categoryName, categoryPoints]) => {
		const category = gradeCategories.find((category) => category.name === categoryName);
		if (!category) return;

		gradePercentage +=
			(categoryPoints.pointsEarned / categoryPoints.pointsPossible) * category.weightPercentage;
		totalWeight += category.weightPercentage;
	});

	gradePercentage = (gradePercentage / totalWeight) * 100;

	if (!Number.isFinite(gradePercentage)) {
		console.error('Grade percentage is not finite');
		return 0;
	}

	return gradePercentage;
}

export function calculateCourseGradePercentageFromTotals<T extends Assignment>(
	assignments: Calculable<T>[]
) {
	const { pointsEarned, pointsPossible } = getAssignmentPointTotals(assignments);

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
			const { pointsEarned, pointsPossible, notForGrade, category } = assignment;

			if (
				pointsEarned === undefined ||
				pointsPossible === undefined ||
				notForGrade ||
				category === undefined
			)
				return assignment;

			const calculable: CalculableWithCategory<T> = {
				...assignment,
				pointsEarned,
				pointsPossible,
				notForGrade,
				category
			};

			const flowed = flowAssignmentFromCategories(calculable, pointsByCategory, gradeCategories);

			pointsByCategory = flowed.pointsByCategory;

			return flowed.assignment;
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
			const { pointsEarned, pointsPossible, notForGrade } = assignment;

			if (pointsEarned === undefined || pointsPossible === undefined || notForGrade)
				return assignment;

			const calculable: Calculable<T> = {
				...assignment,
				pointsEarned,
				pointsPossible,
				notForGrade
			};

			const flowed = flowAssignmentFromTotals(calculable, totalPointsEarned, totalPointsPossible);
			totalPointsEarned = flowed.totalPointsEarned;
			totalPointsPossible = flowed.totalPointsPossible;
			return flowed.assignment;
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
		.map((assignment) => {
			const { pointsEarned, pointsPossible, notForGrade } = assignment;

			if (pointsEarned === undefined || pointsPossible === undefined || notForGrade) return null;

			const calculable: Calculable<T> = {
				...assignment,
				pointsEarned,
				pointsPossible,
				notForGrade
			};

			return calculable;
		})
		.filter((assignments) => assignments !== null);
}

export function getCalculableAssignmentsWithCategories<T extends Assignment>(assignments: T[]) {
	return assignments
		.map((assignment) => {
			const { pointsEarned, pointsPossible, notForGrade, category } = assignment;

			if (
				pointsEarned === undefined ||
				pointsPossible === undefined ||
				notForGrade ||
				category === undefined
			)
				return null;

			const calculable: CalculableWithCategory<T> = {
				...assignment,
				pointsEarned,
				pointsPossible,
				notForGrade,
				category
			};

			return calculable;
		})
		.filter((assignments) => assignments !== null);
}
