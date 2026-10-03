import { getCalculableAssignments, type Assignment, type Category } from './assignments';

export function hasRecordedGrade(assignment: Assignment) {
	return (
		Number.isFinite(assignment.pointsEarned) ||
		Number.isFinite(assignment.officialPercentage) ||
		(assignment.unscaledPoints !== undefined &&
			Number.isFinite(assignment.unscaledPoints.pointsEarned) &&
			Number.isFinite(assignment.unscaledPoints.pointsPossible))
	);
}

/** A known zero weight is evidence that the row cannot affect the course grade. */
export function getAssignmentCalculationIssue(
	assignment: Assignment,
	categories: readonly Category[] | undefined
): 'points' | 'category' | undefined {
	if (categories) {
		const category = categories.find(({ name }) => name === assignment.category);
		if (category?.weightPercentage === 0) return undefined;
		if (!category || !Number.isFinite(category.weightPercentage) || category.weightPercentage < 0)
			return 'category';
	}
	// Excluded rows still need an established scale before a user can include them.
	if (assignment.calculationUnavailable) return 'points';
	if (
		(assignment.pointsEarned !== undefined ||
			assignment.officialPercentage !== undefined ||
			assignment.unscaledPoints !== undefined) &&
		getCalculableAssignments([{ ...assignment, notForGrade: false }]).length === 0
	)
		return 'points';
	return undefined;
}

/** Only inputs with a supported contribution belong to a local model. */
export function getModelAssignments<T extends Assignment>(
	assignments: readonly T[],
	categories: readonly Category[] | undefined
): T[] {
	return assignments.filter((assignment) => {
		if (assignment.notForGrade || getAssignmentCalculationIssue(assignment, categories))
			return false;
		return (
			!categories ||
			categories.some(
				({ name, weightPercentage }) => name === assignment.category && weightPercentage > 0
			)
		);
	});
}

/** Missing evidence labels an estimate; it does not invalidate unrelated inputs. */
export function getCalculationCoverage(
	assignments: readonly Assignment[],
	categories: readonly Category[] | undefined
) {
	const undefinedCategories = new Set<string>();
	if (categories) {
		const model = getCalculableAssignments(getModelAssignments(assignments, categories));
		for (const category of categories) {
			if (category.weightPercentage <= 0 || category.pointsPossible > 0) continue;
			const rows = model.filter(({ category: name }) => name === category.name);
			const denominator = rows.reduce(
				(sum, row) => sum + (row.extraCredit ? 0 : row.pointsPossible),
				0
			);
			if (denominator === 0 && rows.some(({ pointsEarned }) => pointsEarned !== 0))
				undefinedCategories.add(category.name);
		}
	}
	const omittedAssignmentCount = assignments.filter(
		(assignment) =>
			!assignment.notForGrade &&
			hasRecordedGrade(assignment) &&
			(getAssignmentCalculationIssue(assignment, categories) !== undefined ||
				(assignment.category !== undefined && undefinedCategories.has(assignment.category)))
	).length;
	return { complete: omittedAssignmentCount === 0, omittedAssignmentCount };
}
