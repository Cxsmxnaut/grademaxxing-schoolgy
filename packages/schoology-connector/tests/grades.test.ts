import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateGrade, requiredScore, simulateGrade } from '../src/index.js';
import { assignment, categories, period } from './fixtures.js';
const close = (actual: number | null, expected: number): void => {
	assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
};

test('weighted categories, factors, and empty category normalization', () => {
	close(calculateGrade(period().assignments, categories, { mode: 'weighted' }).percentage, 86);
	close(calculateGrade([assignment()], categories, { mode: 'weighted' }).percentage, 80);
	close(
		calculateGrade([assignment({ factor: 2 }), assignment({ id: 'b', score: 100 })], categories, {
			mode: 'points'
		}).percentage,
		(260 / 300) * 100
	);
	assert.equal(calculateGrade([], categories, { mode: 'weighted' }).percentage, null);
});

test('zero is a real grade; excused, incomplete and ungraded work do not count', () => {
	const items = [
		assignment({ score: 0 }),
		...(['excused', 'incomplete', 'ungraded'] as const).map((status) =>
			assignment({ id: status, score: null, status })
		)
	];
	close(calculateGrade(items, categories, { mode: 'points' }).percentage, 0);
});

test('missing assignment policy is explicit and unknown exceptions block an estimate', () => {
	const items = [assignment(), assignment({ id: 'missing', status: 'missing', score: null })];
	close(calculateGrade(items, categories, { mode: 'points', missing: 'exclude' }).percentage, 80);
	close(calculateGrade(items, categories, { mode: 'points', missing: 'zero' }).percentage, 40);
	assert.equal(
		calculateGrade([assignment({ status: 'unknown', rawGrade: 'A' })], categories, {
			mode: 'points'
		}).percentage,
		null
	);
});

test('percent-based categories average assignment percentages rather than points', () => {
	const rules = [{ ...categories[0]!, calculation: 'percent' as const }];
	const items = [
		assignment({ score: 10, maxPoints: 10 }),
		assignment({ id: 'b', score: 50, maxPoints: 100 })
	];
	close(calculateGrade(items, rules, { mode: 'weighted' }).percentage, 75);
	assert.equal(calculateGrade(items, rules, { mode: 'points' }).percentage, null);
});

test('drop-lowest policy and point-based extra credit work without mutating input', () => {
	const items = [
		assignment({ score: 50 }),
		assignment({ id: 'b', score: 90 }),
		assignment({ id: 'bonus', score: 5, maxPoints: 0 })
	];
	const copy = structuredClone(items);
	const result = calculateGrade(items, [{ ...categories[0]!, dropLowest: 1 }], { mode: 'points' });
	close(result.percentage, 95);
	assert.deepEqual(result.categories[0]!.dropped, ['assignment:quiz-1']);
	assert.deepEqual(items, copy);
});

test('unknown rules require explicit assumptions, and unsupported finals remain unavailable', () => {
	const rules = [{ ...categories[0]!, calculation: null, dropLowest: null }];
	assert.equal(calculateGrade([assignment()], rules, { mode: 'points' }).percentage, null);
	const assumed = calculateGrade([assignment()], rules, {
		mode: 'points',
		unknownRules: 'assume-points'
	});
	close(assumed.percentage, 80);
	assert.equal(assumed.warnings.length, 1);
	assert.equal(
		calculateGrade([assignment({ isFinal: true })], categories, { mode: 'points' }).percentage,
		null
	);
});

test('what-if changes, additions and drops preserve original data and official grade', () => {
	const original = period();
	const copy = structuredClone(original);
	const result = simulateGrade(original, categories, { mode: 'weighted' }, [
		{ kind: 'change', id: 'quiz-1', score: 90 },
		{ kind: 'add', assignment: assignment({ id: 'future', score: 100 }) },
		{ kind: 'drop', id: 'homework-1' }
	]);
	close(result.projected.percentage, 95);
	assert.equal(result.officialGrade, 86);
	assert.deepEqual(original, copy);
	assert.ok(result.assignments.every((item) => item.hypothetical));
});

test('target solver handles reachable, impossible, and already-met targets', () => {
	const original = { ...period(), assignments: [assignment()] };
	const future = assignment({ id: 'future' });
	const reachable = requiredScore(original, categories, { mode: 'points' }, future, 90);
	assert.equal(reachable.status, 'reachable');
	if (reachable.status === 'reachable') close(reachable.requiredPoints, 100);
	assert.equal(
		requiredScore(original, categories, { mode: 'points' }, future, 95).status,
		'unreachable'
	);
	const met = requiredScore(original, categories, { mode: 'points' }, future, 30);
	if (met.status !== 'reachable') assert.fail();
	close(met.requiredPoints, 0);
	assert.equal(
		requiredScore(original, [{ ...categories[0]!, dropLowest: 1 }], { mode: 'points' }, future, 90)
			.status,
		'unavailable'
	);
});

test('ambiguous grade IDs, duplicate additions, invalid numbers and missing weights fail explicitly', () => {
	const original = period();
	original.assignments.push(assignment({ type: 'discussion' }));
	assert.throws(() =>
		simulateGrade(original, categories, { mode: 'points' }, [
			{ kind: 'change', id: 'quiz-1', score: 99 }
		])
	);
	assert.throws(() =>
		simulateGrade(period(), categories, { mode: 'points' }, [
			{ kind: 'add', assignment: assignment() }
		])
	);
	assert.equal(
		calculateGrade([assignment({ score: NaN })], categories, { mode: 'points' }).percentage,
		null
	);
	assert.equal(
		calculateGrade([assignment()], [{ ...categories[0]!, weight: null }], { mode: 'weighted' })
			.percentage,
		null
	);
});
