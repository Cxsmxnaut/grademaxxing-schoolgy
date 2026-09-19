export type RankAchievementId =
	| 'first-ace'
	| 'perfect-score'
	| 'hat-trick'
	| 'on-a-roll'
	| 'bounce-back'
	| 'clean-sweep'
	| 'no-weak-links'
	| 'a-team'
	| 'straight-as'
	| 'above-and-beyond';

export type RankAchievementAssignment = {
	courseId: string;
	date: number;
	earned: number;
	possible: number;
};

export type RankAchievementCourse = {
	id: string;
	percentage: number;
};

export type RankAchievementInput = {
	courses: RankAchievementCourse[];
	assignments: RankAchievementAssignment[];
};

export type RankAchievement = {
	id: RankAchievementId;
	category: 'Momentum' | 'Consistency' | 'Mastery';
	title: string;
	description: string;
	unlocked: boolean;
	progress: number;
	progressLabel: string;
};

type ScoredAssignment = RankAchievementAssignment & { percentage: number };

function boundedProgress(value: number, target: number) {
	return Math.min(1, Math.max(0, value / target));
}

function displayPercentage(value: number | undefined) {
	return value === undefined ? '—' : `${Number(value.toFixed(1))}%`;
}

function groupByCourse(assignments: ScoredAssignment[]) {
	const grouped = new Map<string, ScoredAssignment[]>();
	for (const assignment of assignments) {
		const courseAssignments = grouped.get(assignment.courseId) ?? [];
		courseAssignments.push(assignment);
		grouped.set(assignment.courseId, courseAssignments);
	}
	return grouped;
}

function maxARangeStreak(assignments: ScoredAssignment[]) {
	let longest = 0;
	for (const courseAssignments of groupByCourse(assignments).values()) {
		let current = 0;
		for (const assignment of courseAssignments.toSorted((a, b) => a.date - b.date)) {
			current = assignment.percentage >= 90 ? current + 1 : 0;
			longest = Math.max(longest, current);
		}
	}
	return longest;
}

function bestBounceBack(assignments: ScoredAssignment[]) {
	let bestImprovement = 0;
	for (const courseAssignments of groupByCourse(assignments).values()) {
		const ordered = courseAssignments.toSorted((a, b) => a.date - b.date);
		for (let index = 1; index < ordered.length; index += 1) {
			const previous = ordered[index - 1]!;
			const current = ordered[index]!;
			if (previous.percentage < 70)
				bestImprovement = Math.max(bestImprovement, current.percentage - previous.percentage);
		}
	}
	return Math.max(0, bestImprovement);
}

