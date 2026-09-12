import type { Course } from '$lib/contracts/studentvue/gradebook';
import { getCourseGrade } from './course';
import { GPA_POLICY, type GpaPolicy } from './gpa-policy';

export type GpaEnrollment = {
	courseName: string;
	letter: string;
	credits: number;
	gradeLevel: number;
	excludeFromGpa: boolean;
	academic: boolean;
};

export type GpaPipelines = {
	unweighted: number;
	weighted: number;
	academicWeighted: number;
	attemptedCredits: number;
	academicCredits: number;
};

export type GpaCourse = {
	course: Course;
	letter: string;
	unweightedPoints: number;
	weightedPoints: number;
	weighted: boolean;
	weightBonus: number;
	credits: number;
	academic: boolean;
};

export function letterGradePoints(letter: string, policy: GpaPolicy = GPA_POLICY) {
	return policy.gradePoints[letter.trim().toUpperCase()];
}

export function getCourseWeightBonus(name: string, policy: GpaPolicy = GPA_POLICY) {
	return policy.weightRules.find((rule) => rule.pattern.test(name))?.bonusPoints ?? 0;
}

export function isWeightedCourseName(name: string, policy: GpaPolicy = GPA_POLICY) {
	return getCourseWeightBonus(name, policy) > 0;
}

export function isAcademicCourse(courseName: string, policy: GpaPolicy = GPA_POLICY) {
	return !policy.academicCourseExclusions.some((pattern) => pattern.test(courseName));
}

export function getGpaCourses(courses: Course[], policy: GpaPolicy = GPA_POLICY): GpaCourse[] {
	return courses.flatMap((course) => {
		const grade = getCourseGrade(course);
		if (!grade) return [];
		const unweightedPoints = letterGradePoints(grade.letter, policy);
		if (unweightedPoints === undefined) return [];
		const configuredBonus = getCourseWeightBonus(course._CourseName, policy);
		const weightBonus =
			unweightedPoints >= policy.minimumGradePointsForWeight ? configuredBonus : 0;
		const weighted = weightBonus > 0;
		return [
			{
				course,
				letter: grade.letter,
				unweightedPoints,
				weightedPoints: unweightedPoints + weightBonus,
				weighted,
				weightBonus,
				credits: policy.defaultCredits,
				academic: isAcademicCourse(course._CourseName, policy)
			}
		];
	});
}

export function calculateGpa(points: number[]) {
	if (!points.length) return undefined;
	return points.reduce((sum, value) => sum + value, 0) / points.length;
}

export function calculateCreditWeightedGpa(entries: { points: number; credits: number }[]) {
	const included = entries.filter(
		({ points, credits }) => Number.isFinite(points) && Number.isFinite(credits) && credits > 0
	);
	if (!included.length) return undefined;
	// Work in thousandths so recurring binary values never decide a displayed GPA.
	const scale = 1000;
	const credits = included.reduce((total, entry) => total + Math.round(entry.credits * scale), 0);
	const qualityPoints = included.reduce(
		(total, entry) => total + Math.round(entry.points * scale) * Math.round(entry.credits * scale),
		0
	);
	return Math.round(qualityPoints / credits) / scale;
}

/**
 * Calculate the three PUSD-style transcript pipelines from an enrollment ledger.
 * Callers with real transcript data must supply gradeLevel, credits, academic, and
 * excludeFromGpa from their district-approved source; the live gradebook cannot infer them.
 */
export function calculateGpaPipelines(
	enrollments: GpaEnrollment[],
	policy: GpaPolicy = GPA_POLICY
): GpaPipelines {
	const eligible = enrollments.flatMap((enrollment) => {
		const points = letterGradePoints(enrollment.letter, policy);
		if (
			points === undefined ||
			enrollment.gradeLevel < policy.minimumGradeLevel ||
			enrollment.excludeFromGpa ||
			!Number.isFinite(enrollment.credits) ||
			enrollment.credits <= 0
		)
			return [];
		const bonus =
			points >= policy.minimumGradePointsForWeight
				? getCourseWeightBonus(enrollment.courseName, policy)
				: 0;
		return [{ enrollment, points, weightedPoints: points + bonus }];
	});
	const totalEntries = eligible.map(({ enrollment, points, weightedPoints }) => ({
		credits: enrollment.credits,
		points,
		weightedPoints
	}));
	const academicEntries = totalEntries.filter((_, index) => eligible[index]!.enrollment.academic);
	const attemptedCredits = totalEntries.reduce((total, entry) => total + entry.credits, 0);
	const academicCredits = academicEntries.reduce((total, entry) => total + entry.credits, 0);
	return {
		unweighted: calculateCreditWeightedGpa(totalEntries) ?? 0,
		weighted:
			calculateCreditWeightedGpa(
				totalEntries.map(({ credits, weightedPoints }) => ({ credits, points: weightedPoints }))
			) ?? 0,
		academicWeighted:
			calculateCreditWeightedGpa(
				academicEntries.map(({ credits, weightedPoints }) => ({ credits, points: weightedPoints }))
			) ?? 0,
		attemptedCredits,
		academicCredits
	};
}

/**
 * Round for display without the binary floating-point `3.675 -> 3.67` artifact.
 * GPA values remain numeric internally; this only formats the value presented to a student.
 */
export function formatGpa(gpa: number | undefined, fractionDigits = 2) {
	if (gpa === undefined || !Number.isFinite(gpa)) return '—';
	const factor = 10 ** fractionDigits;
	return (Math.round((gpa + Number.EPSILON) * factor) / factor).toFixed(fractionDigits);
}

export function calculateCourseGpas(
	courses: Course[],
	currentGradeLevel = GPA_POLICY.minimumGradeLevel,
	policy: GpaPolicy = GPA_POLICY
) {
	const graded = getGpaCourses(courses, policy);
	const academic = graded.filter((course) => course.academic);
	const pipelines = calculateGpaPipelines(
		graded.map((course) => ({
			courseName: course.course._CourseName,
			letter: course.letter,
			credits: course.credits,
			// The profile integration can supply the actual current grade level when available.
			gradeLevel: currentGradeLevel,
			excludeFromGpa: false,
			academic: course.academic
		})),
		policy
	);
	return {
		graded,
		academic,
		unweighted: pipelines.attemptedCredits ? pipelines.unweighted : undefined,
		weighted: pipelines.attemptedCredits ? pipelines.weighted : undefined,
		academicUnweighted: calculateCreditWeightedGpa(
			academic.map((item) => ({ points: item.unweightedPoints, credits: item.credits }))
		),
		academicWeighted: pipelines.academicCredits ? pipelines.academicWeighted : undefined
	};
}
