import {
	calculateCourseGradePercentageFromCategories,
	type Category
} from '$lib/grades/assignments';
import { expect, test } from 'vitest';

const category = (name: string, weightPercentage: number): Category => ({
	name,
	weightPercentage,
	pointsEarned: 0,
	pointsPossible: 0,
	weightedPercentage: 0,
	gradeLetter: ''
});
const categories = [category('Tests', 85), category('Final', 15)];

test('an extra-credit-only category leaves other graded categories available', () => {
	expect(
		calculateCourseGradePercentageFromCategories(
			{
				Tests: { pointsEarned: 80, pointsPossible: 100 },
				Final: { pointsEarned: 2, pointsPossible: 0 }
			},
			categories
		)
	).toBeCloseTo(80);
});

test('future graded work activates the category and includes its existing extra credit', () => {
	expect(
		calculateCourseGradePercentageFromCategories(
			{
				Tests: { pointsEarned: 80, pointsPossible: 100 },
				Final: { pointsEarned: 98 + 2, pointsPossible: 100 }
			},
			categories
		)
	).toBeCloseTo(83);
});

test('extra-credit-only work without any counted denominator has no course percentage', () => {
	expect(
		calculateCourseGradePercentageFromCategories(
			{
				Final: { pointsEarned: 2, pointsPossible: 0 }
			},
			categories
		)
	).toBeNaN();
});

test.each([-1, NaN, Infinity])(
	'invalid category denominator %s remains undefined',
	(pointsPossible) => {
		expect(
			calculateCourseGradePercentageFromCategories(
				{
					Tests: { pointsEarned: 80, pointsPossible: 100 },
					Final: { pointsEarned: 2, pointsPossible }
				},
				categories
			)
		).toBeNaN();
	}
);

test.each([NaN, Infinity])(
	'nonfinite earned points %s cannot be hidden behind a zero denominator',
	(pointsEarned) => {
		expect(
			calculateCourseGradePercentageFromCategories(
				{
					Tests: { pointsEarned: 80, pointsPossible: 100 },
					Final: { pointsEarned, pointsPossible: 0 }
				},
				categories
			)
		).toBeNaN();
	}
);

test('a negative category weight remains invalid', () => {
	expect(
		calculateCourseGradePercentageFromCategories(
			{
				Tests: { pointsEarned: 80, pointsPossible: 100 }
			},
			[category('Tests', -85)]
		)
	).toBeNaN();
});
