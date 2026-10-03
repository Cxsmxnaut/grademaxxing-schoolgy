import {
	calculateCourseGradePercentageFromCategories,
	calculateCourseGradePercentageFromTotals,
	getCalculableAssignments,
	getCalculableAssignmentsWithCategories,
	getPointsByCategory,
	type Assignment,
	type Category
} from './assignments';
import { getModelAssignments } from './calculation-coverage';

const DEFAULT_GRADE_CHART_DOMAIN: readonly [number, number] = [0, 100];

export type EstimatedGradePoint = {
	observedAt: number;
	percentage: number;
	assignmentNames: string[];
};

/** Use assignment changes for the trend, anchored to the latest official StudentVUE mark. */
export function getEstimatedGradeTrend(
	assignments: readonly Assignment[],
	gradeCategories: readonly Category[] | undefined,
	officialCurrentPercentage: number | undefined
): EstimatedGradePoint[] {
	if (officialCurrentPercentage === undefined || !Number.isFinite(officialCurrentPercentage))
		return [];
	const modelAssignments = getModelAssignments(assignments, gradeCategories);
	const calculable = gradeCategories
		? getCalculableAssignmentsWithCategories(modelAssignments)
		: getCalculableAssignments(modelAssignments);
	const byDate = new Map<number, Assignment[]>();
	for (const assignment of calculable) {
		const date = assignment.date.getTime();
		if (!Number.isFinite(date) || date <= 0) continue;
		const onDate = byDate.get(date) ?? [];
		onDate.push(assignment);
		byDate.set(date, onDate);
	}
	const dates = [...byDate.keys()].sort((left, right) => left - right);
	const points = dates
		.map((observedAt, index) => {
			const included = dates.slice(0, index + 1).flatMap((date) => byDate.get(date) ?? []);
			const percentage = gradeCategories
				? calculateCourseGradePercentageFromCategories(
						getPointsByCategory(getCalculableAssignmentsWithCategories(included)),
						[...gradeCategories]
					)
				: calculateCourseGradePercentageFromTotals(getCalculableAssignments(included));
			return {
				observedAt,
				percentage,
				assignmentNames: (byDate.get(observedAt) ?? []).map(({ name }) => name)
			};
		})
		.filter(({ percentage }) => Number.isFinite(percentage));

	const latest = points.at(-1);
	if (!latest) return [];
	const adjustment = officialCurrentPercentage - latest.percentage;
	return points
		.map((point) => ({ ...point, percentage: point.percentage + adjustment }))
		.filter(({ percentage }) => Number.isFinite(percentage) && percentage >= 0);
}

/**
 * Returns a focused vertical domain for the course grade trend chart.
 *
 * Grade percentages are commonly clustered in a narrow band (for example,
 * 88–96%). Using the full 0–100 range makes those changes look flat, so the
 * chart gets a small amount of breathing room around the values it actually
 * displays.
 */
export function getGradeChartDomain(values: readonly number[]): [number, number] {
	const finiteValues = values.filter(Number.isFinite);
	if (finiteValues.length === 0) return [...DEFAULT_GRADE_CHART_DOMAIN];

	const minimum = Math.min(...finiteValues);
	const maximum = Math.max(...finiteValues);

	if (minimum === maximum) {
		return [minimum - 5, maximum + 5];
	}

	const padding = Math.max(2, (maximum - minimum) * 0.1);
	return [minimum - padding, maximum + padding];
}
