import {
	calculateCourseGradePercentageFromCategories,
	calculateCourseGradePercentageFromTotals,
	calculateGradePercentage,
	calculatePointsNeededForTargetGrade,
	gradesMatch,
	type Assignment,
	type Calculable,
	type Category
} from '$lib/grades/assignments';
import { calculateGpaPipelines, formatGpa, isAcademicCourse } from '$lib/grades/gpa';
import { GPA_POLICY } from '$lib/grades/gpa-policy';
import { formatPercentage } from '$lib/grades/percentage-format';
import type { MaxStudentContext } from '$lib/max/context';
import type { MemoryChat } from '$lib/max/conversations';
import { MAX_RESOURCE_TOOLS, type MaxResourceAccess } from './resources';
import type { FunctionTool, ToolCall } from './tokenMesh';

const numeric = { type: 'number' };
const courseProperty = {
	type: 'string',
	description: 'Exact course name from app records; never guess ambiguous names.'
};
const tool = (
	name: string,
	description: string,
	properties: Record<string, unknown>,
	required: string[]
): FunctionTool => ({
	type: 'function',
	function: {
		name,
		description,
		parameters: { type: 'object', properties, required, additionalProperties: false }
	}
});
export const MAX_TOOLS: FunctionTool[] = [
	...MAX_RESOURCE_TOOLS,
	tool(
		'search_chat_history',
		'Search relevant excerpts from this account’s saved chats and earlier parts of the active chat. These are historical statements, not current school records. Use for remembered goals, preferences, plans and prior discussions. Excerpts are selected and incomplete; no match does not mean a discussion never happened.',
		{
			query: {
				type: 'string',
				description:
					'Topic to find, such as English target or study plan. Empty string returns supplied recent excerpts.'
			}
		},
		['query']
	),
	tool(
		'read_app_data',
		'Read current app values. Use for all factual GPA, grades, attendance, assignments, category and schedule questions. Returns structured records, not a prewritten answer. Never recalculate current GPA or published grades.',
		{
			section: { type: 'string', enum: ['gpa', 'grades', 'attendance', 'schedule', 'course'] },
			course: courseProperty
		},
		['section']
	),
	tool(
		'calculate_grade',
		'Run the app grade engine for explicit hypothetical inputs supplied by the user. Never perform arithmetic yourself. Missing inputs must be requested. points_average sums points; equal_average averages assignment ratios; weighted_average uses weights. final_target solves a final worth finalWeightPercent. target_assignment solves an added points-based assignment.',
		{
			operation: {
				type: 'string',
				enum: [
					'points_average',
					'equal_average',
					'weighted_average',
					'final_target',
					'target_assignment'
				]
			},
			rows: {
				type: 'array',
				maxItems: 100,
				items: {
					type: 'object',
					properties: { earned: numeric, possible: numeric, weight: numeric },
					required: ['earned', 'possible'],
					additionalProperties: false
				}
			},
			currentPercentage: numeric,
			finalWeightPercent: numeric,
			targetPercentage: numeric,
			assignmentPointsPossible: numeric
		},
		['operation']
	),
	tool(
		'project_course',
		'Use actual app course/category totals to model one added assignment or calculate points needed on it. Current inputs are fetched by the app, never reconstructed by the model. Refuses unsupported or incomplete calculation baselines. Result is a what-if estimate.',
		{
			course: courseProperty,
			category: { type: 'string' },
			pointsPossible: numeric,
			pointsEarned: numeric,
			targetPercentage: numeric
		},
		['course', 'pointsPossible']
	),
	tool(
		'project_gpa',
		'Run the SAME app GPA policy for hypothetical letter changes. The app reads current courses and applies the overrides. Do not calculate GPA yourself or assume another grade-point scale. No overrides reads the app current GPA.',
		{
			changes: {
				type: 'array',
				maxItems: 40,
				items: {
					type: 'object',
					properties: { course: courseProperty, letter: { type: 'string' } },
					required: ['course', 'letter'],
					additionalProperties: false
				}
			}
		},
		['changes']
	)
];

