import {
	calculateCourseGradePercentageFromCategories,
	getCalculableAssignmentsWithCategories,
	getCategoryAdjustments,
	getPointsByCategory,
	type Category,
	type RealAssignment
} from '$lib/grades/assignments';
import { expect, test } from 'vitest';

const assignment = (
	id: string,
	category: string,
	pointsEarned: number,
	pointsPossible: number
): RealAssignment => ({
	name: id,
	id,
	pointsEarned,
	pointsPossible,
	unscaledPoints: undefined,
	extraCredit: false,
	gradePercentageChange: undefined,
	notForGrade: false,
	hidden: false,
	category,
	date: new Date(0),
	newHypothetical: false
});

const category = (
	name: string,
	weightPercentage: number,
	pointsEarned: number,
	pointsPossible: number
): Category => ({
	name,
	weightPercentage,
	pointsEarned,
	pointsPossible,
	weightedPercentage: 0,
	gradeLetter: ''
});

/** Weighted category grade the way StudentVUE publishes it: renormalized over the given rows. */
function gradeFromTotals(categories: Category[]) {
	return calculateCourseGradePercentageFromCategories(
		Object.fromEntries(
			categories.map(({ name, pointsEarned, pointsPossible }) => [
				name,
				{ pointsEarned, pointsPossible }
			])
		),
		categories
	);
}

test('a category whose assignments contradict StudentVUE totals gets one adjustment', () => {
	// The portal reports one Classwork row as 9.5/1 while its own category
	// total (46.95/52) implies 0.95/1 — the visible sum overshoots by 8.55.
	const assignments = [
		assignment('a', 'Classwork / Homework', 46, 51),
		assignment('b', 'Classwork / Homework', 9.5, 1),
		assignment('c', 'Test', 37, 36)
	];
	const categories = [
		category('Classwork / Homework', 45, 46.95, 52),
		category('Test', 45, 37, 36)
	];

	const adjustments = getCategoryAdjustments(assignments, categories);

	expect(adjustments).toHaveLength(1);
	expect(adjustments[0]).toMatchObject({
		hidden: true,
		newHypothetical: false,
		category: 'Classwork / Homework',
		notForGrade: false
	});
	expect(adjustments[0]!.pointsEarned).toBeCloseTo(-8.55, 10);
	expect(adjustments[0]!.pointsPossible).toBeCloseTo(0, 10);
});

test('adjustments let local math reproduce the official category grade', () => {
	const assignments = [
		assignment('a', 'Classwork / Homework', 46, 51),
		assignment('b', 'Classwork / Homework', 9.5, 1),
		assignment('c', 'Test', 37, 36)
	];
	const categories = [
		category('Classwork / Homework', 45, 46.95, 52),
		category('Test', 45, 37, 36)
	];

	const reconciled = [...assignments, ...getCategoryAdjustments(assignments, categories)];
	const sums = getPointsByCategory(getCalculableAssignmentsWithCategories(reconciled));

	expect(sums['Classwork / Homework']?.pointsEarned).toBeCloseTo(46.95, 10);
	expect(sums['Classwork / Homework']?.pointsPossible).toBeCloseTo(52, 10);
	expect(calculateCourseGradePercentageFromCategories(sums, categories)).toBeCloseTo(
		gradeFromTotals(categories),
		10
	);
});

test('categories that already match StudentVUE produce no adjustments', () => {
	const assignments = [
		assignment('a', 'Reading', 3, 6),
		assignment('b', 'Reading', 6.5, 9),
		assignment('c', 'Standard Practice', 2, 2)
	];
	const categories = [category('Reading', 30, 9.5, 15), category('Standard Practice', 10, 2, 2)];

	expect(getCategoryAdjustments(assignments, categories)).toEqual([]);
});

test('a category StudentVUE scored without visible assignments is still counted', () => {
	const categories = [category('Semester Project', 20, 10, 10)];

	const adjustments = getCategoryAdjustments([], categories);

	expect(adjustments).toHaveLength(1);
	expect(adjustments[0]).toMatchObject({
		hidden: true,
		category: 'Semester Project',
		pointsEarned: 10,
		pointsPossible: 10
	});
});

test('categories StudentVUE cannot score yet are never adjusted', () => {
	const assignments = [assignment('a', 'Participation', 5, 5)];

	expect(
		getCategoryAdjustments(assignments, [
			category('Participation', 10, 5, 5),
			category('Final Exam', 20, 0, 0),
			category('Broken', 5, Number.NaN, Number.NaN)
		])
	).toEqual([]);
});
