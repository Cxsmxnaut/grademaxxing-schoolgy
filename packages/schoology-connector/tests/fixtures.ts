import type { GradebookAssignment, GradebookPeriod, GradingCategory } from '../src/index.js';

export const categories: GradingCategory[] = [
	{ id: 'tests', title: 'Tests', weight: 70, calculation: 'points', dropLowest: 0 },
	{ id: 'homework', title: 'Homework', weight: 30, calculation: 'points', dropLowest: 0 }
];
export function assignment(overrides: Partial<GradebookAssignment> = {}): GradebookAssignment {
	return {
		id: 'quiz-1',
		type: 'assignment',
		title: 'Fictional quiz',
		categoryId: 'tests',
		score: 80,
		rawGrade: 80,
		maxPoints: 100,
		factor: 1,
		status: 'graded',
		exception: 0,
		dueAt: null,
		updatedAt: null,
		isFinal: false,
		...overrides
	};
}
export function period(): GradebookPeriod {
	return {
		id: '1',
		title: 'Fictional semester',
		officialGrade: 86,
		assignments: [
			assignment(),
			assignment({ id: 'homework-1', categoryId: 'homework', score: 100, rawGrade: 100 })
		]
	};
}

export function mockFetch(
	handler: (url: URL, init: RequestInit) => Response | Promise<Response>
): typeof fetch {
	return (async (input: URL | RequestInfo, init: RequestInit = {}) =>
		handler(new URL(String(input)), init)) as typeof fetch;
}
export const json = (value: unknown, init?: ResponseInit): Response => Response.json(value, init);
export const options = {
	consumer: { key: 'test-consumer', secret: 'test-consumer-secret' },
	schoolUrl: 'https://fictional.schoology.com',
	token: { key: 'test-token', secret: 'test-token-secret' }
};