type Args = Record<string, unknown>;
const finite = (value: unknown, name: string) => {
	if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e9)
		throw new TypeError(`Missing or invalid ${name}. Ask the user for it.`);
	return value;
};
const positive = (value: unknown, name: string) => {
	const result = finite(value, name);
	if (result <= 0) throw new TypeError(`${name} must be positive.`);
	return result;
};
const object = (value: unknown): Args => {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new TypeError('Expected an object.');
	return value as Args;
};
const assignment = (earned: number, possible: number, category = ''): Calculable<Assignment> => ({
	name: 'Calculation input',
	id: '',
	category,
	pointsEarned: earned,
	pointsPossible: possible,
	extraCredit: possible === 0,
	notForGrade: false,
	hidden: false,
	date: new Date(0),
	newHypothetical: false,
	unscaledPoints: undefined,
	gradePercentageChange: undefined
});
const categoryModel = (name: string, weight: number): Category => ({
	name,
	weightPercentage: weight,
	pointsEarned: 0,
	pointsPossible: 0,
	weightedPercentage: 0,
	gradeLetter: ''
});
const requireContext = (context: MaxStudentContext | null) => {
	if (!context) throw new TypeError('App data is unavailable. Ask the user to refresh.');
	return context;
};
const findCourse = (context: MaxStudentContext, name: unknown) => {
	if (typeof name !== 'string') throw new TypeError('A course name is required.');
	const matches = context.courses.filter(
		(course) => course.course.toLowerCase() === name.toLowerCase()
	);
	if (matches.length !== 1)
		throw new TypeError('Course missing or ambiguous. Ask for the exact course name.');
	return matches[0]!;
};
const checked = (value: number) => {
	if (!Number.isFinite(value))
		throw new TypeError(
			'App calculator cannot determine a result from these inputs. Ask for the missing calculation data.'
		);
	return Number(value.toPrecision(12));
};

function calculate(args: Args) {
	if (args.operation === 'final_target') {
		const current = finite(args.currentPercentage, 'currentPercentage');
		const weight = positive(args.finalWeightPercent, 'finalWeightPercent');
		if (weight > 100) throw new TypeError('finalWeightPercent cannot exceed 100.');
		const target = finite(args.targetPercentage, 'targetPercentage');
		const needed = checked(
			calculatePointsNeededForTargetGrade({
				targetGradePercentage: target,
				assignmentPointsPossible: 100,
				hasCategories: true,
				otherAssignments: [
					assignment(current, 100, 'Coursework') as Calculable<Assignment> & { category: string }
				],
				gradeCategoryWeightProportions: new Map([
					['Coursework', (100 - weight) / 100],
					['Final', weight / 100]
				]),
				assignmentCategoryName: 'Final'
			})
		);
		return {
			requiredFinalPercentage: needed,
			achievableWithoutExtraCredit: needed <= 100,
			alreadySecured: needed <= 0,
			estimate: true
		};
	}
	if (!Array.isArray(args.rows) || !args.rows.length || args.rows.length > 100)
		throw new TypeError('Provide 1–100 score rows from the user’s explicit inputs.');
	const rows = args.rows.map((entry) => {
		const row = object(entry);
		return {
			earned: finite(row.earned, 'earned'),
			possible: positive(row.possible, 'possible'),
			weight: row.weight
		};
	});
	const assignments = rows.map((row) => assignment(row.earned, row.possible));
	if (args.operation === 'points_average')
		return {
			percentage: checked(calculateCourseGradePercentageFromTotals(assignments)),
			estimate: true
		};
	if (args.operation === 'target_assignment') {
		const possible = positive(args.assignmentPointsPossible, 'assignmentPointsPossible');
		const needed = checked(
			calculatePointsNeededForTargetGrade({
				targetGradePercentage: finite(args.targetPercentage, 'targetPercentage'),
				assignmentPointsPossible: possible,
				hasCategories: false,
				otherAssignments: assignments
			})
		);
		return {
			requiredPoints: needed,
			requiredPercentage: checked(calculateGradePercentage(needed, possible)),
			achievableWithoutExtraCredit: needed <= possible,
			estimate: true
		};
	}
	if (args.operation !== 'equal_average' && args.operation !== 'weighted_average')
		throw new TypeError('Unknown calculation operation.');
	const categories = rows.map((row, index) =>
		categoryModel(
			String(index),
			args.operation === 'equal_average' ? 1 : finite(row.weight, 'weight')
		)
	);
	const points = Object.fromEntries(
		rows.map((row, index) => [
			String(index),
			{ pointsEarned: row.earned, pointsPossible: row.possible }
		])
	);
	return {
		percentage: checked(calculateCourseGradePercentageFromCategories(points, categories)),
		estimate: true
	};
}

