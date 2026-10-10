import { describe, expect, it } from 'vitest';
import {
	calculateAssignmentImpact,
	calculateCategoryTarget,
	calculateFinalTarget,
	calculatePublicGpa,
	calculateWeightedGrade,
	type CalculatorResult,
	type PointCategory,
	type PublicGpaRow,
	type WeightedGradeRow
} from '../lib/grades/public-calculators';

function success<T>(result: CalculatorResult<T>): T {
	if (!result.ok) throw new Error(result.error);
	return result;
}
const categories: [PointCategory, PointCategory] = [
	{ id: 'tests', name: 'Tests', weight: 50, earned: 170, possible: 200 },
	{ id: 'homework', name: 'Homework', weight: 50, earned: 95, possible: 100 }
];

describe('fixed overall final weight', () => {
	it('keeps an impossible 122% target visible, and verifies it produces 90%', () => {
		const result = success(calculateFinalTarget({ current: 82, target: 90, weight: 20 }));
		expect(result.required).toBeCloseTo(122);
		expect(result.forwardGrade).toBeCloseTo(90);
		expect(result.status).toBe('above-maximum');
	});
	it('keeps a negative algebraic target and forward-checks zero instead', () => {
		const result = success(calculateFinalTarget({ current: 100, target: 70, weight: 20 }));
		expect(result.required).toBeCloseTo(-50);
		expect(result.minimumScore).toBe(0);
		expect(result.forwardGrade).toBe(80);
		expect(result.status).toBe('already-secured');
	});
	it('rounds a minimum score upward to the allowed step', () => {
		const result = success(
			calculateFinalTarget({ current: 82, target: 90, weight: 30, increment: 1 })
		);
		expect(result.required).toBeCloseTo(108.6666666667);
		expect(result.minimumScore).toBe(109);
		expect(result.forwardGrade).toBeCloseTo(90.1);
	});
	it('flags when the allowed step makes a target impossible at the maximum', () => {
		const result = success(
			calculateFinalTarget({ current: 80, target: 99, weight: 100, increment: 4 })
		);
		expect(result.required).toBe(99);
		expect(result.minimumScore).toBe(100);
		expect(result.status).toBe('possible');
		const coarse = success(
			calculateFinalTarget({ current: 80, target: 99, weight: 100, increment: 3 })
		);
		expect(coarse.minimumScore).toBe(99);
		expect(
			success(calculateFinalTarget({ current: 80, target: 99.5, weight: 100, increment: 3 })).status
		).toBe('above-maximum');
	});
	it.each([0, -1, 101, undefined, Number.NaN])('rejects invalid weight %s', (weight) => {
		expect(calculateFinalTarget({ current: 80, target: 90, weight }).ok).toBe(false);
	});
	it('rejects cleared, negative, nonfinite and zero-step inputs', () => {
		for (const current of [undefined, -1, Number.POSITIVE_INFINITY])
			expect(calculateFinalTarget({ current, target: 90, weight: 20 }).ok).toBe(false);
		expect(calculateFinalTarget({ current: 80, target: 90, weight: 20, increment: 0 }).ok).toBe(
			false
		);
	});
});

describe('new scores and replacement scores are different', () => {
	it('adds a new total-points score: 120 / 150 = 80%', () => {
		const result = success(
			calculateAssignmentImpact({
				model: 'total',
				earned: 80,
				possible: 100,
				score: { earned: 40, possible: 50 }
			})
		);
		expect(result).toMatchObject({ before: 80, after: 80, delta: 0 });
	});
	it('replaces by removing the original: (80−20+45)/(100−25+50) = 84%', () => {
		const result = success(
			calculateAssignmentImpact({
				model: 'total',
				earned: 80,
				possible: 100,
				previous: { earned: 20, possible: 25 },
				score: { earned: 45, possible: 50 }
			})
		);
		expect(result.after).toBe(84);
		expect(result.delta).toBe(4);
	});
	it('replaces numerator-only extra credit without removing denominator points', () => {
		const result = success(
			calculateAssignmentImpact({
				model: 'total',
				earned: 90,
				possible: 100,
				previous: { earned: 10, possible: 0, extraCredit: true },
				score: { earned: 20, possible: 25 }
			})
		);
		expect(result.after).toBe(80);
	});
	it('supports numerator-only extra credit and scores above ordinary maximum', () => {
		expect(
			success(
				calculateAssignmentImpact({
					model: 'total',
					earned: 100,
					possible: 100,
					score: { earned: 10, possible: 0, extraCredit: true }
				})
			).after
		).toBeCloseTo(110);
		expect(
			success(
				calculateAssignmentImpact({
					model: 'total',
					earned: 100,
					possible: 100,
					score: { earned: 60, possible: 50 }
				})
			).after
		).toBeCloseTo(106.6666666667);
	});
	it('supports a first ordinary score but rejects a denominator made of extra credit alone', () => {
		const result = success(
			calculateAssignmentImpact({
				model: 'total',
				earned: 0,
				possible: 0,
				score: { earned: 8, possible: 10 }
			})
		);
		expect(result).toMatchObject({ before: undefined, after: 80, delta: undefined });
		expect(
			calculateAssignmentImpact({
				model: 'total',
				earned: 0,
				possible: 0,
				score: { earned: 8, possible: 0, extraCredit: true }
			}).ok
		).toBe(false);
	});
	it('rejects an original score absent from the supplied totals and ordinary zero denominators', () => {
		expect(
			calculateAssignmentImpact({
				model: 'total',
				earned: 80,
				possible: 100,
				previous: { earned: 90, possible: 100 },
				score: { earned: 40, possible: 50 }
			}).ok
		).toBe(false);
		expect(
			calculateAssignmentImpact({
				model: 'total',
				earned: 80,
				possible: 100,
				score: { earned: 1, possible: 0 }
			}).ok
		).toBe(false);
		expect(
			calculateAssignmentImpact({
				model: 'total',
				earned: 80,
				possible: 100,
				score: { earned: 1, possible: 1, extraCredit: true }
			}).ok
		).toBe(false);
	});
	it('rejects extreme finite inputs when the percentage overflows', () => {
		expect(
			calculateAssignmentImpact({
				model: 'total',
				earned: 1e308,
				possible: 1e-308,
				score: { earned: 0, possible: 100 }
			}).ok
		).toBe(false);
	});
});

