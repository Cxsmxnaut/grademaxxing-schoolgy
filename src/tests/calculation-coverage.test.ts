import type { Assignment, Category } from '$lib/grades/assignments';
import {
	getAssignmentCalculationIssue,
	getCalculationCoverage,
	getModelAssignments
} from '$lib/grades/calculation-coverage';
import { describe, expect, it } from 'vitest';

const assignment = (overrides: Partial<Assignment> = {}): Assignment => ({
	name: 'Example',
	id: 'example',
	pointsEarned: 8,
	pointsPossible: 10,
	unscaledPoints: undefined,
	extraCredit: false,
	gradePercentageChange: undefined,
	notForGrade: false,
	hidden: false,
	category: 'Tests',
	date: new Date(2026, 8, 1),
	newHypothetical: false,
	...overrides
});
const category = (name: string, weightPercentage: number): Category => ({
	name,
	weightPercentage,
	pointsEarned: 0,
	pointsPossible: 0,
	weightedPercentage: 0,
	gradeLetter: ''
});

describe('calculation coverage', () => {
	it('ignores explicit zero-weight practice even without a weighted scale', () => {
		const practice = assignment({ category: 'Practice', calculationUnavailable: true });
		const categories = [category('Tests', 85), category('Practice', 0)];
		expect(getAssignmentCalculationIssue(practice, categories)).toBeUndefined();
		expect(getCalculationCoverage([assignment(), practice], categories).complete).toBe(true);
		expect(getModelAssignments([assignment(), practice], categories)).toHaveLength(1);
	});

	it('retains supported work when another graded scale is missing', () => {
		const missing = assignment({
			id: 'missing',
			pointsPossible: undefined,
			calculationUnavailable: true
		});
		expect(getCalculationCoverage([assignment(), missing], undefined)).toEqual({
			complete: false,
			omittedAssignmentCount: 1
		});
		expect(getModelAssignments([assignment(), missing], undefined)).toEqual([assignment()]);
	});

	it('does not assume an unknown or invalid category weight is zero', () => {
		for (const categories of [[], [category('Tests', NaN)], [category('Tests', -1)]]) {
			expect(getAssignmentCalculationIssue(assignment(), categories)).toBe('category');
			expect(getCalculationCoverage([assignment()], categories).complete).toBe(false);
			expect(getModelAssignments([assignment()], categories)).toEqual([]);
		}
	});

	it('does not let pending or excluded work degrade the current model', () => {
		const pending = assignment({ pointsEarned: undefined, pointsPossible: undefined });
		const excluded = assignment({ notForGrade: true, calculationUnavailable: true });
		expect(getCalculationCoverage([pending, excluded], undefined).complete).toBe(true);
		expect(getAssignmentCalculationIssue(excluded, undefined)).toBe('points');
	});

	it('recognizes raw-only and percentage-only graded rows without inventing a scale', () => {
		for (const evidence of [
			{ officialPercentage: 80 },
			{ unscaledPoints: { pointsEarned: 8, pointsPossible: 10 } }
		]) {
			const missing = assignment({
				pointsEarned: undefined,
				pointsPossible: undefined,
				...evidence
			});
			expect(getCalculationCoverage([missing], undefined).complete).toBe(false);
			expect(getAssignmentCalculationIssue(missing, undefined)).toBe('points');
		}
	});

	it('retains official total adjustments including negative reconciliation deltas', () => {
		const adjustment = assignment({ hidden: true, pointsEarned: -2, pointsPossible: -1 });
		expect(getModelAssignments([adjustment], [category('Tests', 100)])).toEqual([adjustment]);
	});

	it('never admits nonfinite earned points or regular zero maxima to the model', () => {
		for (const invalid of [
			assignment({ pointsEarned: Infinity }),
			assignment({ pointsPossible: 0 })
		]) {
			expect(getModelAssignments([invalid], undefined)).toEqual([]);
		}
	});

	it('keeps genuine extra credit with a zero denominator', () => {
		const bonus = assignment({ extraCredit: true, pointsEarned: 2, pointsPossible: 0 });
		expect(getAssignmentCalculationIssue(bonus, undefined)).toBeUndefined();
		expect(getModelAssignments([bonus], undefined)).toEqual([bonus]);
	});

	it('labels an extra-credit-only category as incomplete until a denominator is established', () => {
		const bonus = assignment({
			category: 'Bonus',
			extraCredit: true,
			pointsEarned: 2,
			pointsPossible: 0
		});
		const categories = [category('Tests', 85), category('Bonus', 15)];
		expect(getCalculationCoverage([assignment(), bonus], categories).complete).toBe(false);
		const newWork = assignment({
			id: 'new',
			category: 'Bonus',
			pointsEarned: 8,
			pointsPossible: 10
		});
		expect(getCalculationCoverage([assignment(), bonus, newWork], categories).complete).toBe(true);
		const officialTotals = categories.map((c) =>
			c.name === 'Bonus' ? { ...c, pointsEarned: 2, pointsPossible: 10 } : c
		);
		expect(getCalculationCoverage([assignment(), bonus], officialTotals).complete).toBe(true);
	});
});
