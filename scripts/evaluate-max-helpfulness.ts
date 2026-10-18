import { createPoolFromEnv } from '../src/lib/server/max/config';
import { askMaxDetailed } from '../src/lib/server/max/max';
import { createMaxResourceAccess } from '../src/lib/server/max/resources';
import { TokenMesh } from '../src/lib/server/max/tokenMesh';
import type { StudentSession } from '../src/lib/server/student-session';
if (process.env.MAX_LIVE_EVAL !== 'true') {
	throw new Error(
		'This calls live AI providers using synthetic records. Run with MAX_LIVE_EVAL=true to opt in.'
	);
}
try {
	process.loadEnvFile('.env');
} catch (error) {
	if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
// Invented records only; never connect this evaluation to a real student account.
const categories = [
	{ name: 'Reading', weightPercentage: 30, pointsEarned: 18, pointsPossible: 30, gradeLetter: 'D' },
	{
		name: 'Writing',
		weightPercentage: 50,
		pointsEarned: 45,
		pointsPossible: 50,
		gradeLetter: 'A-'
	},
	{ name: 'Habits', weightPercentage: 20, pointsEarned: 20, pointsPossible: 20, gradeLetter: 'A' }
];
const assignments = [
	{
		AssignmentID: 'river',
		Measure: 'River Passage Check',
		category: 'Reading',
		Point: '4',
		PointPossible: '10',
		graded: true,
		DueDate: '2026-10-10',
		Notes:
			'Answers 2 and 4 need two quotes and an explanation of how each quote supports the narrator claim. Revision and retake eligibility are not stated.'
	},
	{
		AssignmentID: 'theme',
		Measure: 'Theme Paragraph',
		category: 'Reading',
		Point: '14',
		PointPossible: '20',
		graded: true,
		DueDate: '2026-10-12',
		Notes: 'The claim is clear, but explain how the evidence supports it.'
	},
	{
		AssignmentID: 'essay',
		Measure: 'Opinion Essay',
		category: 'Writing',
		Point: '45',
		PointPossible: '50',
		graded: true,
		DueDate: '2026-10-12',
		Notes: 'Strong structure; develop the counterclaim.'
	},
	{
		AssignmentID: 'habits',
		Measure: 'Notebook Check',
		category: 'Habits',
		Point: '20',
		PointPossible: '20',
		graded: true,
		Notes: 'Complete.'
	},
	{
		AssignmentID: 'symbol',
		Measure: 'Symbolism Response',
		category: 'Reading',
		Point: null,
		PointPossible: '10',
		graded: false,
		DueDate: '2026-10-22',
		Notes:
			'Upcoming task: choose two quotes and explain how each supports your interpretation. Not yet graded, not missing.'
	}
];
const context = {
	source: 'Grademaxxing',
	reportingPeriod: 'Synthetic quarter',
	dataAsOf: new Date().toISOString(),
	gradesStatus: 'available',
	assignmentDetailsAvailable: false,
	gpa: {
		status: 'available',
		unweighted: 3.5,
		weighted: 4,
		displayUnweighted: '3.50',
		displayWeighted: '4.00'
	},
	courses: [
		{
			course: 'English 9',
			letter: 'B',
			percent: 83,
			assignmentCount: 5,
			assignmentsOmitted: 4,
			categories,
			assignments: [
				{
					name: 'Theme Paragraph',
					category: 'Reading',
					pointsEarned: 14,
					pointsPossible: 20,
					graded: true
				}
			]
		}
	]
};
const pool = createPoolFromEnv(),
	results: any[] = [];
if (!pool.length) throw new Error('Configure provider API keys before running this evaluation.');
// Default to the production waterfall. Optional isolation can surface real
// provider quota failures; those must not be mistaken for a successful eval.
for (const provider of process.env.PLAN_PROVIDERS?.split(',') ?? ['pool']) {
	const slots = provider === 'pool' ? pool : pool.filter((slot) => slot.provider === provider);
	if (!slots.length) throw new Error('No configured keys for the requested evaluation provider.');
	const mesh = new TokenMesh({
		slots,
		attemptTimeoutMs: 12000,
		streamIdleTimeoutMs: 12000,
		maxPoolWaitMs: 0
	});
	let reads = 0;
	const client = {
		gradebook: async () => {
			reads++;
			return {
				selectedPeriod: { index: 0, name: 'Synthetic quarter' },
				reportingPeriods: [{ index: 0, name: 'Synthetic quarter' }],
				detailed: true,
				courses: [
					{ id: 'english', title: 'English 9', score: 'B', scoreRaw: '83', categories, assignments }
				]
			};
		}
	};
	const session = {
		client,
		clientSessionId: 'synthetic-planning',
		operationTail: Promise.resolve(),
		queuedOperations: 0
	} as unknown as StudentSession;
	const access = createMaxResourceAccess(session);
	const history: any[] = [];
	try {
		for (const [id, question] of [
			['initial', 'tell me how to increase my english grade'],
			['followup', 'but how do i increase it'],
			['repair', 'but how do i increase it'],
			['simple', 'whats my gpa']
		]) {
			const prior =
				id === 'repair'
					? [
							{ role: 'user', text: 'tell me how to increase my english grade' },
							{
								role: 'assistant',
								text: 'Your English 9 grade is 83%. Check your gradebook categories to find what is holding it down.'
							},
							{ role: 'user', text: 'how?' },
							{
								role: 'assistant',
								text: 'Reading is at 60% and counts for 30%. Focus on improving your reading assignments.'
							}
						]
					: id === 'simple'
						? []
						: history;
			const tools: string[] = [],
				chunks: string[] = [],
				attempts: any[] = [];
			try {
				const answer = await askMaxDetailed(context, question, {
					mesh,
					history: prior,
					resourceAccess: access,
					onTool: (name) => tools.push(name),
					onToken: (text) => chunks.push(text),
					onAttempt: (event) => attempts.push(event)
				});
				const checks =
					id === 'simple'
						? { gpa: /3\.50|3\.5/.test(answer.text), focused: answer.text.split(/\s+/).length < 80 }
						: {
								specificAssignment: /River Passage Check/i.test(answer.text),
								feedback: /quote|evidence|narrator|answers?\s*2/i.test(answer.text),
								action:
									/revise|rewrite|add|ask|review|practice|cite|submit|complete|work through|write|explain/i.test(
										answer.text
									),
								deepLookup: reads > 0
							};
				const result = {
					provider,
					model: answer.model,
					id,
					success: Object.values(checks).every(Boolean) && chunks.length > 0,
					checks,
					tools,
					frames: chunks.length,
					words: answer.text.split(/\s+/).length,
					text: answer.text,
					attempts
				};
				results.push(result);
				console.log(JSON.stringify(result));
				if (id !== 'repair' && id !== 'simple')
					history.push({ role: 'user', text: question }, { role: 'assistant', text: answer.text });
			} catch (error: any) {
				const result = { provider, id, success: false, error: error.name, tools, attempts };
				results.push(result);
				console.log(JSON.stringify(result));
			}
		}
	} finally {
		await access.dispose();
	}
}
if (results.some((result) => !result.success)) process.exitCode = 1;