describe('weighted points-based categories and category targets', () => {
	it('adds inside a category: 210/250 tests and 95/100 homework = 89.5%', () => {
		const result = success(
			calculateAssignmentImpact({
				model: 'categories',
				categories,
				categoryId: 'tests',
				score: { earned: 40, possible: 50 }
			})
		);
		expect(result.before).toBe(90);
		expect(result.after).toBe(89.5);
		expect(result.delta).toBe(-0.5);
	});
	it('removes the original from only its category before replacement', () => {
		const result = success(
			calculateAssignmentImpact({
				model: 'categories',
				categories,
				categoryId: 'tests',
				previous: { earned: 20, possible: 25 },
				score: { earned: 40, possible: 50 }
			})
		);
		expect(result.after).toBeCloseTo(89.7222222222); // average of 190/225 and 95/100
	});
	it('normalizes inactive categories, then activates a first scored assignment', () => {
		const partiallyGraded = [
			{ id: 'tests', name: 'Tests', weight: 70, earned: 80, possible: 100 },
			{ id: 'homework', name: 'Homework', weight: 30, earned: 0, possible: 0 }
		];
		const result = success(
			calculateAssignmentImpact({
				model: 'categories',
				categories: partiallyGraded,
				categoryId: 'homework',
				score: { earned: 90, possible: 100 }
			})
		);
		expect(result).toMatchObject({ before: 80, after: 83, delta: 3, includedWeight: 100 });
		const extra = success(
			calculateAssignmentImpact({
				model: 'categories',
				categories: partiallyGraded,
				categoryId: 'homework',
				score: { earned: 10, possible: 0, extraCredit: true }
			})
		);
		expect(extra).toMatchObject({ before: 80, after: 80, includedWeight: 70 });
	});
	it('solves 97/100 new test points for 92% and forward-checks it', () => {
		const result = success(
			calculateCategoryTarget({
				categories,
				categoryId: 'tests',
				target: 92,
				assignmentPossible: 100
			})
		);
		expect(result.requiredPoints).toBeCloseTo(97);
		expect(result.requiredPercentage).toBeCloseTo(97);
		expect(result.minimumPoints).toBe(97);
		expect(result.forwardGrade).toBeCloseTo(92);
	});
	it('does not treat a test category weight as the new final assignment overall weight', () => {
		const category = success(
			calculateCategoryTarget({
				categories,
				categoryId: 'tests',
				target: 92,
				assignmentPossible: 100
			})
		);
		const overall = success(calculateFinalTarget({ current: 90, target: 92, weight: 50 }));
		expect(category.requiredPercentage).toBeCloseTo(97);
		expect(overall.required).toBe(94);
	});
	it('keeps unreachable and negative category targets honest', () => {
		const high = success(
			calculateCategoryTarget({
				categories,
				categoryId: 'tests',
				target: 95,
				assignmentPossible: 100
			})
		);
		expect(high.requiredPoints).toBeCloseTo(115);
		expect(high.status).toBe('above-maximum');
		const low = success(
			calculateCategoryTarget({
				categories,
				categoryId: 'tests',
				target: 70,
				assignmentPossible: 100
			})
		);
		expect(low.requiredPoints).toBeCloseTo(-35);
		expect(low.minimumPoints).toBe(0);
		expect(low.forwardGrade).toBeCloseTo(75.8333333333);
		expect(low.status).toBe('already-secured');
	});
	it('rejects zero weights, missing categories, negative points and empty input', () => {
		for (const badCategories of [
			[],
			[{ ...categories[0], weight: 0 }],
			[{ ...categories[0], earned: -1 }]
		])
			expect(
				calculateCategoryTarget({
					categories: badCategories,
					categoryId: 'tests',
					target: 90,
					assignmentPossible: 100
				}).ok
			).toBe(false);
		expect(
			calculateCategoryTarget({
				categories,
				categoryId: 'missing',
				target: 90,
				assignmentPossible: 100
			}).ok
		).toBe(false);
		expect(
			calculateCategoryTarget({
				categories,
				categoryId: 'tests',
				target: 90,
				assignmentPossible: 0
			}).ok
		).toBe(false);
	});
});

