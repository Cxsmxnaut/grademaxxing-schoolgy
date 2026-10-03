import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
import {
	calculateAssignmentGPCsFromCategories,
	calculateAssignmentGPCsFromTotals,
	calculateCourseGradePercentageFromCategories,
	calculateCourseGradePercentageFromTotals,
	getCalculableAssignments,
	getCalculableAssignmentsWithCategories,
	getCategoryAdjustments,
	getPointsByCategory,
	parseSynergyAssignment,
	type Category
} from '$lib/grades/assignments';
import { gradebookXml } from '$lib/server/gradebook-adapter';
import { parseGradebookXML } from '$lib/synergy';
import { expect, test } from 'vitest';

function roundTrip(assignments: Record<string, string>[]) {
	const xml = gradebookXml([
		{
			id: 'sample-course',
			period: '1',
			title: 'Sample Course',
			room: '',
			teacher: 'Example Teacher',
			teacherEmail: '',
			score: 'B',
			scoreRaw: '90',
			missing: '0',
			categories: [],
			assignments
		}
	]);
	return parseGradebookXML(xml).Courses.Course[0]!.Marks!.Mark[0]!.Assignments!.Assignment;
}

test('weighted points, raw scores, and official assignment percentages survive the XML adapter', () => {
	const rows = roundTrip([
		{
			AssignmentID: 'earlier',
			Measure: 'Earlier work',
			Type: 'Homework',
			Date: '9/1/2026',
			Points: '1 / 1',
			Point: '1',
			PointPossible: '1',
			Score: '10 out of 10',
			ScoreCalValue: '10',
			ScoreMaxValue: '10',
			AssignmentPercentage: '100'
		},
		{
			AssignmentID: 'weighted',
			Measure: 'Weighted quiz',
			Type: 'Homework',
			Date: '9/2/2026',
			Points: '0.8 / 1',
			Point: '0.8',
			PointPossible: '1',
			Score: '8 out of 10',
			ScoreCalValue: '8',
			ScoreMaxValue: '10',
			AssignmentPercentage: '80'
		}
	]);
	const parsed = rows.map(parseSynergyAssignment);
	expect(rows[1]!._AssignmentPercentage).toBe('80');
	expect(parsed[1]).toMatchObject({
		pointsEarned: 0.8,
		pointsPossible: 1,
		officialPercentage: 80,
		unscaledPoints: { pointsEarned: 8, pointsPossible: 10 }
	});
	expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments(parsed))).toBe(90);
});

test('a numeric raw display score cannot fabricate missing weighted earned points', () => {
	const [row] = roundTrip([
		{
			AssignmentID: 'pending',
			Measure: 'Pending work',
			Type: 'Homework',
			Date: '9/1/2026',
			Points: '1 Points Possible',
			Score: '8'
		}
	]);
	expect(row!._Point).toBeUndefined();
	expect(parseSynergyAssignment(row!)).toMatchObject({
		pointsEarned: undefined,
		pointsPossible: 1
	});
});

test.each(['0', '125'])(
	'official %s percent is valid, including zero and bonus credit',
	(percentage) => {
		const [row] = roundTrip([
			{
				AssignmentID: 'scored',
				Measure: 'Sample work',
				Type: 'Homework',
				Date: '9/1/2026',
				Points: `${Number(percentage) / 100} / 1`,
				AssignmentPercentage: percentage
			}
		]);
		expect(parseSynergyAssignment(row!).officialPercentage).toBe(Number(percentage));
	}
);

test.each(['', 'N/A', 'NaN', 'Infinity', '80 points'])(
	'invalid percentage %s is unavailable',
	(percentage) => {
		const [row] = roundTrip([
			{
				AssignmentID: 'sample',
				Measure: 'Sample work',
				Type: 'Homework',
				Date: '9/1/2026',
				Points: '0.8 / 1',
				AssignmentPercentage: percentage
			}
		]);
		expect(parseSynergyAssignment(row! as AssignmentEntity).officialPercentage).toBeUndefined();
	}
);

