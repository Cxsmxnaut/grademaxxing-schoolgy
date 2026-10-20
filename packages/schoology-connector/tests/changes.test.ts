import assert from 'node:assert/strict';
import test from 'node:test';
import type { GradebookSnapshot } from '../src/index.js';
import { diffGradebooks } from '../src/index.js';
import { assignment, categories, period } from './fixtures.js';
const snapshot = (): GradebookSnapshot => ({
	source: 'schoology',
	user: { id: '7', displayName: 'Fictional' },
	fetchedAt: '2026-01-01T00:00:00Z',
	warnings: [],
	courses: [
		{
			id: 'math',
			title: 'Math',
			sectionTitle: '',
			weightedCategories: true,
			categories,
			periods: [period()]
		}
	]
});

test('detects added, changed, removed and official grades across snapshots', () => {
	const before = snapshot();
	const after = structuredClone(before);
	const p = after.courses[0]!.periods[0]!;
	p.assignments[0]!.score = 90;
	p.assignments.pop();
	p.assignments.push(assignment({ id: 'new' }));
	p.officialGrade = 93;
	assert.deepEqual(
		diffGradebooks(before, after).map((change) => change.kind),
		['assignment-changed', 'assignment-added', 'assignment-removed', 'official-grade-changed']
	);
});

test('ignores fetch/grade timestamps and refuses comparisons across accounts', () => {
	const before = snapshot();
	const after = structuredClone(before);
	after.fetchedAt = '2026-02-01T00:00:00Z';
	after.courses[0]!.periods[0]!.assignments[0]!.updatedAt = after.fetchedAt;
	assert.deepEqual(diffGradebooks(before, after), []);
	after.user.id = 'someone-else';
	assert.throws(() => diffGradebooks(before, after));
});
