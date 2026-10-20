import type { GradebookAssignment, GradebookSnapshot } from './types.js';

export interface GradebookChange {
	kind: 'assignment-added' | 'assignment-changed' | 'assignment-removed' | 'official-grade-changed';
	courseId: string;
	periodId: string;
	assignmentId?: string;
	assignmentType?: string;
}
const fingerprint = (item: GradebookAssignment): string =>
	JSON.stringify([
		item.rawGrade,
		item.score,
		item.maxPoints,
		item.factor,
		item.status,
		item.categoryId,
		item.exception,
		item.isFinal
	]);

/** Compare full snapshots of the same account. Persist snapshots only in the host application's chosen store. */
export function diffGradebooks(
	before: GradebookSnapshot,
	after: GradebookSnapshot
): GradebookChange[] {
	if (before.user.id !== after.user.id || before.source !== after.source)
		throw new RangeError('Cannot compare snapshots from different accounts or providers.');
	const flatten = (snapshot: GradebookSnapshot) => {
		const periods = new Map<
			string,
			{ courseId: string; periodId: string; grade: number | string | null }
		>();
		const items = new Map<
			string,
			{ courseId: string; periodId: string; item: GradebookAssignment }
		>();
		for (const course of snapshot.courses)
			for (const period of course.periods) {
				periods.set(JSON.stringify([course.id, period.id]), {
					courseId: course.id,
					periodId: period.id,
					grade: period.officialGrade
				});
				for (const item of period.assignments)
					items.set(JSON.stringify([course.id, period.id, item.type, item.id]), {
						courseId: course.id,
						periodId: period.id,
						item
					});
			}
		return { periods, items };
	};
	const a = flatten(before);
	const b = flatten(after);
	const changes: GradebookChange[] = [];
	for (const [key, entry] of b.items) {
		const previous = a.items.get(key);
		if (!previous || fingerprint(previous.item) !== fingerprint(entry.item))
			changes.push({
				kind: previous ? 'assignment-changed' : 'assignment-added',
				courseId: entry.courseId,
				periodId: entry.periodId,
				assignmentId: entry.item.id,
				assignmentType: entry.item.type
			});
	}
	for (const [key, entry] of a.items)
		if (!b.items.has(key))
			changes.push({
				kind: 'assignment-removed',
				courseId: entry.courseId,
				periodId: entry.periodId,
				assignmentId: entry.item.id,
				assignmentType: entry.item.type
			});
	for (const [key, entry] of b.periods)
		if (a.periods.has(key) && a.periods.get(key)!.grade !== entry.grade)
			changes.push({
				kind: 'official-grade-changed',
				courseId: entry.courseId,
				periodId: entry.periodId
			});
	return changes;
}