function scored(overrides: Record<string, string> = {}) {
	const [row] = roundTrip([
		{
			AssignmentID: 'synthetic-score',
			Measure: 'Synthetic score',
			Type: 'Homework',
			Date: '9/2/2026',
			Points: '1 / 1',
			...overrides
		}
	]);
	return parseSynergyAssignment(row!);
}

function category(name: string, weightPercentage = 100): Category {
	return {
		name,
		weightPercentage,
		pointsEarned: 0,
		pointsPossible: 0,
		weightedPercentage: 0,
		gradeLetter: ''
	};
}

test('a raw maximum never fills in missing assignment weight', () => {
	const assignment = scored({ Points: '', Point: '8', ScoreCalValue: '8', ScoreMaxValue: '10' });
	expect(assignment).toMatchObject({
		pointsEarned: 8,
		pointsPossible: undefined,
		extraCredit: false,
		unscaledPoints: { pointsEarned: 8, pointsPossible: 10 }
	});
	expect(getCalculableAssignments([assignment])).toEqual([]);
});

test.each(['2 / ', '2 / 0'])(
	'bonus points with %s count without a fabricated raw denominator',
	(Points) => {
		const bonus = scored({ Points, ScoreCalValue: '2', ScoreMaxValue: '10' });
		const ordinary = scored({ AssignmentID: 'ordinary', Points: '8 / 10', Date: '9/1/2026' });
		expect(bonus).toMatchObject({ pointsEarned: 2, pointsPossible: 0, extraCredit: true });
		const assignments = [bonus, ordinary];
		expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments(assignments))).toBe(
			100
		);
		expect(
			calculateCourseGradePercentageFromCategories(
				getPointsByCategory(getCalculableAssignmentsWithCategories(assignments)),
				[category('Homework')]
			)
		).toBe(100);
		expect(calculateAssignmentGPCsFromTotals(assignments)[0]?.gradePercentageChange).toBe(20);
		expect(
			calculateAssignmentGPCsFromCategories(assignments, [category('Homework')])[0]
				?.gradePercentageChange
		).toBe(20);
	}
);

test.each(['0 / ', '2 / '])(
	'a bonus-only category with %s has no computable percentage',
	(Points) => {
		const bonus = scored({ Points, Type: 'Bonus' });
		const ordinary = scored({ AssignmentID: 'ordinary', Points: '8 / 10' });
		expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([bonus]))).toBeNaN();
		const bonusTotals = getPointsByCategory(getCalculableAssignmentsWithCategories([bonus]));
		expect(
			calculateCourseGradePercentageFromCategories(bonusTotals, [category('Bonus')])
		).toBeNaN();
		const mixedTotals = getPointsByCategory(
			getCalculableAssignmentsWithCategories([bonus, ordinary])
		);
		expect(
			calculateCourseGradePercentageFromCategories(mixedTotals, [
				category('Bonus', 50),
				category('Homework', 50)
			])
		).toBeNaN();
		expect(
			calculateAssignmentGPCsFromCategories([bonus], [category('Bonus')])[0]?.gradePercentageChange
		).toBeUndefined();
	}
);

test('precise assignment percentage supplies math without changing integer-rounded display points', () => {
	const assignment = scored({ AssignmentPercentage: '60', AssignmentPercentagePrecision: '0' });
	expect(assignment.pointsEarned).toBe(1);
	expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([assignment]))).toBe(60);
	const flowed = calculateAssignmentGPCsFromTotals([assignment]);
	expect(flowed[0]?.pointsEarned).toBe(1);
	expect(calculateAssignmentGPCsFromTotals(flowed)[0]?.pointsEarned).toBe(1);
	const samePercentageEdit = { ...assignment, pointsEarned: 0.6 };
	expect(
		calculateCourseGradePercentageFromTotals(getCalculableAssignments([samePercentageEdit]))
	).toBe(60);
	const changedMaximum = { ...assignment, pointsPossible: 2 };
	expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([changedMaximum]))).toBe(
		50
	);
	const hypothetical = { ...assignment, newHypothetical: true };
	expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([hypothetical]))).toBe(
		100
	);
});

