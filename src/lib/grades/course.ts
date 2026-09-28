import type { AssignmentEntity, Course } from '$lib/contracts/studentvue/gradebook';
import type { Category } from './assignments';
import { seenAssignmentIDs } from './seenAssignments.svelte';

const getMark = (course: Course) => course.Marks?.Mark[0];

export function getCourseGrade(course: Course) {
	const mark = getMark(course);
	if (!mark) return;
	const percentage = Number.parseFloat(mark._CalculatedScoreRaw ?? '');
	if (!Number.isFinite(percentage)) return;

	return {
		letter: mark._CalculatedScoreString,
		percentage
	};
}

export const getSynergyCourseAssignmentCategories = (course: Course): Category[] | undefined =>
	getMark(course)?.GradeCalculationSummary?.AssignmentGradeCalc.map((category) => ({
		name: category._Type,
		weightPercentage: parseFloat(category._Weight),
		pointsEarned: parseFloat(category._Points),
		pointsPossible: parseFloat(category._PointsPossible),
		weightedPercentage: parseFloat(category._WeightedPct),
		gradeLetter: category._CalculatedMark
	}));

export const getCourseUnseenAssignmentsCount = (course: Course) =>
	getMark(course)?.Assignments?.Assignment.filter(
		({ _GradebookID: id, _Notes: notes }) => !isNotForGrade(notes) && !seenAssignmentIDs.has(id)
	).length ?? 0;

export function clearCourseUnseenAssignments(course: Course) {
	getMark(course)?.Assignments?.Assignment.forEach(({ _GradebookID: id }) =>
		seenAssignmentIDs.add(id)
	);
}

/** StudentVUE marks non-calculating work in the assignment-note prefix. */
export const isNotForGrade = (notes: string | undefined) =>
	/^\s*\(\s*not\s+for\s+grading\s*\)/i.test(notes ?? '');

/**
 * Posted without a score entry: points possible is known up front, but nothing
 * has been graded yet. A defined score field (even an empty points-earned value,
 * i.e. a zero) is the only signal that a teacher actually graded it.
 */
export function isGradedAssignment(assignment: AssignmentEntity) {
	if (isNotForGrade(assignment._Notes)) return false;
	return (
		assignment._Score !== undefined ||
		assignment._ScoreCalValue !== undefined ||
		assignment._Point !== undefined
	);
}