function projectCourse(context: MaxStudentContext, args: Args) {
	const course = findCourse(context, args.course);
	const possible = positive(args.pointsPossible, 'pointsPossible');
	const categories = course.categories.filter(
		(entry) => entry.name !== 'TOTAL' && entry.weightPercentage !== 0
	);
	if (course.categoriesOmitted)
		throw new TypeError('Category data is incomplete; refresh the app before calculating.');
	let assignments: (Calculable<Assignment> & { category: string })[];
	let categoryOptions:
		| { hasCategories: false; otherAssignments: Calculable<Assignment>[] }
		| {
				hasCategories: true;
				otherAssignments: (Calculable<Assignment> & { category: string })[];
				gradeCategoryWeightProportions: Map<string, number>;
				assignmentCategoryName: string;
		  };
	let baseline: number;
	if (categories.length) {
		const models = categories.map((entry) =>
			categoryModel(entry.name, finite(entry.weightPercentage, 'published category weight'))
		);
		assignments = categories.map(
			(entry) =>
				assignment(
					finite(entry.pointsEarned, 'published category earned points'),
					finite(entry.pointsPossible, 'published category possible points'),
					entry.name
				) as Calculable<Assignment> & { category: string }
		);
		const selected = categories.find((entry) => entry.name === args.category);
		if (!selected || !selected.weightPercentage)
			throw new TypeError('Select a known category with a positive published weight.');
		const points = Object.fromEntries(
			assignments.map((entry) => [
				entry.category,
				{ pointsEarned: entry.pointsEarned, pointsPossible: entry.pointsPossible }
			])
		);
		baseline = calculateCourseGradePercentageFromCategories(points, models);
		categoryOptions = {
			hasCategories: true,
			otherAssignments: assignments,
			gradeCategoryWeightProportions: new Map(
				models.map((entry) => [entry.name, entry.weightPercentage / 100])
			),
			assignmentCategoryName: selected.name
		};
		if (args.pointsEarned !== undefined) {
			const current = points[selected.name]!;
			points[selected.name] = {
				pointsEarned: current.pointsEarned + finite(args.pointsEarned, 'pointsEarned'),
				pointsPossible: current.pointsPossible + possible
			};
		}
		if (course.percent === null || !gradesMatch(baseline, course.percent))
			throw new TypeError(
				'The app calculation baseline does not match the official grade. An exact projection is unavailable.'
			);
		if (args.targetPercentage !== undefined) {
			const needed = checked(
				calculatePointsNeededForTargetGrade({
					...categoryOptions,
					targetGradePercentage: finite(args.targetPercentage, 'targetPercentage'),
					assignmentPointsPossible: possible
				})
			);
			return {
				requiredPoints: needed,
				requiredPercentage: checked(calculateGradePercentage(needed, possible)),
				achievableWithoutExtraCredit: needed <= possible,
				estimate: true
			};
		}
		finite(args.pointsEarned, 'pointsEarned');
		return {
			officialPercentage: course.percent,
			projectedPercentage: checked(calculateCourseGradePercentageFromCategories(points, models)),
			estimate: true
		};
	}
	if (
		!context.assignmentDetailsAvailable ||
		course.assignmentsOmitted ||
		course.assignmentCount !== course.assignments.length
	)
		throw new TypeError('Complete assignment data is required for a points-based projection.');
	const eligible = course.assignments.filter((entry) => entry.graded && !entry.notForGrade);
	if (!eligible.length || eligible.some((entry) => entry.calculationUnavailable))
		throw new TypeError('The app cannot establish a complete calculation basis.');
	assignments = eligible.map(
		(entry) =>
			assignment(
				finite(entry.pointsEarned, 'earned points'),
				finite(entry.pointsPossible, 'possible points'),
				''
			) as Calculable<Assignment> & { category: string }
	);
	baseline = calculateCourseGradePercentageFromTotals(assignments);
	if (course.percent === null || !gradesMatch(baseline, course.percent))
		throw new TypeError(
			'The app calculation baseline does not match the official grade. An exact projection is unavailable.'
		);
	categoryOptions = { hasCategories: false, otherAssignments: assignments };
	if (args.targetPercentage !== undefined) {
		const needed = checked(
			calculatePointsNeededForTargetGrade({
				...categoryOptions,
				targetGradePercentage: finite(args.targetPercentage, 'targetPercentage'),
				assignmentPointsPossible: possible
			})
		);
		return {
			requiredPoints: needed,
			requiredPercentage: checked(calculateGradePercentage(needed, possible)),
			achievableWithoutExtraCredit: needed <= possible,
			estimate: true
		};
	}
	return {
		officialPercentage: course.percent,
		projectedPercentage: checked(
			calculateCourseGradePercentageFromTotals([
				...assignments,
				assignment(finite(args.pointsEarned, 'pointsEarned'), possible)
			])
		),
		estimate: true
	};
}

const withDisplays = (result: Record<string, unknown>) => ({
	...result,
	display: Object.fromEntries(
		Object.entries(result).flatMap(([key, value]) =>
			key.toLowerCase().includes('percentage') && typeof value === 'number'
				? [[key, `${formatPercentage(value)}%`]]
				: []
		)
	)
});