test('fractional published percentages normalize rounded calculations and category adjustments consistently', () => {
	const assignment = scored({
		Points: '0.8 / 1',
		AssignmentPercentage: '79.5',
		AssignmentPercentagePrecision: '1'
	});
	expect(assignment.pointsEarned).toBe(0.8);
	expect(getCalculableAssignments([assignment])[0]?.pointsEarned).toBe(0.795);
	const gradeCategory = { ...category('Homework'), pointsEarned: 0.795, pointsPossible: 1 };
	expect(getCategoryAdjustments([assignment], [gradeCategory])).toEqual([]);
	expect(
		calculateAssignmentGPCsFromCategories([assignment], [gradeCategory])[0]?.pointsEarned
	).toBe(0.8);
	expect(
		calculateCourseGradePercentageFromTotals(
			getCalculableAssignments([{ ...assignment, pointsEarned: 0.795 }])
		)
	).toBe(79.5);
});

test.each([
	['66.67 / 100.00', '67', '0', 66.67],
	['67.04 / 100.00', '67.0', '1', 67.04]
])(
	'coarse published percentage does not replace precise weighted values %s',
	(Points, AssignmentPercentage, AssignmentPercentagePrecision, expected) => {
		const assignment = scored({
			Points: String(Points),
			AssignmentPercentage: String(AssignmentPercentage),
			AssignmentPercentagePrecision: String(AssignmentPercentagePrecision)
		});
		expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([assignment]))).toBe(
			expected
		);
	}
);

test('a known percentage and maximum supply math even when weighted earned points are absent', () => {
	const assignment = scored({
		Points: '1 Points Possible',
		AssignmentPercentage: '80',
		AssignmentPercentagePrecision: '2'
	});
	expect(assignment).toMatchObject({
		pointsEarned: undefined,
		pointsPossible: 1,
		officialPercentage: 80
	});
	expect(getCalculableAssignments([assignment])[0]?.pointsEarned).toBe(0.8);
	expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([assignment]))).toBe(80);
});

test('ambiguous weighted scale retains display values but is excluded from calculation', () => {
	const assignment = scored({
		Points: '8 / 1',
		AssignmentPercentage: '80',
		CalculationUnavailable: 'true',
		ScoreCalValue: '8',
		ScoreMaxValue: '10'
	});
	expect(assignment).toMatchObject({
		pointsEarned: 8,
		pointsPossible: 1,
		officialPercentage: 80,
		calculationUnavailable: true
	});
	expect(getCalculableAssignments([assignment])).toEqual([]);
	expect(getCalculableAssignmentsWithCategories([assignment])).toEqual([]);
	expect(calculateAssignmentGPCsFromTotals([assignment])[0]?.gradePercentageChange).toBeUndefined();
});

test('invalid ordinary maxima are excluded while negative category adjustments stay calculable', () => {
	const ordinary = scored({ Points: '8 / 10' });
	const invalid = scored({ Points: '1 / -1' });
	expect(getCalculableAssignments([invalid])).toEqual([]);
	const zeroMaximum = { ...ordinary, pointsPossible: 0, extraCredit: false };
	expect(getCalculableAssignments([zeroMaximum])).toEqual([]);
	const adjustment = { ...invalid, hidden: true };
	expect(getCalculableAssignments([ordinary, adjustment])).toHaveLength(2);
	expect(
		calculateCourseGradePercentageFromTotals(getCalculableAssignments([ordinary, adjustment]))
	).toBe(100);
});

test.each(['0.001', '1e-3'])(
	'point precision in %s notation takes priority over a coarse rounded percentage',
	(Point) => {
		const assignment = scored({
			Points: '',
			Point,
			PointPossible: '1',
			AssignmentPercentage: '0',
			AssignmentPercentagePrecision: '0'
		});
		expect(calculateCourseGradePercentageFromTotals(getCalculableAssignments([assignment]))).toBe(
			0.1
		);
	}
);
