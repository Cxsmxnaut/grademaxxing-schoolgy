import type { GradebookAssignment } from '../src/index.js';
import { SchoologyClient, calculateGrade, requiredScore, simulateGrade } from '../src/index.js';

// Entirely fictional API responses. No network, credentials, or school account needed.
const fetchDemo = (async (input: URL | RequestInfo) => {
	const url = new URL(String(input));
	let response: unknown;
	if (url.pathname === '/v1/users/me')
		response = { uid: 'fictional', name_display: 'Demo Student' };
	else if (url.pathname.endsWith('/users/fictional/sections'))
		response = { section: [{ id: 'math', course_title: 'Demo Math' }] };
	else if (url.pathname.endsWith('/users/fictional/grades'))
		response = {
			section: [
				{
					section_id: 'math',
					period: [
						{
							period_id: 'p1',
							period_title: 'Semester 1',
							assignment: [
								{
									assignment_id: 'quiz',
									grade: 80,
									max_points: 100,
									category_id: 'tests',
									exception: 0
								},
								{
									assignment_id: 'homework',
									grade: 100,
									max_points: 100,
									category_id: 'homework',
									exception: 0
								}
							]
						}
					],
					final_grade: [{ period_id: 'p1', grade: 86 }]
				}
			]
		};
	else if (url.pathname.endsWith('/assignments'))
		response = {
			assignment: [
				{
					id: 'quiz',
					title: 'Demo quiz',
					grading_period: 1,
					grading_category: 'tests',
					max_points: 100,
					factor: 1
				},
				{
					id: 'homework',
					title: 'Demo homework',
					grading_period: 1,
					grading_category: 'homework',
					max_points: 100,
					factor: 1
				}
			]
		};
	else if (url.pathname.endsWith('/grading_categories'))
		response = {
			grading_category: [
				{ id: 'tests', title: 'Tests', weight: 70, calculation_type: 2, drop_lowest: 0 },
				{ id: 'homework', title: 'Homework', weight: 30, calculation_type: 2, drop_lowest: 0 }
			]
		};
	else if (url.pathname.endsWith('/sections/math'))
		response = {
			id: 'math',
			course_title: 'Demo Math',
			options: { weighted_grading_categories: 1 }
		};
	else throw new Error('Unexpected demo API path');
	return Response.json(response);
}) as typeof fetch;
const client = new SchoologyClient({
	consumer: { key: 'fictional', secret: 'fictional' },
	token: { key: 'fictional', secret: 'fictional' },
	schoolUrl: 'https://fictional.schoology.com',
	fetch: fetchDemo
});
const snapshot = await client.getGradebook();
const course = snapshot.courses[0]!;
const period = course.periods[0]!;
const options = { mode: 'weighted' as const };
const projection = simulateGrade(period, course.categories, options, [
	{ kind: 'change', id: 'quiz', score: 95 }
]);
const upcoming: GradebookAssignment = {
	...period.assignments[0]!,
	id: 'upcoming',
	title: 'Upcoming test',
	score: null,
	rawGrade: null,
	status: 'ungraded'
};
const target = requiredScore(period, course.categories, options, upcoming, 90);
console.log(
	JSON.stringify(
		{
			demo: 'Fictional data; no network requests',
			officialGrade: period.officialGrade,
			calculatedEstimate: calculateGrade(period.assignments, course.categories, options).percentage,
			whatIfQuizBecomes95: projection.projected.percentage,
			target90OnNext100PointTest: target,
			originalQuizScoreAfterSimulation: period.assignments[0]!.score,
			warnings: snapshot.warnings
		},
		null,
		2
	)
);
