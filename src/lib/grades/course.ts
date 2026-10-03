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
 * Districts post not-yet-graded work in different shapes: some omit the score
 * fields, others send them as empty or non-numeric strings, and the portal
 * labels the display score 'Not Graded'. A published assignment percentage or
 * a numeric score provides grading evidence. Not-for-grade work never counts.
 */
export function isGradedAssignment(assignment: AssignmentEntity) {
	if (isNotForGrade(assignment._Notes)) return false;
	const percentage = assignment._AssignmentPercentage?.trim();
	if (percentage && Number.isFinite(Number(percentage))) return true;
	if (/^\s*not\s+graded\s*$/i.test(assignment._DisplayScore)) return false;
	const numericScore = (value: string | undefined) => {
		if (value === undefined || value.trim() === '') return undefined;
		const parsed = Number.parseFloat(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	};
	return (
		numericScore(assignment._Score) !== undefined ||
		numericScore(assignment._ScoreCalValue) !== undefined ||
		numericScore(assignment._Point) !== undefined
	);
}
