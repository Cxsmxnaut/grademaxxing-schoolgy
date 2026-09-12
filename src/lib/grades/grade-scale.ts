import { LocalStorageKey } from '$lib';

export type GradeScaleObservation = {
	percentage: number;
	letter: string;
	observedAt?: number;
};

export type HypotheticalLetterEstimate = {
	letter: string;
	basis: 'observed' | 'observed-range' | 'class-pattern';
};

type StoredGradeScaleObservations = {
	owner: string;
	courses: Record<string, GradeScaleObservation[]>;
};

const maxCourses = 100;
const maxObservationsPerCourse = 40;

const simpleScale = [
	[90, 'A'],
	[80, 'B'],
	[70, 'C'],
	[60, 'D'],
	[-Infinity, 'F']
] as const;

const plusMinusScale = [
	[97, 'A+'],
	[93, 'A'],
	[90, 'A-'],
	[87, 'B+'],
	[83, 'B'],
	[80, 'B-'],
	[77, 'C+'],
	[73, 'C'],
	[70, 'C-'],
	[67, 'D+'],
	[63, 'D'],
	[60, 'D-'],
	[-Infinity, 'F']
] as const;

function normalizedLetter(letter: string) {
	return letter.trim().toUpperCase();
}

function isUsableObservation(value: unknown): value is GradeScaleObservation {
	if (!value || typeof value !== 'object') return false;
	const { percentage, letter, observedAt } = value as Partial<GradeScaleObservation>;
	return (
		typeof percentage === 'number' &&
		Number.isFinite(percentage) &&
		percentage >= -50 &&
		percentage <= 200 &&
		typeof letter === 'string' &&
		/^[A-DF][+-]?$/.test(normalizedLetter(letter)) &&
		typeof observedAt === 'number' &&
		Number.isFinite(observedAt) &&
		observedAt >= 0
	);
}

function getStoredObservations(): StoredGradeScaleObservations | undefined {
	try {
		const owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
		const raw = localStorage.getItem(LocalStorageKey.gradeScaleObservations);
		if (!owner || !raw || raw.length > 256 * 1024) return undefined;
		const stored = JSON.parse(raw) as Partial<StoredGradeScaleObservations>;
		if (stored.owner !== owner || !stored.courses || typeof stored.courses !== 'object') return undefined;
		const courses = Object.fromEntries(
			Object.entries(stored.courses)
				.filter(([courseID, observations]) => courseID.length <= 512 && Array.isArray(observations))
				.slice(0, maxCourses)
				.map(([courseID, observations]) => [
					courseID,
					observations.filter(isUsableObservation).slice(-maxObservationsPerCourse)
				])
		);
		return { owner, courses };
	} catch {
		return undefined;
	}
}

/** Read only this browser's current student's observations for one course. */
export function getCourseGradeScaleObservations(courseID: string): GradeScaleObservation[] {
	if (!courseID || courseID.length > 512) return [];
	return getStoredObservations()?.courses[courseID] ?? [];
}

/**
 * Store the official percentage-to-letter pair StudentVUE showed for a course.
 * This is a bounded, per-browser cache; it is never sent to our server.
 */
export function recordCourseGradeScaleObservation(
	courseID: string,
	percentage: number | undefined,
	letter: string | undefined
) {
	if (!courseID || courseID.length > 512 || percentage === undefined || !letter) return;
	const observation: GradeScaleObservation = { percentage, letter: normalizedLetter(letter), observedAt: Date.now() };
	if (!isUsableObservation(observation)) return;
	try {
		const owner = localStorage.getItem(LocalStorageKey.gradebookOwner);
		if (!owner) return;
		const stored = getStoredObservations() ?? { owner, courses: {} };
		if (stored.owner !== owner) return;
		const existing = stored.courses[courseID] ?? [];
		const withoutDuplicate = existing.filter(
			(item) => Math.abs(item.percentage - observation.percentage) >= 0.005 || item.letter !== observation.letter
		);
		stored.courses[courseID] = [...withoutDuplicate, observation].slice(-maxObservationsPerCourse);
		const courses = Object.fromEntries(Object.entries(stored.courses).slice(-maxCourses));
		localStorage.setItem(LocalStorageKey.gradeScaleObservations, JSON.stringify({ owner, courses }));
	} catch {
		// Learning is optional; disabled/full local storage must not affect grades.
	}
}

function fromTemplate(percentage: number, observations: GradeScaleObservation[]) {
	const hasPlusMinus = observations.some(({ letter }) => /[+-]/.test(normalizedLetter(letter)));
	const scale = hasPlusMinus ? plusMinusScale : simpleScale;
	return scale.find(([minimum]) => percentage >= minimum)![1];
}

/**
 * Use the teacher's own historical StudentVUE marks first. If the exact value
 * has not appeared before, infer the class's style: whole letters unless this
 * class has actually used plus/minus marks. This is intentionally an estimate,
 * never a replacement for the official StudentVUE mark.
 */
export function estimateHypotheticalLetter(
	percentage: number,
	observations: GradeScaleObservation[]
): HypotheticalLetterEstimate | undefined {
	if (!Number.isFinite(percentage)) return undefined;
	const usable = observations.filter(
		({ percentage: observedPercentage, letter }) =>
			Number.isFinite(observedPercentage) && /^[A-DF][+-]?$/.test(normalizedLetter(letter))
	);
	const exact = usable.find(({ percentage: observedPercentage }) =>
		Math.abs(observedPercentage - percentage) < 0.005
	);
	if (exact) return { letter: normalizedLetter(exact.letter), basis: 'observed' };

	const lower = usable
		.filter(({ percentage: observedPercentage }) => observedPercentage <= percentage)
		.toSorted((a, b) => b.percentage - a.percentage)[0];
	const upper = usable
		.filter(({ percentage: observedPercentage }) => observedPercentage >= percentage)
		.toSorted((a, b) => a.percentage - b.percentage)[0];
	if (lower && upper && normalizedLetter(lower.letter) === normalizedLetter(upper.letter))
		return { letter: normalizedLetter(lower.letter), basis: 'observed-range' };

	return { letter: fromTemplate(percentage, usable), basis: 'class-pattern' };
}
