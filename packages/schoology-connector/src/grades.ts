// Category/period recalculation adapted from SchoologyPlus grades.ts into pure functions.
// No DOM, cookies, account writes or rounding during intermediate calculations.
import type { GradebookAssignment, GradebookPeriod, GradingCategory } from './types.js';
export type { GradebookAssignment, GradebookPeriod, GradingCategory } from './types.js';

export interface CalculationOptions {
	/** Choose explicitly; hidden Schoology settings cannot reliably determine this. */
	mode: 'points' | 'weighted' | 'equal-categories';
	missing?: 'exclude' | 'zero';
	unknownRules?: 'reject' | 'assume-points';
	/** Only when the caller knows finals belong in ordinary category totals. */
	includeFinalAsRegular?: boolean;
}
export interface CategoryEstimate {
	id: string;
	earned: number;
	possible: number;
	percentage: number | null;
	dropped: string[];
}
export interface GradeEstimate {
	estimated: true;
	percentage: number | null;
	categories: CategoryEstimate[];
	warnings: string[];
}
const key = (item: GradebookAssignment): string => `${item.type}:${item.id}`;
const nonnegative = (value: number): boolean => Number.isFinite(value) && value >= 0;

export function calculateGrade(
	items: readonly GradebookAssignment[],
	rules: readonly GradingCategory[],
	options: CalculationOptions
): GradeEstimate {
	if (!['points', 'weighted', 'equal-categories'].includes(options.mode))
		throw new RangeError('A calculation mode is required.');
	const warnings: string[] = [];
	let invalid = false;
	const fail = (message: string): void => {
		invalid = true;
		warnings.push(message);
	};
	const categories = new Map(rules.map((rule) => [rule.id, rule]));
	if (categories.size !== rules.length) throw new RangeError('Category IDs must be unique.');
	const buckets = new Map<string, { item: GradebookAssignment; score: number; max: number }[]>();
	const identities = new Set<string>();
	for (const item of items) {
		if (identities.has(key(item)))
			throw new RangeError('Grade item identities must be unique within a period.');
		identities.add(key(item));
		if (['excused', 'incomplete', 'ungraded'].includes(item.status)) continue;
		if (item.status === 'missing' && options.missing !== 'zero') continue;
		if (item.status === 'unknown') {
			fail(`Unsupported grade or exception on ${key(item)}.`);
			continue;
		}
		const score = item.status === 'missing' ? 0 : item.score;
		if (
			score === null ||
			!nonnegative(score) ||
			item.maxPoints === null ||
			!nonnegative(item.maxPoints) ||
			!nonnegative(item.factor)
		) {
			fail(`Invalid or unavailable score, possible points or factor on ${key(item)}.`);
			continue;
		}
		if (item.factor === 0) continue;
		if (item.isFinal && !options.includeFinalAsRegular) {
			fail(`Final item ${key(item)} requires an explicit final weighting plan.`);
			continue;
		}
		const id = item.categoryId ?? '';
		const bucket = buckets.get(id) ?? [];
		bucket.push({ item, score, max: item.maxPoints });
		buckets.set(id, bucket);
	}
	const output: CategoryEstimate[] = [];
	for (const [id, bucket] of buckets) {
		const rule = categories.get(id);
		if (!rule || rule.calculation === null || rule.dropLowest === null) {
			if (options.unknownRules !== 'assume-points')
				fail(`Calculation or drop-lowest rules unavailable for category ${id || '(none)'}.`);
			else
				warnings.push(
					`Assumed points calculation and zero dropped grades where rules are unavailable for category ${id || '(none)'}.`
				);
		}
		const calculation = rule?.calculation ?? 'points';
		const drop = rule?.dropLowest ?? 0;
		if (!Number.isInteger(drop) || drop < 0) {
			fail(`Invalid drop-lowest rule for category ${id}.`);
			continue;
		}
		// Drop by assignment percentage; exclude zero-denominator extra credit from drop candidates.
		const dropped = bucket
			.filter((row) => row.max > 0)
			.sort((a, b) => a.score / a.max - b.score / b.max || key(a.item).localeCompare(key(b.item)))
			.slice(0, drop)
			.map((row) => key(row.item));
		const kept = bucket.filter((row) => !dropped.includes(key(row.item)));
		let earned = 0;
		let possible = 0;
		for (const row of kept) {
			if (calculation === 'percent') {
				if (row.max === 0) {
					fail(`Zero-point extra credit in percent category ${id} needs a district-specific rule.`);
					continue;
				}
				earned += (row.score / row.max) * row.item.factor;
				possible += row.item.factor;
			} else {
				earned += row.score * row.item.factor;
				possible += row.max * row.item.factor;
			}
		}
		output.push({
			id,
			earned,
			possible,
			percentage: possible > 0 ? (earned / possible) * 100 : null,
			dropped
		});
	}
	let percentage: number | null = null;
	if (options.mode === 'points') {
		if (output.some((item) => categories.get(item.id)?.calculation === 'percent'))
			fail(
				'Total-points mode cannot combine percent-based categories; use equal-categories or weighted mode.'
			);
		const earned = output.reduce((sum, item) => sum + item.earned, 0);
		const possible = output.reduce((sum, item) => sum + item.possible, 0);
		if (possible > 0) percentage = (earned / possible) * 100;
	} else {
		let total = 0;
		let weight = 0;
		for (const item of output) {
			// An empty category does not count, but standalone extra credit is not silently discarded.
			if (item.percentage === null) {
				if (item.earned !== 0)
					fail(`Standalone extra credit in category ${item.id} needs an explicit weighting rule.`);
				continue;
			}
			const categoryWeight =
				options.mode === 'equal-categories' ? 1 : categories.get(item.id)?.weight;
			if (categoryWeight == null || !nonnegative(categoryWeight)) {
				fail(`Weight unavailable for category ${item.id}.`);
				continue;
			}
			total += item.percentage * categoryWeight;
			weight += categoryWeight;
		}
		// Normalize only across nonempty categories; accept either 70/30 or .7/.3 weights.
		if (weight > 0) percentage = total / weight;
	}
	if (output.some((item) => item.dropped.length > 0))
		warnings.push(
			'Dropped the lowest assignment percentages; confirm this policy against the school gradebook.'
		);
	return { estimated: true, percentage: invalid ? null : percentage, categories: output, warnings };
}

