export type GpaRank = {
	name: string;
	min: number;
	max: number;
	color: string;
};

export const GPA_RANKS: readonly GpaRank[] = [
	{ min: 0, max: 0.49, name: 'Bronze I', color: '#c08552' },
	{ min: 0.5, max: 0.99, name: 'Bronze II', color: '#c08552' },
	{ min: 1, max: 1.49, name: 'Bronze III', color: '#c08552' },
	{ min: 1.5, max: 1.74, name: 'Silver I', color: '#98a6b3' },
	{ min: 1.75, max: 1.99, name: 'Silver II', color: '#98a6b3' },
	{ min: 2, max: 2.19, name: 'Silver III', color: '#98a6b3' },
	{ min: 2.2, max: 2.39, name: 'Gold I', color: '#d9a93a' },
	{ min: 2.4, max: 2.59, name: 'Gold II', color: '#d9a93a' },
	{ min: 2.6, max: 2.79, name: 'Gold III', color: '#d9a93a' },
	{ min: 2.8, max: 2.99, name: 'Platinum I', color: '#9fb8cf' },
	{ min: 3, max: 3.19, name: 'Platinum II', color: '#9fb8cf' },
	{ min: 3.2, max: 3.39, name: 'Platinum III', color: '#9fb8cf' },
	{ min: 3.4, max: 3.54, name: 'Diamond I', color: '#6ea8dc' },
	{ min: 3.55, max: 3.69, name: 'Diamond II', color: '#6ea8dc' },
	{ min: 3.7, max: 3.84, name: 'Diamond III', color: '#6ea8dc' },
	{ min: 3.85, max: 3.99, name: 'Elite', color: '#c2a7e8' },
	{ min: 4, max: 4, name: 'Champion', color: '#04dfa7' },
	{ min: 4.01, max: 5, name: 'Unreal', color: '#65cbd2' }
] as const;

export type GpaRankName = (typeof GPA_RANKS)[number]['name'];

export const GPA_RANK_MIN_GRADED_COURSES = 4;

export type GpaRankProgress = {
	current: GpaRank;
	next?: GpaRank;
	progress: number;
	pointsAway: number;
	provisional: boolean;
	gradedCourses: number;
	coursesNeeded: number;
};

export function getGpaRank(
	gpa: number | undefined,
	gradedCourses: number
): GpaRankProgress | undefined {
	if (gpa === undefined || !Number.isFinite(gpa)) return undefined;

	// Rank thresholds are defined at the same two-decimal precision shown to students.
	// Normalizing avoids an unrepresentable floating-point value sitting between 4.00 and 4.01.
	const boundedGpa = Math.min(
		GPA_RANKS[GPA_RANKS.length - 1]!.max,
		Math.max(0, Math.round((gpa + Number.EPSILON) * 100) / 100)
	);
	const safeGradedCourses = Math.max(0, Math.floor(gradedCourses));
	const coursesNeeded = Math.max(0, GPA_RANK_MIN_GRADED_COURSES - safeGradedCourses);
	const confidence = {
		provisional: coursesNeeded > 0,
		gradedCourses: safeGradedCourses,
		coursesNeeded
	};
	const currentIndex = GPA_RANKS.findLastIndex((rank) => boundedGpa >= rank.min);
	const current = GPA_RANKS[Math.max(0, currentIndex)]!;
	const next = GPA_RANKS[currentIndex + 1];

	if (!next) return { current, progress: 1, pointsAway: 0, ...confidence };

	const span = next.min - current.min;
	return {
		current,
		next,
		progress: Math.min(1, Math.max(0, (boundedGpa - current.min) / span)),
		pointsAway: Math.max(0, next.min - boundedGpa),
		...confidence
	};
}
