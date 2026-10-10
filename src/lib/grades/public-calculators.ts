/** Anonymous calculators: entered values only; no portal, storage, session, or district policy. */
export type CalculatorResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type InputNumber = number | undefined;
export type WeightMode = 'require-100' | 'normalize';
export type PointCategory = {
	id: string;
	name: string;
	weight: InputNumber;
	earned: InputNumber;
	possible: InputNumber;
};
export type ScoreInput = { earned: InputNumber; possible: InputNumber; extraCredit?: boolean };
export type AssignmentImpactInput = {
	score: ScoreInput;
	previous?: ScoreInput;
} & (
	| { model: 'total'; earned: InputNumber; possible: InputNumber }
	| { model: 'categories'; categories: PointCategory[]; categoryId: string }
);
export type Impact = {
	before: number | undefined;
	after: number;
	delta: number | undefined;
	includedWeight?: number;
};
export type TargetStatus = 'possible' | 'already-secured' | 'above-maximum';

const failure = (error: string) => ({ ok: false as const, error });
const finite = (n: InputNumber): n is number => typeof n === 'number' && Number.isFinite(n);
const nonnegative = (n: InputNumber): n is number => finite(n) && n >= 0;
const positive = (n: InputNumber): n is number => finite(n) && n > 0;
const tolerance = 1e-8;
const roundUp = (value: number, step: number) =>
	Math.max(0, Math.ceil((value - tolerance) / step) * step);
const targetStatus = (required: number, maximum: number): TargetStatus =>
	required < -tolerance
		? 'already-secured'
		: required > maximum + tolerance
			? 'above-maximum'
			: 'possible';

export function calculateFinalTarget(input: {
	current: InputNumber;
	target: InputNumber;
	weight: InputNumber;
	maximum?: InputNumber;
	increment?: InputNumber;
}): CalculatorResult<{
	required: number;
	minimumScore: number;
	forwardGrade: number;
	status: TargetStatus;
}> {
	const { current, target, weight, maximum = 100, increment = 0.01 } = input;
	if (!nonnegative(current) || !nonnegative(target))
		return failure('Enter a finite, nonnegative current and target grade.');
	if (!positive(weight) || weight > 100)
		return failure('The final must be more than 0% and at most 100% of the overall grade.');
	if (!nonnegative(maximum) || !positive(increment))
		return failure('Enter a nonnegative maximum score and a positive score step.');
	const w = weight / 100;
	const required = (target - current * (1 - w)) / w;
	const minimumScore = roundUp(required, increment);
	const forwardGrade = current * (1 - w) + minimumScore * w;
	if (![required, minimumScore, forwardGrade].every(Number.isFinite))
		return failure('These inputs are too large to calculate reliably.');
	return {
		ok: true,
		required,
		minimumScore,
		forwardGrade,
		status: targetStatus(required < 0 ? required : minimumScore, maximum)
	};
}

function validateCategories(categories: PointCategory[]): string | undefined {
	if (!categories.length) return 'Add at least one category.';
	if (new Set(categories.map((c) => c.id)).size !== categories.length)
		return 'Category IDs must be unique.';
	for (const c of categories) {
		if (!c.name.trim()) return 'Give each category a name.';
		if (!nonnegative(c.weight) || c.weight > 100)
			return `Enter a weight from 0% to 100% for ${c.name}.`;
		if (!nonnegative(c.earned) || !nonnegative(c.possible))
			return `Enter finite, nonnegative point totals for ${c.name}.`;
	}
}

function fromCategories(categories: PointCategory[]): {
	grade: number | undefined;
	includedWeight: number;
} {
	let sum = 0;
	let includedWeight = 0;
	for (const c of categories) {
		if (c.possible! > 0 && c.weight! > 0) {
			sum += (c.earned! / c.possible!) * c.weight!;
			includedWeight += c.weight!;
		}
	}
	return { grade: includedWeight > 0 ? (sum / includedWeight) * 100 : undefined, includedWeight };
}

function validateScore(score: ScoreInput, label: string): string | undefined {
	if (!nonnegative(score.earned)) return `Enter finite, nonnegative ${label} earned points.`;
	if (score.extraCredit) {
		if (score.possible !== 0) return `${label} extra credit must add zero possible points.`;
	} else if (!positive(score.possible)) return `Enter more than zero ${label} possible points.`;
}

