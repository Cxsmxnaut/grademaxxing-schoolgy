/**
 * MCP prompts: guided workflows that steer the host model through the tool
 * surface. Every prompt repeats the product's core rule — official portal
 * values are never overwritten by local calculations or simulations.
 */

export type PromptDefinition = {
	name: string;
	title: string;
	description: string;
	arguments: Array<{ name: string; description: string; required: boolean }>;
	build: (args: Record<string, string>) => string;
};

const GUARDRAILS = `Ground rules:
- Only StudentVUE tool results are official. Anything you compute or anything labeled simulation/localCalculations is an estimate; never present it as an official grade.
- If a tool reports a session or connection problem, tell the user to reconnect in the connector settings instead of guessing data.
- Do not invent assignments, dates, scores, or attendance that are not in the tool output.`;

export const mcpPrompts: PromptDefinition[] = [
	{
		name: 'analyze-grades',
		title: 'Analyze my grades',
		description:
			'Full gradebook review: official marks, category weaknesses, missing work, and trends.',
		arguments: [
			{
				name: 'focus',
				description: 'Optional course name or subject to focus on.',
				required: false
			}
		],
		build: (args) =>
			`Review my grades end to end.${args.focus ? ` Focus on: ${args.focus}.` : ''}
Start with get_gradebook_digest for the current period, then use get_course on any course that needs detail.
Cover: official marks per course, category strengths/weaknesses, missing or zero-scored work, and the local trend calculation.
Finish with a short prioritized list of what would move each grade the most.
${GUARDRAILS}`
	},
	{
		name: 'what-if-scenario',
		title: 'Run a what-if scenario',
		description: 'Project a target course grade using the what-if simulator.',
		arguments: [
			{ name: 'course', description: 'Course name or id to simulate.', required: true },
			{
				name: 'goal',
				description: 'What the student wants: e.g. "keep an A" or "finish with B+".',
				required: false
			}
		],
		build: (args) =>
			`Help me run a what-if for ${args.course}.${args.goal ? ` Goal: ${args.goal}.` : ''}
Look up the course with get_gradebook (includeAssignments) and get_course, then use project_course_grade to simulate realistic scores.
Explain the official mark versus the simulated result, the assumptions the tool lists, and what scores are needed to reach the goal.
${GUARDRAILS}`
	},
	{
		name: 'gpa-planner',
		title: 'Plan my GPA',
		description: 'Compute current GPA and explore how hypothetical grades would change it.',
		arguments: [
			{
				name: 'target',
				description: 'Optional target GPA, e.g. 3.5.',
				required: false
			}
		],
		build: (args) =>
			`Help me with my GPA.${args.target ? ` My target is ${args.target}.` : ''}
Use calculate_gpa with no arguments for my official marks, then run planning scenarios with hypothetical entries.
Explain unweighted vs weighted vs academic-weighted results and which courses move them most.
${GUARDRAILS}`
	},
	{
		name: 'attendance-review',
		title: 'Review my attendance',
		description: 'Summarize attendance patterns, absences, and tardies.',
		arguments: [],
		build: () =>
			`Review my attendance with get_attendance.
Summarize absences, tardies, and per-course totals, note any patterns, and flag anything the student should verify with the school.
Remember StudentVUE attendance is exception-based: ordinary past days are implicitly present.
${GUARDRAILS}`
	},
	{
		name: 'weekly-digest',
		title: 'Weekly digest',
		description:
			'One-screen weekly summary across grades, upcoming calendar events, and attendance.',
		arguments: [],
		build: () =>
			`Build me a weekly digest: use get_gradebook_digest for academic status, get_calendar for the coming week, get_schedule for classes, and get_attendance for anything outstanding.
Keep it to a compact bullet list with official values first.
${GUARDRAILS}`
	},
	{
		name: 'mail-triage',
		title: 'Triage my school mail',
		description: 'Summarize unread StudentVUE messages and surface action items.',
		arguments: [],
		build: () =>
			`Triage my StudentVUE mail: start with list_mail, read anything unread or important with get_message, and summarize by urgency with concrete action items.
Include sender, date, and why it matters for each item.
${GUARDRAILS}`
	},
	{
		name: 'study-priorities',
		title: 'Set study priorities',
		description: 'Turn missing and low-scoring work into a prioritized study plan.',
		arguments: [],
		build: () =>
			`Turn my gradebook into study priorities: use get_gradebook_digest to find missing indicators, zero scores, and the lowest-scoring assignments, then get_course where category weights matter.
Produce a prioritized plan that maximizes grade impact per hour, and say clearly which numbers are official versus locally calculated.
${GUARDRAILS}`
	},
	{
		name: 'report-card-review',
		title: 'Review my report card',
		description: 'Explain official report-card marks and related documents.',
		arguments: [],
		build: () =>
			`Review my report card: use get_report_cards for official marks and documents, and compare with the current get_gradebook_digest when useful.
Explain each mark plainly and note any difference between report-card marks and the current gradebook.
${GUARDRAILS}`
	}
];

export const mcpPromptByName = new Map(mcpPrompts.map((prompt) => [prompt.name, prompt]));

export function buildPrompt(name: string, args: Record<string, string>) {
	const prompt = mcpPromptByName.get(name);
	if (!prompt) return undefined;
	const provided: Record<string, string> = {};
	for (const definition of prompt.arguments) {
		const value = args[definition.name]?.trim();
		if (value) provided[definition.name] = value.slice(0, 500);
		if (!value && definition.required) return undefined;
	}
	return {
		description: prompt.description,
		messages: [
			{ role: 'user' as const, content: { type: 'text' as const, text: prompt.build(provided) } }
		]
	};
}
