import type { Assignment } from '$lib/grades/assignments';
import { getEstimatedGradeTrend, getGradeChartDomain } from '$lib/grades/grade-chart';
import { describe, expect, it } from 'vitest';

describe('getGradeChartDomain', () => {
	it('focuses the chart on the observed grade range', () => {
		expect(getGradeChartDomain([82, 86, 91])).toEqual([80, 93]);
	});

	it('uses a minimum two-point margin for a narrow range', () => {
		expect(getGradeChartDomain([97, 98])).toEqual([95, 100]);
	});

	it('adds a symmetric margin when every grade is the same', () => {
		expect(getGradeChartDomain([88, 88, 88])).toEqual([83, 93]);
	});

	it('falls back to the full percentage range without usable values', () => {
		expect(getGradeChartDomain([])).toEqual([0, 100]);
		expect(getGradeChartDomain([Number.NaN, Number.POSITIVE_INFINITY])).toEqual([0, 100]);
	});
});

describe('estimated grade history', () => {
	const assignment = (
		name: string,
		day: number,
		pointsEarned: number,
		pointsPossible: number
	): Assignment => ({
		name,
		id: name,
		date: new Date(2026, 8, day),
		pointsEarned,
		pointsPossible,
		unscaledPoints: undefined,
		extraCredit: false,
		gradePercentageChange: undefined,
		notForGrade: false,
		hidden: false,
		category: 'Homework',
		newHypothetical: false
	});

	it('uses corrected StudentVUE assignment points when they reproduce the official mark', () => {
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 19, 10, 10), assignment('Corrected', 20, 9.5, 10)],
			undefined,
			97.5
		);
		expect(points.map(({ percentage }) => percentage)).toEqual([100, 97.5]);
	});

	it('hides estimates when visible assignment math disagrees with StudentVUE', () => {
		const assignments = [
			assignment('Earlier', 19, 10, 10),
			assignment('Wrong maximum', 20, 9.5, 1)
		];
		expect(getEstimatedGradeTrend(assignments, undefined, 97.5)).toEqual([]);
		expect(
			getEstimatedGradeTrend(
				[assignment('Earlier', 19, 10, 10), assignment('Visible', 20, 9.5, 10)],
				undefined,
				96.5
			)
		).toEqual([]);
	});
});