export function calculateAssignmentImpact(input: AssignmentImpactInput): CalculatorResult<Impact> {
	const scoreError = validateScore(input.score, 'new');
	if (scoreError) return failure(scoreError);
	if (input.previous) {
		const previousError = validateScore(input.previous, 'original');
		if (previousError) return failure(previousError);
	}
	const oldEarned = input.previous?.earned ?? 0;
	const oldPossible = input.previous?.extraCredit ? 0 : (input.previous?.possible ?? 0);
	const newPossible = input.score.extraCredit ? 0 : input.score.possible!;
	if (input.model === 'total') {
		if (!nonnegative(input.earned) || !nonnegative(input.possible))
			return failure('Enter finite, nonnegative current point totals.');
		if (oldEarned > input.earned + tolerance || oldPossible > input.possible + tolerance)
			return failure(
				'The original assignment cannot exceed the current totals that already include it.'
			);
		const afterPossible = input.possible - oldPossible + newPossible;
		if (afterPossible <= 0)
			return failure(
				'A grade needs a positive possible-point total; extra credit alone has no percentage.'
			);
		const before = input.possible > 0 ? (input.earned / input.possible) * 100 : undefined;
		const after = ((input.earned - oldEarned + input.score.earned!) / afterPossible) * 100;
		if (!Number.isFinite(after) || (before !== undefined && !Number.isFinite(before)))
			return failure('These inputs are too large to calculate reliably.');
		return { ok: true, before, after, delta: before === undefined ? undefined : after - before };
	}
	const categoryError = validateCategories(input.categories);
	if (categoryError) return failure(categoryError);
	const selected = input.categories.find((c) => c.id === input.categoryId);
	if (!selected) return failure('Choose an existing category.');
	if (selected.weight === 0)
		return failure(
			'This category has zero weight, so its assignments do not change the calculated grade.'
		);
	if (oldEarned > selected.earned! + tolerance || oldPossible > selected.possible! + tolerance)
		return failure(
			'The original assignment cannot exceed the selected category totals that already include it.'
		);
	const before = fromCategories(input.categories).grade;
	const updated = input.categories.map((c) =>
		c.id === selected.id
			? {
					...c,
					earned: c.earned! - oldEarned + input.score.earned!,
					possible: c.possible! - oldPossible + newPossible
				}
			: c
	);
	const { grade: after, includedWeight } = fromCategories(updated);
	if (after === undefined)
		return failure(
			'No positive-weight category has graded possible points. Extra credit alone cannot create a percentage.'
		);
	if (!Number.isFinite(after) || (before !== undefined && !Number.isFinite(before)))
		return failure('These inputs are too large to calculate reliably.');
	return {
		ok: true,
		before,
		after,
		includedWeight,
		delta: before === undefined ? undefined : after - before
	};
}

export function calculateCategoryTarget(input: {
	categories: PointCategory[];
	categoryId: string;
	target: InputNumber;
	assignmentPossible: InputNumber;
	increment?: InputNumber;
}): CalculatorResult<{
	requiredPoints: number;
	requiredPercentage: number;
	minimumPoints: number;
	forwardGrade: number;
	status: TargetStatus;
	includedWeight: number;
}> {
	const error = validateCategories(input.categories);
	if (error) return failure(error);
	const selected = input.categories.find((c) => c.id === input.categoryId);
	if (!selected || !positive(selected.weight))
		return failure('Choose a category with positive weight.');
	const { target, assignmentPossible, increment = 1 } = input;
	if (!nonnegative(target) || !positive(assignmentPossible) || !positive(increment))
		return failure(
			'Enter a nonnegative target, positive assignment points, and positive point step.'
		);
	let otherContribution = 0;
	let includedWeight = selected.weight;
	for (const c of input.categories) {
		if (c.id !== selected.id && c.possible! > 0 && c.weight! > 0) {
			otherContribution += (c.earned! / c.possible!) * 100 * c.weight!;
			includedWeight += c.weight!;
		}
	}
	const categoryTarget = (target * includedWeight - otherContribution) / selected.weight;
	const requiredPoints =
		(categoryTarget / 100) * (selected.possible! + assignmentPossible) - selected.earned!;
	const minimumPoints = roundUp(requiredPoints, increment);
	const forwardGrade =
		(((selected.earned! + minimumPoints) / (selected.possible! + assignmentPossible)) *
			100 *
			selected.weight +
			otherContribution) /
		includedWeight;
	if (![requiredPoints, minimumPoints, forwardGrade].every(Number.isFinite))
		return failure('These inputs are too large to calculate reliably.');
	const requiredPercentage = (requiredPoints / assignmentPossible) * 100;
	if (!Number.isFinite(requiredPercentage))
		return failure('These inputs are too large to calculate reliably.');
	return {
		ok: true,
		requiredPoints,
		requiredPercentage,
		minimumPoints,
		forwardGrade,
		status: targetStatus(requiredPoints < 0 ? requiredPoints : minimumPoints, assignmentPossible),
		includedWeight
	};
}

