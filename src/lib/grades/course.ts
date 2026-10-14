import type { AssignmentEntity, Course } from '$lib/contracts/studentvue/gradebook';
import {
	calculateAssignmentGPCs,
	calculateCourseGradePercentageFromCategories,
	calculateCourseGradePercentageFromTotals,
	getCalculableAssignments,
	getCategoryAdjustments,
	getPointsByCategory,
	gradesMatch,
	isNotForGrade,
	parseSynergyAssignment,
	type Category
} from './assignments';
import { getCalculationCoverage, getModelAssignments } from './calculation-coverage';
import { seenAssignmentIDs } from './seenAssignments.svelte';

export { isNotForGrade };

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

/**
 * Compute per-assignment grade percentage change (in percentage points) for a
 * course's assignments using the same model and coverage checks as the course
 * detail page. Returns an empty map when the local calculation cannot be
 * verified against the official course grade.
 */
export function getCourseAssignmentImpacts(course: Course): Map<string, number> {
	const mark = getMark(course);
	const synergyAssignments = mark?.Assignments?.Assignment ?? [];
	if (synergyAssignments.length === 0) return new Map();

	const categories = getSynergyCourseAssignmentCategories(course)?.filter(
		(category) => category.name !== 'TOTAL'
	);
	const parsed = synergyAssignments.map(parseSynergyAssignment);
	const flowed = calculateAssignmentGPCs(parsed, categories);
	const coverage = getCalculationCoverage(flowed, categories);
	if (!coverage.complete) return new Map();

	const adjustments = categories ? getCategoryAdjustments(flowed, categories) : [];
	const model = getModelAssignments([...adjustments, ...flowed], categories);
	const calculable = getCalculableAssignments(model);
	if (calculable.length === 0) return new Map();

	const calculatedGrade = categories
		? calculateCourseGradePercentageFromCategories(getPointsByCategory(calculable), categories)
		: calculateCourseGradePercentageFromTotals(calculable);
	if (!Number.isFinite(calculatedGrade)) return new Map();

	const rawOfficial = mark?._CalculatedScoreRaw?.trim();
	const officialPercentage = rawOfficial ? Number(rawOfficial) : undefined;
	if (
		officialPercentage !== undefined &&
		Number.isFinite(officialPercentage) &&
		!gradesMatch(calculatedGrade, officialPercentage)
	) {
		return new Map();
	}

	const impacts = new Map<string, number>();
	for (const assignment of flowed) {
		if (
			assignment.notForGrade ||
			assignment.gradePercentageChange === undefined ||
			!Number.isFinite(assignment.gradePercentageChange)
		)
			continue;
		impacts.set(assignment.id, Math.round(assignment.gradePercentageChange * 100) / 100);
	}
	return impacts;
}
