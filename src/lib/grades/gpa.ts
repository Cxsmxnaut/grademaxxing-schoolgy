import type { Course } from '$lib/types/Gradebook';
import { getCourseGrade } from './course';

export type GpaCourse = {
	course: Course;
	letter: string;
	unweightedPoints: number;
	weightedPoints: number;
	weighted: boolean;
};

const gradePoints: Record<string, number> = {
	'A+': 4,
	A: 4,
	'A-': 3.7,
	'B+': 3.3,
	B: 3,
	'B-': 2.7,
	'C+': 2.3,
	C: 2,
	'C-': 1.7,
	'D+': 1.3,
	D: 1,
	'D-': 0.7,
	F: 0
};

export function letterGradePoints(letter: string) {
	return gradePoints[letter.trim().toUpperCase()];
}

export function isWeightedCourseName(name: string) {
	return /(?:^|\s)(?:AP|IB)(?:\s|$)|honou?rs?/i.test(name);
}

export function getGpaCourses(courses: Course[]): GpaCourse[] {
	return courses.flatMap((course) => {
		const grade = getCourseGrade(course);
		if (!grade) return [];
		const unweightedPoints = letterGradePoints(grade.letter);
		if (unweightedPoints === undefined) return [];
		const weighted = isWeightedCourseName(course._CourseName);
		return [
			{
				course,
				letter: grade.letter,
				unweightedPoints,
				weightedPoints: unweightedPoints + (weighted ? 1 : 0),
				weighted
			}
		];
	});
}

export function calculateGpa(points: number[]) {
	if (!points.length) return undefined;
	return points.reduce((sum, value) => sum + value, 0) / points.length;
}

export function calculateCourseGpas(courses: Course[]) {
	const graded = getGpaCourses(courses);
	return {
		graded,
		unweighted: calculateGpa(graded.map((item) => item.unweightedPoints)),
		weighted: calculateGpa(graded.map((item) => item.weightedPoints))
	};
}
