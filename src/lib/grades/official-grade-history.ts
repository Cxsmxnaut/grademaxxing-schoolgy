import type { Gradebook } from '$lib/contracts/studentvue/gradebook';
import { LocalStorageKey } from '$lib/storage/keys';

export type OfficialGradeSnapshot = { observedAt: number; percentage: number };

type StoredHistory = {
	owner: string;
	courses: Record<string, OfficialGradeSnapshot[]>;
};

const maxCourses = 100;
const maxSnapshotsPerCourse = 60;
const maxStorageLength = 256 * 1024;

function historyKey(courseId: string, reportPeriodIndex: number) {
	return JSON.stringify([courseId, reportPeriodIndex]);
}

function validSnapshot(value: unknown): value is OfficialGradeSnapshot {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<OfficialGradeSnapshot>;
	return (
		typeof candidate.observedAt === 'number' &&
		Number.isFinite(candidate.observedAt) &&
		candidate.observedAt > 0 &&
		typeof candidate.percentage === 'number' &&
		Number.isFinite(candidate.percentage)
	);
}

function readHistory(owner: string): StoredHistory {
	try {
		const raw = localStorage.getItem(LocalStorageKey.officialGradeHistory);
		if (!raw || raw.length > maxStorageLength) return { owner, courses: {} };
		const parsed = JSON.parse(raw) as Partial<StoredHistory>;
		if (parsed.owner !== owner || !parsed.courses || typeof parsed.courses !== 'object')
			return { owner, courses: {} };
		const courses = Object.fromEntries(
			Object.entries(parsed.courses)
				.filter(([key, snapshots]) => key.length <= 1024 && Array.isArray(snapshots))
				.slice(-maxCourses)
				.map(([key, snapshots]) => [
					key,
					snapshots.filter(validSnapshot).slice(-maxSnapshotsPerCourse)
				])
		);
		return { owner, courses };
	} catch {
		return { owner, courses: {} };
	}
}

export function getOfficialGradeHistory(courseId: string, reportPeriodIndex: number) {
	if (typeof localStorage === 'undefined' || !courseId || !Number.isInteger(reportPeriodIndex))
		return [];
	try {
		const owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
		return owner ? (readHistory(owner).courses[historyKey(courseId, reportPeriodIndex)] ?? []) : [];
	} catch {
		return [];
	}
}

/** Record only a fresh, accepted gradebook response. No assignment math supplies these values. */
export function recordOfficialGradebookSnapshot(gradebook: Gradebook, observedAt: number) {
	if (typeof localStorage === 'undefined' || !Number.isFinite(observedAt) || observedAt <= 0)
		return;
	try {
		const owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
		const reportPeriodIndex = Number(gradebook.ReportingPeriod._Index);
		if (!owner || !Number.isInteger(reportPeriodIndex) || reportPeriodIndex < 0) return;
		const history = readHistory(owner);
		let changed = false;
		for (const course of gradebook.Courses.Course) {
			if (!course._CourseID) continue;
			const rawPercentage = course.Marks?.Mark[0]?._CalculatedScoreRaw?.trim();
			if (!rawPercentage) continue;
			const percentage = Number(rawPercentage);
			if (!Number.isFinite(percentage)) continue;
			const key = historyKey(course._CourseID, reportPeriodIndex);
			const prior = history.courses[key] ?? [];
			const latest = prior.at(-1);
			if (latest?.percentage === percentage) continue;
			history.courses[key] = [
				...prior,
				{ observedAt: Math.max(observedAt, (latest?.observedAt ?? 0) + 1), percentage }
			].slice(-maxSnapshotsPerCourse);
			changed = true;
		}
		if (!changed) return;
		history.courses = Object.fromEntries(Object.entries(history.courses).slice(-maxCourses));
		localStorage.setItem(LocalStorageKey.officialGradeHistory, JSON.stringify(history));
	} catch {
		// The current official mark remains available when browser storage is disabled.
	}
}

/** Include the current upstream mark when storage is empty or unavailable. */
export function withCurrentOfficialGrade(
	history: readonly OfficialGradeSnapshot[],
	current: OfficialGradeSnapshot | undefined
) {
	if (!current || !validSnapshot(current)) return [...history];
	const latest = history.at(-1);
	if (
		latest &&
		(latest.percentage === current.percentage || latest.observedAt > current.observedAt)
	)
		return [...history];
	return [...history, current];
}
