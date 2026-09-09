import { isAcademicCourse, letterGradePoints, type GpaEnrollment } from './gpa';
import { GPA_POLICY } from './gpa-policy';

export type TranscriptImport = {
	source: 'studentvue-report-card';
	enrollments: GpaEnrollment[];
	/** A safe status message. It deliberately contains no raw portal fields or values. */
	message: string;
};

type UnknownRecord = Record<string, unknown>;

const courseNameKeys = ['courseTitle', 'courseName', 'className', 'title', 'course'];
const letterKeys = ['letterGrade', 'letter', 'mark', 'finalMark', 'gradeMark', 'grade'];
const creditKeys = ['creditsAttempted', 'attemptedCredits', 'credits', 'credit'];
const gradeLevelKeys = ['gradeLevel', 'studentGradeLevel', 'schoolGradeLevel', 'grade'];

/**
 * Convert StudentVUE's district-configured report-card object into the deliberately
 * small ledger consumed by the GPA engine. The portal does not publish a stable
 * cross-district schema, so records are accepted only when all GPA-critical fields
 * (course, final mark, credits, and grade level) are explicit. No default credits
 * are invented for transcript history.
 */
export function parseStudentVueTranscript(payload: unknown): TranscriptImport {
	const enrollments: GpaEnrollment[] = [];
	const seen = new Set<string>();
	visit(payload, undefined, enrollments, seen);
	return {
		source: 'studentvue-report-card',
		enrollments,
		message: enrollments.length
			? `${enrollments.length} completed course${enrollments.length === 1 ? '' : 's'} available from StudentVUE report cards.`
			: 'StudentVUE did not expose a complete transcript ledger for GPA calculation.'
	};
}

function visit(
	value: unknown,
	inheritedGradeLevel: number | undefined,
	enrollments: GpaEnrollment[],
	seen: Set<string>
) {
	if (Array.isArray(value)) {
		for (const entry of value) visit(entry, inheritedGradeLevel, enrollments, seen);
		return;
	}
	if (!isRecord(value)) return;

	const gradeLevel = numberAt(value, gradeLevelKeys) ?? inheritedGradeLevel;
	const courseName = stringAt(value, courseNameKeys);
	const letter = stringAt(value, letterKeys)?.toUpperCase();
	const credits = numberAt(value, creditKeys);
	if (
		courseName &&
		letter &&
		letterGradePoints(letter, GPA_POLICY) !== undefined &&
		credits !== undefined &&
		gradeLevel !== undefined
	) {
		const key = `${courseName}|${letter}|${credits}|${gradeLevel}`;
		if (!seen.has(key)) {
			seen.add(key);
			enrollments.push({
				courseName,
				letter,
				credits,
				gradeLevel,
				excludeFromGpa: false,
				academic: isAcademicCourse(courseName, GPA_POLICY)
			});
		}
	}

	for (const child of Object.values(value)) visit(child, gradeLevel, enrollments, seen);
}

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === 'object' && value !== null;
}

function stringAt(record: UnknownRecord, keys: string[]) {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return undefined;
}

function numberAt(record: UnknownRecord, keys: string[]) {
	for (const key of keys) {
		const value = record[key];
		const number = typeof value === 'number' ? value : Number(value);
		if (Number.isFinite(number) && number >= 0) return number;
	}
	return undefined;
}
