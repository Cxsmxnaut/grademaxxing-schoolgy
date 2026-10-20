import { SchoologyClient } from '../../../packages/schoology-connector/dist/index.js';

const fictionalFetch = (async (input: URL | RequestInfo) => {
	const url = new URL(String(input));
	let body: unknown;
	if (url.pathname === '/v1/users/me') body = { uid: 'demo-user', name_display: 'Alex Morgan' };
	else if (url.pathname.endsWith('/users/demo-user/sections'))
		body = {
			section: [
				{ id: 'algebra', course_title: 'Algebra II', section_title: 'Period 2' },
				{ id: 'biology', course_title: 'Biology', section_title: 'Period 4' },
				{ id: 'history', course_title: 'World History', section_title: 'Period 6' }
			]
		};
	else if (url.pathname.endsWith('/users/demo-user/grades'))
		body = {
			section: [
				{
					section_id: 'algebra',
					period: [
						{
							period_id: 'current',
							period_title: 'Current Term',
							assignment: [
								{
									assignment_id: 'alg-1',
									grade: 18,
									max_points: 20,
									category_id: 'tests',
									exception: 0
								},
								{
									assignment_id: 'alg-2',
									grade: 42,
									max_points: 50,
									category_id: 'tests',
									exception: 0
								},
								{
									assignment_id: 'alg-3',
									grade: 20,
									max_points: 20,
									category_id: 'homework',
									exception: 0
								}
							]
						}
					],
					final_grade: [{ period_id: 'current', grade: '88.4%' }]
				},
				{
					section_id: 'biology',
					period: [
						{
							period_id: 'current',
							period_title: 'Current Term',
							assignment: [
								{
									assignment_id: 'bio-1',
									grade: 24,
									max_points: 25,
									category_id: 'labs',
									exception: 0
								},
								{
									assignment_id: 'bio-2',
									grade: 80,
									max_points: 100,
									category_id: 'tests',
									exception: 0
								}
							]
						}
					],
					final_grade: [{ period_id: 'current', grade: '83%' }]
				},
				{
					section_id: 'history',
					period: [
						{
							period_id: 'current',
							period_title: 'Current Term',
							assignment: [
								{
									assignment_id: 'hist-1',
									grade: 45,
									max_points: 50,
									category_id: 'projects',
									exception: 0
								},
								{
									assignment_id: 'hist-2',
									grade: 36,
									max_points: 40,
									category_id: 'tests',
									exception: 0
								}
							]
						}
					],
					final_grade: [{ period_id: 'current', grade: '90%' }]
				}
			]
		};
	else if (url.pathname.endsWith('/assignments')) {
		const id = url.pathname.split('/')[3];
		const rows: Record<string, unknown[]> = {
			algebra: [
				{
					id: 'alg-1',
					title: 'Linear equations quiz',
					grading_period: 1,
					grading_category: 'tests',
					max_points: 20,
					factor: 1
				},
				{
					id: 'alg-2',
					title: 'Systems of equations test',
					grading_period: 1,
					grading_category: 'tests',
					max_points: 50,
					factor: 1
				},
				{
					id: 'alg-3',
					title: 'Practice set 4',
					grading_period: 1,
					grading_category: 'homework',
					max_points: 20,
					factor: 1
				}
			],
			biology: [
				{
					id: 'bio-1',
					title: 'Cell lab',
					grading_period: 1,
					grading_category: 'labs',
					max_points: 25,
					factor: 1
				},
				{
					id: 'bio-2',
					title: 'Genetics test',
					grading_period: 1,
					grading_category: 'tests',
					max_points: 100,
					factor: 1
				}
			],
			history: [
				{
					id: 'hist-1',
					title: 'Primary-source project',
					grading_period: 1,
					grading_category: 'projects',
					max_points: 50,
					factor: 1
				},
				{
					id: 'hist-2',
					title: 'Unit 3 exam',
					grading_period: 1,
					grading_category: 'tests',
					max_points: 40,
					factor: 1
				}
			]
		};
		body = { assignment: rows[id ?? ''] ?? [] };
	} else if (url.pathname.endsWith('/grading_categories')) {
		const id = url.pathname.split('/')[3];
		const rows: Record<string, unknown[]> = {
			algebra: [
				{ id: 'tests', title: 'Tests', weight: 70, calculation_type: 2, drop_lowest: 0 },
				{ id: 'homework', title: 'Homework', weight: 30, calculation_type: 2, drop_lowest: 0 }
			],
			biology: [
				{ id: 'labs', title: 'Labs', weight: 40, calculation_type: 2, drop_lowest: 0 },
				{ id: 'tests', title: 'Tests', weight: 60, calculation_type: 2, drop_lowest: 0 }
			],
			history: [
				{ id: 'projects', title: 'Projects', weight: 50, calculation_type: 2, drop_lowest: 0 },
				{ id: 'tests', title: 'Tests', weight: 50, calculation_type: 2, drop_lowest: 0 }
			]
		};
		body = { grading_category: rows[id ?? ''] ?? [] };
	} else if (url.pathname.includes('/sections/')) {
		const id = url.pathname.split('/')[3];
		body = {
			id,
			course_title:
				(
					{ algebra: 'Algebra II', biology: 'Biology', history: 'World History' } as Record<
						string,
						string
					>
				)[id ?? ''] ?? 'Demo Course',
			options: { weighted_grading_categories: 1 }
		};
	} else throw new Error('Unexpected fictional Schoology API path');
	return Response.json(body);
}) as typeof fetch;

export function createSchoologyDemoGradebook() {
	return new SchoologyClient({
		consumer: { key: 'fictional-demo-key', secret: 'fictional-demo-secret' },
		token: { key: 'fictional-demo-token', secret: 'fictional-demo-token-secret' },
		schoolUrl: 'https://fictional.schoology.com',
		fetch: fictionalFetch
	}).getGradebook();
}