export function getRankAchievements({
	courses,
	assignments
}: RankAchievementInput): RankAchievement[] {
	const safeCourses = courses.filter(
		(course) => course.id.length > 0 && Number.isFinite(course.percentage) && course.percentage >= 0
	);
	const scoredAssignments: ScoredAssignment[] = assignments
		.filter(
			(assignment) =>
				assignment.courseId.length > 0 &&
				Number.isFinite(assignment.date) &&
				Number.isFinite(assignment.earned) &&
				assignment.earned >= 0 &&
				Number.isFinite(assignment.possible) &&
				assignment.possible > 0
		)
		.map((assignment) => ({
			...assignment,
			percentage: (assignment.earned / assignment.possible) * 100
		}));
	const aRangeAssignments = scoredAssignments.filter(({ percentage }) => percentage >= 90);
	const perfectEligibleAssignments = scoredAssignments.filter(({ possible }) => possible >= 5);
	const perfectAssignments = perfectEligibleAssignments.filter(
		({ percentage }) => percentage >= 100
	);
	const bestPerfectEligiblePercentage = perfectEligibleAssignments.length
		? Math.max(...perfectEligibleAssignments.map(({ percentage }) => percentage))
		: undefined;
	const bestAssignmentPercentage = scoredAssignments.length
		? Math.max(...scoredAssignments.map(({ percentage }) => percentage))
		: undefined;
	const longestARangeStreak = maxARangeStreak(scoredAssignments);
	const bestImprovement = bestBounceBack(scoredAssignments);
	const latestByCourse = new Map<string, ScoredAssignment>();
	for (const assignment of scoredAssignments.toSorted((a, b) => a.date - b.date))
		latestByCourse.set(assignment.courseId, assignment);
	const latestAtBRange = safeCourses.filter(
		(course) => (latestByCourse.get(course.id)?.percentage ?? -1) >= 80
	).length;
	const bRangeCourses = safeCourses.filter(({ percentage }) => percentage >= 80).length;
	const aRangeCourses = safeCourses.filter(({ percentage }) => percentage >= 90).length;
	const courseTarget = Math.max(4, safeCourses.length);

	return [
		{
			id: 'first-ace',
			category: 'Momentum',
			title: 'First ace',
			description: 'Earn an A-range score on a graded assignment.',
			unlocked: aRangeAssignments.length >= 1,
			progress: boundedProgress(aRangeAssignments.length, 1),
			progressLabel: `${Math.min(aRangeAssignments.length, 1)} / 1 A-range score`
		},
		{
			id: 'perfect-score',
			category: 'Mastery',
			title: 'Perfect score',
			description: 'Earn 100% on an assignment worth at least five points.',
			unlocked: perfectAssignments.length >= 1,
			progress: boundedProgress(bestPerfectEligiblePercentage ?? 0, 100),
			progressLabel: `Best eligible score ${displayPercentage(bestPerfectEligiblePercentage)} · goal 100%`
		},
		{
			id: 'hat-trick',
			category: 'Consistency',
			title: 'Hat trick',
			description: 'Earn three A-range assignment scores in a row in one class.',
			unlocked: longestARangeStreak >= 3,
			progress: boundedProgress(longestARangeStreak, 3),
			progressLabel: `${Math.min(longestARangeStreak, 3)} / 3 consecutive A-range scores`
		},
		{
			id: 'on-a-roll',
			category: 'Consistency',
			title: 'On a roll',
			description: 'Earn five A-range assignment scores in a row in one class.',
			unlocked: longestARangeStreak >= 5,
			progress: boundedProgress(longestARangeStreak, 5),
			progressLabel: `${Math.min(longestARangeStreak, 5)} / 5 consecutive A-range scores`
		},
		{
			id: 'bounce-back',
			category: 'Momentum',
			title: 'Bounce back',
			description: 'After a score below 70%, improve by 20 points on the next assignment.',
			unlocked: bestImprovement >= 20,
			progress: boundedProgress(bestImprovement, 20),
			progressLabel: `Best rebound +${Number(bestImprovement.toFixed(1))} · goal +20 points`
		},
		{
			id: 'clean-sweep',
			category: 'Consistency',
			title: 'Clean sweep',
			description: 'Keep the latest graded assignment at B-range or better in every class.',
			unlocked: safeCourses.length >= 4 && latestAtBRange === safeCourses.length,
			progress: boundedProgress(latestAtBRange, courseTarget),
			progressLabel: `${latestAtBRange} / ${courseTarget} graded classes with a latest score at 80%+`
		},
		{
			id: 'no-weak-links',
			category: 'Mastery',
			title: 'No weak links',
			description: 'Hold B-range or better in every class, with at least four graded classes.',
			unlocked: safeCourses.length >= 4 && bRangeCourses === safeCourses.length,
			progress: boundedProgress(bRangeCourses, courseTarget),
			progressLabel: `${bRangeCourses} / ${courseTarget} classes at B-range or better`
		},
		{
			id: 'a-team',
			category: 'Mastery',
			title: 'A-Team',
			description: 'Hold A-range grades in three classes at the same time.',
			unlocked: aRangeCourses >= 3,
			progress: boundedProgress(aRangeCourses, 3),
			progressLabel: `${Math.min(aRangeCourses, 3)} / 3 A-range classes`
		},
		{
			id: 'straight-as',
			category: 'Mastery',
			title: 'Straight A’s',
			description: 'Hold A-range grades in every class, with at least four graded classes.',
			unlocked: safeCourses.length >= 4 && aRangeCourses === safeCourses.length,
			progress: boundedProgress(aRangeCourses, courseTarget),
			progressLabel: `${aRangeCourses} / ${courseTarget} A-range classes`
		},
		{
			id: 'above-and-beyond',
			category: 'Mastery',
			title: 'Above & beyond',
			description: 'Reach 101% on a graded assignment with extra credit.',
			unlocked: (bestAssignmentPercentage ?? 0) >= 101,
			progress: boundedProgress(bestAssignmentPercentage ?? 0, 101),
			progressLabel: `Best score ${displayPercentage(bestAssignmentPercentage)} · goal 101%`
		}
	];
}
