const fingerprint = (item) => JSON.stringify([
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
export function diffGradebooks(before, after) {
    if (before.user.id !== after.user.id || before.source !== after.source)
        throw new RangeError('Cannot compare snapshots from different accounts or providers.');
    const flatten = (snapshot) => {
        const periods = new Map();
        const items = new Map();
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
    const changes = [];
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
        if (a.periods.has(key) && a.periods.get(key).grade !== entry.grade)
            changes.push({
                kind: 'official-grade-changed',
                courseId: entry.courseId,
                periodId: entry.periodId
            });
    return changes;
}
//# sourceMappingURL=changes.js.map