export type WeightedGradeRow = {
	id: string;
	name: string;
	grade: InputNumber;
	weight: InputNumber;
	included: boolean;
};
export function calculateWeightedGrade(
	rows: WeightedGradeRow[],
	mode: WeightMode
): CalculatorResult<{ grade: number; totalWeight: number }> {
	const included = rows.filter((r) => r.included);
	if (!included.length) return failure('Include at least one graded category.');
	let totalWeight = 0;
	let sum = 0;
	for (const row of included) {
		if (!row.name.trim()) return failure('Give each included category a name.');
		if (!nonnegative(row.grade))
			return failure(
				`Enter a finite, nonnegative grade for ${row.name}, or exclude it if ungraded.`
			);
		if (!nonnegative(row.weight) || row.weight > 100)
			return failure(`Enter a weight from 0% to 100% for ${row.name}.`);
		totalWeight += row.weight;
		sum += row.grade * row.weight;
	}
	if (totalWeight <= 0) return failure('Included weights must have a positive total.');
	if (mode === 'require-100' && Math.abs(totalWeight - 100) > tolerance)
		return failure(
			`Included weights total ${totalWeight}%. They must total 100%, or choose explicit normalization.`
		);
	const grade = sum / totalWeight;
	if (!Number.isFinite(grade)) return failure('These inputs are too large to calculate reliably.');
	return { ok: true, grade, totalWeight };
}

export type GpaScaleEntry = { letter: string; points: InputNumber };
export type PublicGpaRow = {
	id: string;
	name: string;
	grade: string;
	credits: InputNumber;
	bonus: InputNumber;
	included: boolean;
};
export function calculatePublicGpa(
	rows: PublicGpaRow[],
	scale: GpaScaleEntry[],
	minimumPointsForBonus: InputNumber = 0
): CalculatorResult<{ unweighted: number; weighted: number; credits: number; courses: number }> {
	if (!nonnegative(minimumPointsForBonus))
		return failure('Enter a nonnegative base-point threshold for a rigor bonus.');
	const mapping = new Map<string, number>();
	for (const entry of scale) {
		const letter = entry.letter.trim().toUpperCase();
		if (!letter || !nonnegative(entry.points))
			return failure('Each scale entry needs a grade label and finite, nonnegative points.');
		if (mapping.has(letter)) return failure(`The scale contains ${letter} more than once.`);
		mapping.set(letter, entry.points);
	}
	if (!mapping.size) return failure('Add at least one grade-point scale entry.');
	const included = rows.filter((r) => r.included);
	if (!included.length) return failure('Include at least one course.');
	let credits = 0;
	let unweighted = 0;
	let weighted = 0;
	for (const row of included) {
		const points = mapping.get(row.grade.trim().toUpperCase());
		if (points === undefined)
			return failure(
				`Choose a configured grade for ${row.name || 'each included course'}. Exclude pass/fail work unless its policy is configured.`
			);
		if (!positive(row.credits))
			return failure(`Enter positive credits for ${row.name || 'each included course'}.`);
		if (!nonnegative(row.bonus))
			return failure(`Enter a nonnegative rigor bonus for ${row.name || 'each included course'}.`);
		credits += row.credits;
		unweighted += points * row.credits;
		weighted += (points + (points >= minimumPointsForBonus ? row.bonus : 0)) * row.credits;
	}
	if (![credits, unweighted, weighted].every(Number.isFinite))
		return failure('These inputs are too large to calculate reliably.');
	return {
		ok: true,
		unweighted: unweighted / credits,
		weighted: weighted / credits,
		credits,
		courses: included.length
	};
}