export type WhatIfEdit =
	| { kind: 'add'; assignment: GradebookAssignment }
	| {
			kind: 'change';
			id: string;
			type?: string;
			score: number | null;
			status?: GradebookAssignment['status'];
	  }
	| { kind: 'drop'; id: string; type?: string };

export function simulateGrade(
	period: GradebookPeriod,
	rules: readonly GradingCategory[],
	options: CalculationOptions,
	edits: readonly WhatIfEdit[]
) {
	let assignments = period.assignments.map((item) => ({ ...item }));
	for (const edit of edits) {
		if (edit.kind === 'add') {
			if (assignments.some((item) => key(item) === key(edit.assignment)))
				throw new RangeError('Hypothetical assignment already exists.');
			assignments.push({ ...edit.assignment, hypothetical: true });
			continue;
		}
		const matches = assignments.filter(
			(item) => item.id === edit.id && (edit.type === undefined || item.type === edit.type)
		);
		if (matches.length !== 1)
			throw new RangeError(
				'What-if edit must match exactly one grade item; specify its type if IDs overlap.'
			);
		const target = matches[0]!;
		if (edit.kind === 'drop') assignments = assignments.filter((item) => item !== target);
		else {
			target.score = edit.score;
			target.rawGrade = edit.score;
			target.status = edit.status ?? (edit.score === null ? 'ungraded' : 'graded');
			target.exception = 0;
			target.hypothetical = true;
		}
	}
	return {
		officialGrade: period.officialGrade,
		assignments,
		baseline: calculateGrade(period.assignments, rules, options),
		projected: calculateGrade(assignments, rules, options)
	};
}

export type TargetScoreResult =
	| { status: 'reachable'; requiredPoints: number; requiredPercent: number; estimated: true }
	| { status: 'unreachable'; maximumPercent: number; estimated: true }
	| { status: 'unavailable'; reason: string; estimated: true };

/** Adds one upcoming item; maximum possible score is its maxPoints (no assumed extra credit). */
export function requiredScore(
	period: GradebookPeriod,
	rules: readonly GradingCategory[],
	options: CalculationOptions,
	upcoming: GradebookAssignment,
	targetPercent: number
): TargetScoreResult {
	if (
		!nonnegative(targetPercent) ||
		upcoming.maxPoints === null ||
		!nonnegative(upcoming.maxPoints) ||
		upcoming.maxPoints === 0
	)
		throw new RangeError('Target must be nonnegative and upcoming maxPoints must be positive.');
	if (rules.some((rule) => (rule.dropLowest ?? 0) > 0))
		return {
			status: 'unavailable',
			reason: 'Target solving with drop-lowest rules is not supported.',
			estimated: true
		};
	const evaluate = (score: number): GradeEstimate =>
		simulateGrade(period, rules, options, [
			{
				kind: 'add',
				assignment: { ...upcoming, score, rawGrade: score, status: 'graded', exception: 0 }
			}
		]).projected;
	const max = evaluate(upcoming.maxPoints);
	if (max.percentage === null)
		return {
			status: 'unavailable',
			reason: max.warnings.join(' ') || 'Insufficient grading data.',
			estimated: true
		};
	if (max.percentage < targetPercent)
		return { status: 'unreachable', maximumPercent: max.percentage, estimated: true };
	const zero = evaluate(0);
	if (zero.percentage === null)
		return { status: 'unavailable', reason: 'Insufficient grading data.', estimated: true };
	let low = 0;
	let high = upcoming.maxPoints;
	if (zero.percentage >= targetPercent) high = 0;
	else
		for (let iteration = 0; iteration < 60; iteration++) {
			const mid = (low + high) / 2;
			if (evaluate(mid).percentage! >= targetPercent) high = mid;
			else low = mid;
		}
	return {
		status: 'reachable',
		requiredPoints: high,
		requiredPercent: (high / upcoming.maxPoints) * 100,
		estimated: true
	};
}
