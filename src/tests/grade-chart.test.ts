import type { Assignment, Category } from '$lib/grades/assignments';
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
	const category = (name: string, weightPercentage: number): Category => ({
		name,
		weightPercentage,
		pointsEarned: 1,
		pointsPossible: 1,
		weightedPercentage: 100,
		gradeLetter: 'A'
	});

	it('uses corrected StudentVUE assignment points when they reproduce the official mark', () => {
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 19, 10, 10), assignment('Corrected', 20, 9.5, 10)],
			undefined,
			97.5
		);
		expect(points.map(({ percentage }) => percentage)).toEqual([100, 97.5]);
	});

	it('anchors a mismatched assignment trend to the official current grade', () => {
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 19, 10, 10), assignment('Visible', 20, 9.5, 10)],
			undefined,
			96.5
		);
		expect(points.map(({ percentage }) => percentage)).toEqual([99, 96.5]);
	});

	it('keeps a 104.754% visible-work total from becoming the current chart grade', () => {
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 19, 100, 100), assignment('Later', 20, 109.508, 100)],
			undefined,
			96.53
		);
		expect(points).toHaveLength(2);
		expect(points[0]!.percentage).toBeCloseTo(91.776);
		expect(points[1]!.percentage).toBeCloseTo(96.53);
	});

	it('keeps weighted points when raw display scores use a different scale or penalty', () => {
		const weightedAssignment = {
			...assignment('Video', 20, 0.4, 1),
			unscaledPoints: { pointsEarned: 8, pointsPossible: 10 }
		};
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 19, 1, 1), weightedAssignment],
			undefined,
			70
		);
		expect(points.map(({ percentage }) => percentage)).toEqual([100, 70]);
	});

	it('uses the precise percentage basis while keeping rounded assignment display points', () => {
		const rounded = {
			...assignment('Rounded', 20, 1, 1),
			officialPercentage: 60,
			publishedPoints: { pointsEarned: 1, pointsPossible: 1, extraCredit: false },
			calculationPointsEarned: 0.6
		};
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 19, 1, 1), rounded],
			undefined,
			80
		);
		expect(points.map(({ percentage }) => percentage)).toEqual([100, 80]);
		expect(rounded.pointsEarned).toBe(1);
	});

	it('keeps supported dates when another graded assignment has no weighted maximum', () => {
		const unavailable = {
			...assignment('Unknown weight', 20, 8, 10),
			pointsPossible: undefined,
			unscaledPoints: { pointsEarned: 8, pointsPossible: 10 }
		};
		const points = getEstimatedGradeTrend(
			[assignment('Earlier', 18, 1, 1), assignment('Later', 19, 0.8, 1), unavailable],
			undefined,
			90
		);
		expect(points.map(({ percentage }) => percentage)).toEqual([100, 90]);
		expect(points.flatMap(({ assignmentNames }) => assignmentNames)).toEqual(['Earlier', 'Later']);
	});

	it('keeps supported dates when another complete point pair has ambiguous scale', () => {
		const unavailable = {
			...assignment('Ambiguous scale', 20, 8, 1),
			calculationUnavailable: true
		};
		expect(
			getEstimatedGradeTrend([assignment('Earlier', 19, 1, 1), unavailable], undefined, 90).map(
				({ percentage }) => percentage
			)
		).toEqual([90]);
	});

	it('pending work does not block a trend from known graded rows', () => {
		const pending = { ...assignment('Pending', 20, 0, 10), pointsEarned: undefined };
		expect(
			getEstimatedGradeTrend([assignment('Earlier', 19, 1, 1), pending], undefined, 90).map(
				({ percentage }) => percentage
			)
		).toEqual([90]);
	});

	it('keeps a supported weighted trend when a graded row has an unknown category', () => {
		const unknownCategory = { ...assignment('Unknown category', 20, 8, 10), category: 'Other' };
		const categories = [category('Homework', 100)];
		expect(
			getEstimatedGradeTrend(
				[assignment('Earlier', 19, 1, 1), unknownCategory],
				categories,
				90
			).map(({ percentage }) => percentage)
		).toEqual([90]);
	});

	it('zero-weight practice does not add a date or change a weighted trend', () => {
		const practice = {
			...assignment('Practice', 19, 90, 1),
			category: 'Practice',
			calculationUnavailable: true
		};
		const known = [assignment('Earlier', 18, 1, 1), assignment('Later', 20, 0.8, 1)];
		const categories = [category('Homework', 100), category('Practice', 0)];
		expect(getEstimatedGradeTrend([...known, practice], categories, 90)).toEqual(
			getEstimatedGradeTrend(known, categories, 90)
		);
	});

	it('ignores invalid category weights while retaining supported categories', () => {
		const invalidCategory = { ...assignment('Invalid category', 20, 8, 10), category: 'Other' };
		for (const weight of [NaN, Infinity, -1]) {
			const points = getEstimatedGradeTrend(
				[assignment('Earlier', 19, 1, 1), invalidCategory],
				[category('Homework', 100), category('Other', weight)],
				90
			);
			expect(points.map(({ percentage }) => percentage)).toEqual([90]);
		}
	});

	it('returns no estimated points when every recorded assignment is unsupported', () => {
		const unsupported = {
			...assignment('Unsupported', 19, 8, 1),
			calculationUnavailable: true
		};
		expect(getEstimatedGradeTrend([unsupported], undefined, 90)).toEqual([]);
	});

	it('excludes non-finite points and invalid dates instead of adding invalid chart points', () => {
		const points = getEstimatedGradeTrend(
			[
				assignment('Earlier', 19, 1, 1),
				assignment('Infinite', 20, Infinity, 1),
				assignment('Not a number', 20, 1, NaN),
				{ ...assignment('No date', 20, 1, 1), date: new Date(NaN) }
			],
			undefined,
			90
		);
		expect(points).toHaveLength(1);
		expect(points[0]!.assignmentNames).toEqual(['Earlier']);
		expect(points[0]!.percentage).toBe(90);
		expect(
			points.every(
				({ observedAt, percentage }) => Number.isFinite(observedAt) && Number.isFinite(percentage)
			)
		).toBe(true);
	});

	it('requires a finite official anchor for any reconstructed trend', () => {
		for (const anchor of [undefined, NaN, Infinity])
			expect(getEstimatedGradeTrend([assignment('Earlier', 19, 1, 1)], undefined, anchor)).toEqual(
				[]
			);
	});
});
