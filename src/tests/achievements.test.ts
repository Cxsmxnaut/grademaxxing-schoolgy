import { getRankAchievements, type RankAchievementAssignment } from '$lib/grades/achievements';
import { describe, expect, test } from 'vitest';

const assignment = (
	courseId: string,
	date: number,
	percentage: number
): RankAchievementAssignment => ({
	courseId,
	date,
	earned: percentage,
	possible: 100
});

const courses = (...percentages: number[]) =>
	percentages.map((percentage, index) => ({ id: `course-${index + 1}`, percentage }));

describe('rank achievements', () => {
	test('returns ten distinct, meaningful achievements', () => {
		const achievements = getRankAchievements({ courses: [], assignments: [] });
		expect(achievements).toHaveLength(10);
		expect(new Set(achievements.map(({ id }) => id))).toHaveLength(10);
	});

	test('recognizes assignment momentum, consistency, and balanced course performance', () => {
		const achievements = getRankAchievements({
			courses: [
				{ id: 'math', percentage: 94 },
				{ id: 'english', percentage: 92 },
				{ id: 'science', percentage: 85 },
				{ id: 'history', percentage: 81 }
			],
			assignments: [
				assignment('math', 1, 60),
				assignment('math', 2, 85),
				assignment('math', 3, 90),
				assignment('math', 4, 95),
				assignment('math', 5, 100),
				assignment('math', 6, 91),
				assignment('math', 7, 105),
				assignment('english', 8, 88),
				assignment('science', 9, 82),
				assignment('history', 10, 80)
			]
		});
		const unlocked = achievements.filter(({ unlocked }) => unlocked).map(({ id }) => id);

		expect(unlocked).toEqual([
			'first-ace',
			'perfect-score',
			'hat-trick',
			'on-a-roll',
			'bounce-back',
			'clean-sweep',
			'no-weak-links',
			'above-and-beyond'
		]);
		expect(
			achievements.filter(({ unlocked }) => unlocked).every(({ progress }) => progress === 1)
		).toBe(true);
	});

	test('requires breadth for course-level achievements', () => {
		const achievements = getRankAchievements({
			courses: courses(96, 94, 91, 90),
			assignments: []
		});

		expect(achievements.find(({ id }) => id === 'a-team')?.unlocked).toBe(true);
		expect(achievements.find(({ id }) => id === 'straight-as')?.unlocked).toBe(true);
		expect(achievements.find(({ id }) => id === 'no-weak-links')?.unlocked).toBe(true);
	});

	test('ignores invalid assignment scores and keeps progress finite', () => {
		const achievements = getRankAchievements({
			courses: [{ id: 'math', percentage: Number.NaN }],
			assignments: [
				{ courseId: 'math', date: 1, earned: Number.NaN, possible: 10 },
				{ courseId: 'science', date: 2, earned: 10, possible: 0 }
			]
		});

		expect(achievements.every(({ unlocked }) => !unlocked)).toBe(true);
		expect(achievements.every(({ progress }) => Number.isFinite(progress))).toBe(true);
	});

	test('keeps Perfect score progress aligned with its five-point eligibility rule', () => {
		const perfectScore = getRankAchievements({
			courses: courses(95),
			assignments: [{ courseId: 'course-1', date: 1, earned: 1, possible: 1 }]
		}).find(({ id }) => id === 'perfect-score');

		expect(perfectScore).toMatchObject({ unlocked: false, progress: 0 });
		expect(perfectScore?.progressLabel).toContain('—');
	});

	test('counts every graded class toward Clean sweep, including classes without assignments', () => {
		const cleanSweep = getRankAchievements({
			courses: courses(90, 90, 90, 90),
			assignments: [
				assignment('course-1', 1, 90),
				assignment('course-2', 2, 90),
				assignment('course-3', 3, 90)
			]
		}).find(({ id }) => id === 'clean-sweep');

		expect(cleanSweep).toMatchObject({ unlocked: false, progress: 0.75 });
		expect(cleanSweep?.progressLabel).toBe('3 / 4 graded classes with a latest score at 80%+');
	});
});
