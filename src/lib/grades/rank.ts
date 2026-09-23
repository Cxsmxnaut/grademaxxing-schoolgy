export type GpaRankName = 'Rising' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export type GpaRank = {
	name: GpaRankName;
	min: number;
	color: string;
};

export const GPA_RANKS: readonly GpaRank[] = [
	{ min: 0, name: 'Rising', color: '#04dfa7' },
	{ min: 2.5, name: 'Bronze', color: '#c08552' },
	{ min: 3.1, name: 'Silver', color: '#98a6b3' },
	{ min: 3.5, name: 'Gold', color: '#d9a93a' },
	{ min: 3.8, name: 'Platinum', color: '#9fb8cf' },
	{ min: 4, name: 'Diamond', color: '#6ea8dc' }
] as const;

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

	const boundedGpa = Math.max(0, gpa);
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