export function executeMaxTool(
	call: ToolCall,
	context: MaxStudentContext | null,
	memory: MemoryChat[] = []
): unknown {
	try {
		if (call.function.arguments.length > 16_000) throw new TypeError('Tool arguments too large.');
		const args = object(JSON.parse(call.function.arguments));
		if (call.function.name === 'search_chat_history') {
			if (typeof args.query !== 'string' || args.query.length > 240)
				throw new TypeError('Provide a short history search topic.');
			const words = args.query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
			const ranked = memory
				.map((chat) => ({
					chat,
					score: words.filter((word) =>
						(chat.title + ' ' + chat.messages.map((message) => message.text).join(' '))
							.toLowerCase()
							.includes(word)
					).length
				}))
				.toSorted((a, b) => b.score - a.score);
			return {
				source: 'Saved chat excerpts on this device',
				scope:
					'Selected excerpts, not the full archive. Historical statements are not current grades or official records.',
				chats: ranked.map(({ chat }) => chat)
			};
		}
		if (call.function.name === 'calculate_grade')
			return { source: 'Grademaxxing grade engine', ...withDisplays(calculate(args)) };
		const app = requireContext(context);
		if (call.function.name === 'read_app_data') {
			const metadata = {
				source: 'Grademaxxing app records',
				reportingPeriod: app.reportingPeriod,
				dataAsOf: app.dataAsOf,
				note: app.officialValuesNote
			};
			switch (args.section) {
				case 'gpa':
					return { ...metadata, gpa: app.gpa };
				case 'grades':
					return {
						...metadata,
						status: app.gradesStatus,
						courses: app.courses.map(({ course, letter, percent, markName }) => ({
							course,
							letter,
							percent,
							markName
						}))
					};
				case 'attendance':
					return { ...metadata, attendance: app.attendance };
				case 'schedule':
					return { ...metadata, schedule: app.schedule };
				case 'course':
					return {
						...metadata,
						assignmentDetailsAvailable: app.assignmentDetailsAvailable,
						course: findCourse(app, args.course)
					};
				default:
					throw new TypeError('Choose a supported app data section.');
			}
		}
		if (call.function.name === 'project_course')
			return {
				source: 'Grademaxxing grade engine',
				dataStatus: app.gradesStatus,
				dataAsOf: app.dataAsOf,
				...withDisplays(projectCourse(app, args))
			};
		if (call.function.name === 'project_gpa') {
			if (!Array.isArray(args.changes) || args.changes.length > 40)
				throw new TypeError('Provide an array of course letter changes.');
			if (!args.changes.length) return { source: 'Grademaxxing app records', gpa: app.gpa };
			if (app.gradesStatus === 'unavailable')
				throw new TypeError('Current grades are unavailable.');
			const overrides = new Map<string, string>();
			for (const change of args.changes) {
				const item = object(change);
				const course = findCourse(app, item.course);
				if (
					typeof item.letter !== 'string' ||
					GPA_POLICY.gradePoints[item.letter.toUpperCase()] === undefined
				)
					throw new TypeError('Choose a letter recognized by the app GPA policy.');
				overrides.set(course.course, item.letter.toUpperCase());
			}
			const result = calculateGpaPipelines(
				app.courses.map((course) => ({
					courseName: course.course,
					letter: overrides.get(course.course) ?? course.letter,
					gradeLevel: app.gpa.gradeLevel ?? GPA_POLICY.minimumGradeLevel,
					credits: GPA_POLICY.defaultCredits,
					excludeFromGpa: course.percent === null,
					academic: isAcademicCourse(course.course)
				}))
			);
			return {
				source: 'Grademaxxing GPA engine',
				dataStatus: app.gradesStatus,
				dataAsOf: app.dataAsOf,
				estimate: true,
				policy: GPA_POLICY.label,
				unweighted: formatGpa(result.attemptedCredits ? result.unweighted : undefined),
				weighted: formatGpa(result.attemptedCredits ? result.weighted : undefined),
				academicWeighted: formatGpa(result.academicCredits ? result.academicWeighted : undefined)
			};
		}
		throw new TypeError('Unknown tool. Only the documented read-only app tools are available.');
	} catch (error) {
		return {
			error: error instanceof TypeError ? error.message : 'Invalid tool arguments.',
			action: 'Ask for missing inputs or use a supported tool. Do not invent a result.'
		};
	}
}

/** Network reads are awaited in the same tool loop as the app calculators. */
export async function executeMaxAppTool(
	call: ToolCall,
	context: MaxStudentContext | null,
	memory: MemoryChat[],
	access?: MaxResourceAccess
) {
	if (!['read_app_resource', 'search_app_records'].includes(call.function.name))
		return executeMaxTool(call, context, memory);
	if (!access)
		return {
			error: 'Deep app resources are unavailable in this environment. Do not invent records.'
		};
	try {
		if (call.function.arguments.length > 16000) throw new TypeError('Tool arguments too large.');
		return await access.execute(
			JSON.parse(call.function.arguments),
			call.function.name === 'search_app_records'
		);
	} catch {
		return { error: 'Invalid resource arguments. Use documented fields and returned paths.' };
	}
}
