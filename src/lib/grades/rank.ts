export type GpaRankName = 'Rising' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';

export type GpaRank = {
	name: GpaRankName;
	min: number;
	color: string;
};

export const GPA_RANKS: readonly GpaRank[] = [
	{ min: 0, name: 'Rising', color: '#5fc98e' },
	{ min: 2.5, name: 'Bronze', color: '#c08552' },
	{ min: 3, name: 'Silver', color: '#98a6b3' },
	{ min: 3.3, name: 'Gold', color: '#d9a93a' },
	{ min: 3.7, name: 'Platinum', color: '#9fb8cf' },
	{ min: 3.9, name: 'Diamond', color: '#4db6f5' }
] as const;

export type GpaRankProgress = {
	current: GpaRank;
	next?: GpaRank;
	progress: number;
	pointsAway: number;
};

export function getGpaRank(gpa: number | undefined): GpaRankProgress | undefined {
	if (gpa === undefined || !Number.isFinite(gpa)) return undefined;

	const boundedGpa = Math.max(0, gpa);
	const currentIndex = GPA_RANKS.findLastIndex((rank) => boundedGpa >= rank.min);
	const current = GPA_RANKS[Math.max(0, currentIndex)]!;
	const next = GPA_RANKS[currentIndex + 1];

	if (!next) return { current, progress: 1, pointsAway: 0 };

	const span = next.min - current.min;
	return {
		current,
		next,
		progress: Math.min(1, Math.max(0, (boundedGpa - current.min) / span)),
		pointsAway: Math.max(0, next.min - boundedGpa)
	};
}
