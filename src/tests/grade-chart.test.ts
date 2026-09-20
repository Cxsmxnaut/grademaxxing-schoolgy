import { getGradeChartDomain } from '$lib/grades/grade-chart';
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