describe('explicit weighted-grade normalization', () => {
	const rows: [WeightedGradeRow, WeightedGradeRow] = [
		{ id: 'tests', name: 'Tests', grade: 80, weight: 70, included: true },
		{ id: 'homework', name: 'Homework', grade: 100, weight: 30, included: true }
	];
	it('calculates 80×.70+100×.30=86', () =>
		expect(success(calculateWeightedGrade(rows, 'require-100')).grade).toBe(86));
	it('requires 100% unless normalization is explicitly requested', () => {
		const partial = [
			{ ...rows[0], weight: 30 },
			{ ...rows[1], weight: 20 }
		];
		expect(calculateWeightedGrade(partial, 'require-100').ok).toBe(false);
		expect(success(calculateWeightedGrade(partial, 'normalize'))).toMatchObject({
			grade: 88,
			totalWeight: 50
		});
	});
	it('distinguishes excluded ungraded work, blank included grades and scored zeros', () => {
		expect(
			success(
				calculateWeightedGrade(
					[rows[0], { ...rows[1], grade: undefined, included: false }],
					'normalize'
				)
			).grade
		).toBe(80);
		expect(
			calculateWeightedGrade([rows[0], { ...rows[1], grade: undefined }], 'normalize').ok
		).toBe(false);
		expect(
			success(calculateWeightedGrade([rows[0], { ...rows[1], grade: 0 }], 'require-100')).grade
		).toBe(56);
	});
	it('rejects all-excluded or all-zero-weight grades', () => {
		expect(
			calculateWeightedGrade(
				rows.map((r) => ({ ...r, included: false })),
				'normalize'
			).ok
		).toBe(false);
		expect(
			calculateWeightedGrade(
				rows.map((r) => ({ ...r, weight: 0 })),
				'normalize'
			).ok
		).toBe(false);
	});
});

describe('configurable credit-weighted GPA with no district policy', () => {
	const scale = [
		{ letter: 'A', points: 4 },
		{ letter: 'B', points: 3 },
		{ letter: 'F', points: 0 }
	];
	const rows: [PublicGpaRow, PublicGpaRow] = [
		{ id: 'a', name: 'A course', grade: 'A', credits: 1, bonus: 0, included: true },
		{ id: 'b', name: 'B course', grade: 'B', credits: 0.5, bonus: 0, included: true }
	];
	it('uses course credits: (4×1+3×.5)/1.5 = 3⅔', () => {
		const result = success(calculatePublicGpa(rows, scale));
		expect(result.unweighted).toBeCloseTo(3.6666666667);
		expect(result.weighted).toBeCloseTo(3.6666666667);
		expect(result.credits).toBe(1.5);
	});
	it('uses an explicitly configured plus/minus scale and rigor bonus', () => {
		const result = success(
			calculatePublicGpa(
				[
					{ ...rows[0], grade: 'a-', bonus: 0.5 },
					{ ...rows[1], bonus: 1 }
				],
				[...scale, { letter: 'A-', points: 3.7 }]
			)
		);
		expect(result.unweighted).toBeCloseTo(3.4666666667);
		expect(result.weighted).toBeCloseTo(4.1333333333); // (4.2×1+4×.5)/1.5
	});
	it('applies a configured eligibility threshold for bonuses', () => {
		const result = success(
			calculatePublicGpa(
				[
					{ ...rows[0], grade: 'F', bonus: 1 },
					{ ...rows[1], bonus: 1 }
				],
				scale,
				1
			)
		);
		expect(result.unweighted).toBe(1);
		expect(result.weighted).toBeCloseTo(1.3333333333);
	});
	it('excludes ineligible courses rather than guessing a pass/fail conversion', () => {
		const pass = { ...rows[1], grade: 'P', credits: undefined, included: false };
		expect(success(calculatePublicGpa([rows[0], pass], scale)).unweighted).toBe(4);
		expect(calculatePublicGpa([rows[0], { ...pass, credits: 0.5, included: true }], scale).ok).toBe(
			false
		);
	});
	it('rejects zero credit totals, duplicate scale labels and invalid values', () => {
		expect(
			calculatePublicGpa(
				rows.map((r) => ({ ...r, credits: 0 })),
				scale
			).ok
		).toBe(false);
		expect(calculatePublicGpa(rows, [...scale, { letter: 'a', points: 4 }]).ok).toBe(false);
		expect(calculatePublicGpa(rows, [{ letter: 'A', points: Number.NaN }]).ok).toBe(false);
		expect(calculatePublicGpa([{ ...rows[0], bonus: -1 }], scale).ok).toBe(false);
	});
});
