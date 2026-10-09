import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
import { getCalculableAssignments, parseSynergyAssignment } from '$lib/grades/assignments';
/**
 * MCP tool surface for Grademaxxing: every read-only StudentVUE ability the web
 * app exposes, plus the app's own analysis primitives (GPA policy math, what-if
 * projection, gradebook digesting) reimplemented server-side with the same
 * domain modules the UI uses.
 *
 * Rules encoded here and asserted by tests:
 * - Read-only: no tool can send mail, change records, or write to StudentVUE.
 * - Official portal values always travel under `official*` keys; anything the
 *   server computes is labeled as a local calculation or simulation.
 * - StudentVUE session expiry surfaces as McpAuthRequiredError so the route can
 *   answer 401 and the host restarts OAuth instead of showing stale data.
 */
import {
	calculateGpaPipelines,
	getCourseWeightBonus,
	isAcademicCourse,
	letterGradePoints,
	type GpaEnrollment
} from '$lib/grades/gpa';
import { GPA_POLICY } from '$lib/grades/gpa-policy';
import { estimateHypotheticalLetter } from '$lib/grades/grade-scale';
import {
	Pxp2InputError,
	Pxp2SessionExpiredError,
	Pxp2TimeoutError,
	type PortalCourse,
	type PortalFile,
	type PortalGradebook
} from '$lib/server/pxp2';
import { mdyDate } from '$lib/server/pxp2/parsers';
import {
	runStudentOperation,
	StudentOperationAbortedError,
	StudentServiceBusyError,
	StudentSessionBusyError,
	type StudentSession
} from '$lib/server/student-session';
import { adaptAttendance } from '$lib/server/studentvue-adapters';
import { capabilities } from '$lib/server/studentvue-api/resources';
import { createHash } from 'node:crypto';

export class McpAuthRequiredError extends Error {
	constructor(message = 'The StudentVUE session expired. Reconnect to continue.') {
		super(message);
		this.name = 'McpAuthRequiredError';
	}
}

export class McpToolExecutionError extends Error {
	constructor(
		message: string,
		readonly code: string
	) {
		super(message);
		this.name = 'McpToolExecutionError';
	}
}

export class McpToolInputError extends McpToolExecutionError {
	constructor(message: string) {
		super(message, 'INVALID_ARGUMENTS');
		this.name = 'McpToolInputError';
	}
}

/** Marker for tool outputs that also carry native image content blocks. */
export class McpToolResult {
	constructor(
		readonly structured: Record<string, unknown>,
		readonly images?: Array<{ data: string; mimeType: string }>
	) {}
}

export type ToolContext = { session: StudentSession; signal?: AbortSignal };

export type JsonSchema = Record<string, unknown>;

export type ToolDefinition = {
	name: string;
	title: string;
	description: string;
	inputSchema: JsonSchema;
	outputSchema: JsonSchema;
	annotations: { readOnlyHint: true; openWorldHint: true };
	/** Protocol-level metadata; `_meta['openai/profile']` marks the profile tool. */
	_meta?: Record<string, unknown>;
	handler: (args: unknown, ctx: ToolContext) => Promise<unknown>;
};

const MAX_BINARY_BASE64_CHARS = 500_000;
const MAX_MESSAGE_TEXT_CHARS = 20_000;

async function portal<T>(ctx: ToolContext, operation: () => Promise<T>): Promise<T> {
	try {
		return await runStudentOperation(ctx.session, operation, ctx.signal);
	} catch (cause) {
		if (cause instanceof Pxp2SessionExpiredError) throw new McpAuthRequiredError(cause.message);
		throw cause;
	}
}

/** Map any escaped portal failure to a safe, non-sensitive tool outcome. */
export function toToolFailure(cause: unknown): McpToolExecutionError {
	if (cause instanceof McpToolExecutionError) return cause;
	if (cause instanceof McpToolInputError) return cause;
	if (cause instanceof StudentSessionBusyError || cause instanceof StudentServiceBusyError)
		return new McpToolExecutionError(cause.message, 'SERVICE_BUSY');
	if (cause instanceof Pxp2InputError)
		return new McpToolExecutionError(cause.message, 'INVALID_INPUT');
	if (cause instanceof Pxp2TimeoutError)
		return new McpToolExecutionError(cause.message, 'UPSTREAM_TIMEOUT');
	if (cause instanceof StudentOperationAbortedError)
		return new McpToolExecutionError(cause.message, 'CANCELLED');
	return new McpToolExecutionError(
		'The StudentVUE portal could not serve this request. Try again shortly.',
		'UPSTREAM_ERROR'
	);
}

function asObject(args: unknown): Record<string, unknown> {
	if (args === undefined || args === null) return {};
	if (typeof args !== 'object' || Array.isArray(args))
		throw new McpToolInputError('Tool arguments must be a JSON object.');
	return args as Record<string, unknown>;
}

function integerArg(
	args: Record<string, unknown>,
	name: string,
	minimum: number,
	maximum: number
): number | undefined {
	const value = args[name];
	if (value === undefined || value === null) return undefined;
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && /^\d+$/.test(value)
				? Number(value)
				: NaN;
	if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum)
		throw new McpToolInputError(`${name} must be an integer between ${minimum} and ${maximum}.`);
	return parsed;
}

function booleanArg(args: Record<string, unknown>, name: string, fallback: boolean): boolean {
	const value = args[name];
	if (value === undefined || value === null) return fallback;
	if (typeof value !== 'boolean') throw new McpToolInputError(`${name} must be true or false.`);
	return value;
}

function stringArg(
	args: Record<string, unknown>,
	name: string,
	options: { required?: boolean; maxLength?: number } = {}
): string | undefined {
	const value = args[name];
	if (value === undefined || value === null || value === '') {
		if (options.required) throw new McpToolInputError(`${name} is required.`);
		return undefined;
	}
	if (typeof value !== 'string') throw new McpToolInputError(`${name} must be a string.`);
	const maximum = options.maxLength ?? 512;
	if (value.length > maximum)
		throw new McpToolInputError(`${name} must be at most ${maximum} characters.`);
	return value;
}

function numberArg(
	args: Record<string, unknown>,
	name: string,
	options: { required?: boolean } = {}
): number | undefined {
	const value = args[name];
	if (value === undefined || value === null) {
		if (options.required) throw new McpToolInputError(`${name} is required.`);
		return undefined;
	}
	const parsed =
		typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
	if (!Number.isFinite(parsed)) throw new McpToolInputError(`${name} must be a number.`);
	return parsed;
}

function num(value: unknown): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value !== 'string') return undefined;
	const cleaned = value.replace(/[%,\s]/g, '');
	if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return undefined;
	const parsed = Number(cleaned);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function percent(earned: number, possible: number) {
	return possible > 0 ? (earned / possible) * 100 : undefined;
}

function round(value: number | undefined, digits = 2) {
	if (value === undefined || !Number.isFinite(value)) return null;
	const factor = 10 ** digits;
	return Math.round((value + Number.EPSILON) * factor) / factor;
}

type ParsedAssignment = {
	id: string;
	name: string;
	description: string;
	category: string;
	date: string;
	dueDate: string;
	score: string;
	scoreValue: number | null;
	maxScore: number | null;
	scoreType: string;
	points: string;
	earned: number | undefined;
	possible: number | undefined;
	notes: string;
};

function parseAssignment(record: Record<string, string>): ParsedAssignment {
	// Reuse the UI's evidence rules: raw score scales are display metadata,
	// excluded work never counts, and published percentages retain precision.
	const domain = parseSynergyAssignment({
		_GradebookID: record.AssignmentID ?? '',
		_Measure: record.Measure ?? '',
		_Type: record.Type ?? '',
		_Date: record.Date ?? '',
		_DueDate: record.DueDate ?? '',
		_Notes: record.Notes ?? '',
		_MeasureDescription: record.Description ?? '',
		_Point: record.Point,
		_PointPossible: record.PointPossible,
		_Points: record.Points ?? '',
		_ScoreCalValue: record.ScoreCalValue,
		_ScoreMaxValue: record.ScoreMaxValue,
		_AssignmentPercentage: record.AssignmentPercentage,
		_AssignmentPercentagePrecision: record.AssignmentPercentagePrecision,
		_CalculationUnavailable: record.CalculationUnavailable
	} as AssignmentEntity);
	const calculable = getCalculableAssignments([domain])[0];
	const earned = calculable?.pointsEarned;
	const possible = calculable?.pointsPossible;
	return {
		id: record.AssignmentID ?? '',
		name: record.Measure || record.Description || record.AssignmentID || 'Assignment',
		description: record.Description ?? '',
		category: record.Type ?? '',
		date: record.Date ?? '',
		dueDate: record.DueDate ?? '',
		score: record.Score ?? '',
		scoreValue: num(record.ScoreCalValue) ?? null,
		maxScore: num(record.ScoreMaxValue) ?? null,
		scoreType: record.ScoreType ?? '',
		points: record.Points ?? '',
		earned,
		possible,
		notes: record.Notes ?? ''
	};
}

function mapAssignment(record: Record<string, string>) {
	const parsed = parseAssignment(record);
	return {
		id: parsed.id,
		name: parsed.name,
		category: parsed.category,
		date: parsed.date,
		dueDate: parsed.dueDate,
		score: parsed.score,
		scoreValue: parsed.scoreValue,
		maxScore: parsed.maxScore,
		scoreType: parsed.scoreType,
		points: parsed.points,
		earned: parsed.earned ?? null,
		possible: parsed.possible ?? null,
		notes: parsed.notes,
		description: parsed.description
	};
}

function mapCourse(
	course: PortalCourse,
	includeCategories: boolean,
	includeAssignments: boolean,
	assignmentLimit: number
) {
	const assignments = course.assignments.slice(0, assignmentLimit);
	return {
		id: course.id,
		period: course.period,
		title: course.title,
		room: course.room,
		teacher: course.teacher,
		teacherEmail: course.teacherEmail,
		officialMark: {
			letter: course.score,
			percentage: course.scoreRaw,
			missingCount: course.missing
		},
		...(includeCategories
			? {
					categories: course.categories.map((category) => ({
						name: category.name,
						weight: category.weight,
						points: category.points,
						pointsPossible: category.pointsPossible,
						weightedPercentage: category.weightedPercentage,
						officialCalculatedMark: category.calculatedMark
					}))
				}
			: {}),
		...(includeAssignments
			? {
					assignments: assignments.map(mapAssignment),
					assignmentCount: course.assignments.length,
					...(course.assignments.length > assignmentLimit ? { assignmentsTruncated: true } : {})
				}
			: {})
	};
}

type GradebookQuery = {
	reportPeriod?: number;
	includeCategories: boolean;
	includeAssignments: boolean;
	assignmentLimit: number;
};

async function fetchGradebook(ctx: ToolContext, query: GradebookQuery): Promise<PortalGradebook> {
	const summary = !query.includeCategories && !query.includeAssignments;
	return portal(ctx, () => ctx.session.client.gradebook(query.reportPeriod, summary));
}

function gradebookQuery(args: Record<string, unknown>): GradebookQuery {
	return {
		reportPeriod: integerArg(args, 'reportPeriod', 0, 999),
		includeCategories: booleanArg(args, 'includeCategories', true),
		includeAssignments: booleanArg(args, 'includeAssignments', false),
		assignmentLimit: integerArg(args, 'assignmentLimit', 1, 300) ?? 100
	};
}

function requireCourse(gradebook: PortalGradebook, courseId: string) {
	const course = gradebook.courses.find((entry) => entry.id === courseId);
	if (!course)
		throw new McpToolInputError(
			`No course with id "${courseId}". Available: ${gradebook.courses
				.map((entry) => `${entry.id} (${entry.title})`)
				.join(', ')}.`
		);
	return course;
}

function digestCourse(course: PortalCourse) {
	const parsed = course.assignments.map(parseAssignment);
	const dated = parsed
		.map((assignment) => ({ assignment, at: mdyDate(assignment.date)?.getTime() }))
		.filter(
			(entry): entry is { assignment: ParsedAssignment; at: number } => entry.at !== undefined
		)
		.toSorted((a, b) => b.at - a.at);
	const graded = parsed.filter(
		(assignment) => assignment.earned !== undefined && (assignment.possible ?? -1) >= 0
	);
	const pointsEarned = graded.reduce((sum, assignment) => sum + (assignment.earned ?? 0), 0);
	const pointsPossible = graded.reduce((sum, assignment) => sum + (assignment.possible ?? 0), 0);
	const missingIndicators = parsed.filter((assignment) => /missing/i.test(assignment.score));
	const ungraded = parsed.filter((assignment) =>
		/not scored|incomplete|^n\/a$/i.test(assignment.score)
	);
	const zeroScores = graded.filter(
		(assignment) => assignment.earned === 0 && !/missing/i.test(assignment.score)
	);
	const ascending = graded
		.filter((assignment) => assignment.possible! > 0)
		.toSorted((a, b) => a.earned! / a.possible! - b.earned! / b.possible!);
	const lowest = ascending.slice(0, 5).map((assignment) => ({
		name: assignment.name,
		date: assignment.date,
		score: assignment.score,
		percent: round((assignment.earned! / assignment.possible!) * 100)
	}));
	const chronologically = [...dated].toSorted((a, b) => a.at - b.at);
	const midpoint = Math.floor(chronologically.length / 2);
	const averageFor = (entries: typeof chronologically) => {
		const usable = entries.filter(
			(entry) => (entry.assignment.possible ?? -1) >= 0 && entry.assignment.earned !== undefined
		);
		if (usable.length === 0) return undefined;
		const earned = usable.reduce((sum, entry) => sum + (entry.assignment.earned ?? 0), 0);
		const possible = usable.reduce((sum, entry) => sum + (entry.assignment.possible ?? 0), 0);
		return percent(earned, possible);
	};
	const earlier = averageFor(chronologically.slice(0, midpoint));
	const later = averageFor(chronologically.slice(midpoint));
	return {
		officialMark: {
			letter: course.score,
			percentage: course.scoreRaw,
			missingCount: course.missing
		},
		localCalculations: {
			assignmentCount: parsed.length,
			missingIndicatorCount: missingIndicators.length,
			ungradedCount: ungraded.length,
			zeroScoreCount: zeroScores.length,
			pointsEarned: round(pointsEarned, 2),
			pointsPossible: round(pointsPossible, 2),
			pointsPercent: round(percent(pointsEarned, pointsPossible)),
			trend:
				earlier !== undefined && later !== undefined
					? {
							earlierAveragePercent: round(earlier),
							recentAveragePercent: round(later),
							deltaPercent: round(later - earlier)
						}
					: null
		},
		lowestScoringAssignments: lowest,
		recentAssignments: dated.slice(0, 5).map((entry) => ({
			name: entry.assignment.name,
			date: entry.assignment.date,
			score: entry.assignment.score,
			category: entry.assignment.category
		})),
		missingIndicators: missingIndicators.slice(0, 20).map((assignment) => ({
			name: assignment.name,
			date: assignment.date,
			score: assignment.score
		}))
	};
}

type CategoryState = { name: string; earned: number; possible: number; weight: number };

function buildCategoryStates(course: PortalCourse): CategoryState[] {
	return course.categories.flatMap((category) => {
		const name = category.name.trim();
		if (!name) return [];
		return [
			{
				name,
				earned: num(category.points) ?? 0,
				possible: num(category.pointsPossible) ?? 0,
				weight: num(category.weight) ?? 0
			}
		];
	});
}

function pickMode(
	requested: 'auto' | 'weighted' | 'points',
	categories: CategoryState[]
): 'weighted' | 'points' {
	if (requested !== 'auto') return requested;
	if (categories.length === 0) return 'points';
	const weights = categories.map((category) => category.weight);
	const nonNegative = weights.every((weight) => weight >= 0);
	const sum = weights.reduce((total, weight) => total + weight, 0);
	return nonNegative && sum >= 95 && sum <= 105 ? 'weighted' : 'points';
}

function computeMark(
	mode: 'weighted' | 'points',
	categories: CategoryState[]
): { percent: number | undefined; excludedCategories: string[] } {
	const excludedCategories = categories
		.filter((category) => category.possible <= 0 && category.weight > 0)
		.map((category) => category.name);
	if (mode === 'points') {
		const earned = categories.reduce((sum, category) => sum + category.earned, 0);
		const possible = categories.reduce((sum, category) => sum + category.possible, 0);
		return { percent: percent(earned, possible), excludedCategories };
	}
	const usable = categories.filter((category) => category.possible > 0 && category.weight > 0);
	const totalWeight = usable.reduce((sum, category) => sum + category.weight, 0);
	if (totalWeight <= 0) return { percent: undefined, excludedCategories };
	const weighted = usable.reduce((sum, category) => {
		const categoryPercent = (category.earned / category.possible) * 100;
		return sum + categoryPercent * category.weight;
	}, 0);
	return { percent: weighted / totalWeight, excludedCategories };
}

function gpaEntry(input: {
	name: string;
	letter: string;
	credits?: number;
	academic?: boolean;
	basis: 'portal' | 'provided' | 'hypothetical';
}): (GpaEnrollment & { basis: string; points: number; weightedPoints: number }) | undefined {
	const letter = input.letter.trim().toUpperCase();
	const points = letterGradePoints(letter, GPA_POLICY);
	if (points === undefined) return undefined;
	const bonus =
		points >= GPA_POLICY.minimumGradePointsForWeight
			? getCourseWeightBonus(input.name, GPA_POLICY)
			: 0;
	return {
		courseName: input.name,
		letter,
		credits: input.credits ?? GPA_POLICY.defaultCredits,
		// Matches the web app's default: without transcript grade-level data the
		// policy minimum keeps every supplied course eligible.
		gradeLevel: GPA_POLICY.minimumGradeLevel,
		excludeFromGpa: false,
		academic: input.academic ?? isAcademicCourse(input.name, GPA_POLICY),
		basis: input.basis,
		points,
		weightedPoints: points + bonus
	};
}

function binaryEnvelope(file: PortalFile) {
	const byteSize = Math.max(
		0,
		Math.floor((file.base64.length * 3) / 4) - (file.base64.match(/=*$/)?.[0].length ?? 0)
	);
	const included = file.base64.length <= MAX_BINARY_BASE64_CHARS;
	return {
		fileName: file.fileName,
		mimeType: file.mimeType,
		byteSize,
		encoding: 'base64',
		included,
		...(included ? { base64: file.base64 } : {}),
		note: included
			? 'Base64 file content. Open in Grademaxxing to view it in the browser.'
			: 'File is too large to return in chat. Open it in Grademaxxing instead.'
	};
}

function imageBlock(file: PortalFile, envelope: { included: boolean }) {
	return file.mimeType.startsWith('image/') && envelope.included
		? [{ data: file.base64, mimeType: file.mimeType }]
		: undefined;
}

function boundMessageText(value: unknown): unknown {
	if (typeof value === 'string' && value.length > MAX_MESSAGE_TEXT_CHARS)
		return `${value.slice(0, MAX_MESSAGE_TEXT_CHARS)}…[truncated]`;
	if (Array.isArray(value)) return value.map(boundMessageText);
	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
				key,
				boundMessageText(entry)
			])
		);
	}
	return value;
}

const optionalReportPeriod = {
	reportPeriod: {
		type: 'integer',
		minimum: 0,
		maximum: 999,
		description:
			'Zero-based reporting-period index from the gradebook catalog. Omit for the current period.'
	}
} as const;

export const mcpTools: ToolDefinition[] = [
	{
		name: 'get_profile',
		title: 'Get connected student profile',
		description:
			'Returns the stable identifier for the connected StudentVUE account. Use this to label or distinguish connections; it makes no portal requests.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: {
				id: { type: 'string' },
				name: { type: 'string' },
				nickname: { type: 'string' }
			},
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		_meta: { 'openai/profile': true },
		handler: async (_args, ctx) => {
			const { username, domain } = ctx.session;
			const id = createHash('sha256')
				.update(`grademaxxing:${domain}:${username}`)
				.digest('hex')
				.slice(0, 32);
			return { id, name: username, nickname: `StudentVUE (${domain})` };
		}
	},
	{
		name: 'get_capabilities',
		title: 'Get API capabilities',
		description:
			'Describes this connector: supported resources, read-only guarantees, and portal resource names. Call first when exploring what is possible.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { readOnly: { type: 'boolean' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async () => ({
			...capabilities,
			transport: 'MCP Streamable HTTP',
			authentication: 'OAuth 2.0 bearer access token bound to the MCP resource',
			readOnly: true,
			notes: [
				'Tools are read-only: nothing here can send mail, edit records, or change grades.',
				'Official portal values are labeled official*; computed values are labeled localCalculations or simulation.'
			]
		})
	},
	{
		name: 'get_gradebook',
		title: 'Get gradebook',
		description:
			'Returns official gradebook data: reporting periods, per-course official marks, categories, and optionally assignments. Defaults to categories without assignments; set includeAssignments for full detail.',
		inputSchema: {
			type: 'object',
			properties: {
				...optionalReportPeriod,
				includeCategories: {
					type: 'boolean',
					default: true,
					description: 'Include official category breakdowns (requires the detailed load).'
				},
				includeAssignments: {
					type: 'boolean',
					default: false,
					description: 'Include per-course assignment lists.'
				},
				assignmentLimit: {
					type: 'integer',
					minimum: 1,
					maximum: 300,
					default: 100,
					description: 'Maximum assignments returned per course when included.'
				}
			},
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: {
				courses: { type: 'array' },
				reportingPeriods: { type: 'array' },
				detailed: { type: 'boolean' }
			},
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const query = gradebookQuery(asObject(rawArgs));
			const gradebook = await fetchGradebook(ctx, query);
			return {
				selectedPeriod: gradebook.selectedPeriod,
				reportingPeriods: gradebook.reportingPeriods,
				detailed: gradebook.detailed !== false,
				courses: gradebook.courses.map((course) =>
					mapCourse(
						course,
						query.includeCategories,
						query.includeAssignments,
						query.assignmentLimit
					)
				),
				...(query.includeAssignments
					? {}
					: { note: 'Set includeAssignments=true for per-course assignment lists.' })
			};
		}
	},
	{
		name: 'get_course',
		title: 'Get one course in detail',
		description:
			'Returns one course with official marks, category breakdowns, and its full assignment list. Use after get_gradebook to pick a courseId.',
		inputSchema: {
			type: 'object',
			properties: {
				courseId: { type: 'string', description: 'Course identifier from get_gradebook.' },
				...optionalReportPeriod,
				assignmentLimit: {
					type: 'integer',
					minimum: 1,
					maximum: 300,
					default: 300,
					description: 'Maximum assignments returned.'
				}
			},
			required: ['courseId'],
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: { course: { type: 'object' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			const courseId = stringArg(args, 'courseId', { required: true })!;
			const limit = integerArg(args, 'assignmentLimit', 1, 300) ?? 300;
			const gradebook = await fetchGradebook(ctx, {
				reportPeriod: integerArg(args, 'reportPeriod', 0, 999),
				includeCategories: true,
				includeAssignments: true,
				assignmentLimit: limit
			});
			return {
				selectedPeriod: gradebook.selectedPeriod,
				course: mapCourse(requireCourse(gradebook, courseId), true, true, limit)
			};
		}
	},
	{
		name: 'get_gradebook_digest',
		title: 'Get gradebook digest',
		description:
			'Compact analysis-ready summary of every course: official marks, category stats, missing/zero indicators, a local trend calculation, and the lowest-scoring work. Cheapest starting point for grade analysis.',
		inputSchema: {
			type: 'object',
			properties: { ...optionalReportPeriod },
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: { courses: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			const gradebook = await fetchGradebook(ctx, {
				reportPeriod: integerArg(args, 'reportPeriod', 0, 999),
				includeCategories: true,
				includeAssignments: true,
				assignmentLimit: 300
			});
			return {
				selectedPeriod: gradebook.selectedPeriod,
				disclaimer:
					'Official marks come from StudentVUE. All other statistics are local calculations from the assignment feed and may miss hidden teacher-managed work.',
				courses: gradebook.courses.map((course) => ({
					id: course.id,
					title: course.title,
					teacher: course.teacher,
					categories: course.categories.map((category) => ({
						name: category.name,
						weight: category.weight,
						points: category.points,
						pointsPossible: category.pointsPossible,
						officialCalculatedMark: category.calculatedMark
					})),
					...digestCourse(course)
				}))
			};
		}
	},
	{
		name: 'calculate_gpa',
		title: 'Calculate GPA',
		description:
			'Computes unweighted, weighted, and academic-weighted GPA using the Grademaxxing GPA policy. With no arguments it reads official letter marks from the current gradebook; pass courses or hypothetical entries to plan scenarios.',
		inputSchema: {
			type: 'object',
			properties: {
				courses: {
					type: 'array',
					maxItems: 100,
					description:
						'Explicit course list to grade instead of the portal gradebook. Omit to use official gradebook marks.',
					items: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							letter: { type: 'string', description: 'Letter grade, e.g. A-, B+.' },
							credits: { type: 'number', minimum: 0 },
							academic: { type: 'boolean' }
						},
						required: ['name', 'letter'],
						additionalProperties: false
					}
				},
				hypothetical: {
					type: 'array',
					maxItems: 100,
					description:
						'Extra planned courses merged into the gradebook result, labeled hypothetical.',
					items: {
						type: 'object',
						properties: {
							name: { type: 'string' },
							letter: { type: 'string' },
							credits: { type: 'number', minimum: 0 },
							academic: { type: 'boolean' }
						},
						required: ['name', 'letter'],
						additionalProperties: false
					}
				}
			},
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: {
				unweighted: { type: ['number', 'null'] },
				weighted: { type: ['number', 'null'] },
				academicWeighted: { type: ['number', 'null'] },
				graded: { type: 'array' }
			},
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			if (args.courses !== undefined && (!Array.isArray(args.courses) || args.courses.length > 100))
				throw new McpToolInputError('courses must be an array of at most 100 entries.');
			if (
				args.hypothetical !== undefined &&
				(!Array.isArray(args.hypothetical) || args.hypothetical.length > 100)
			)
				throw new McpToolInputError('hypothetical must be an array of at most 100 entries.');
			const provided = Array.isArray(args.courses) ? args.courses : undefined;
			const hypothetical = Array.isArray(args.hypothetical) ? args.hypothetical : undefined;
			const basis: 'gradebook' | 'provided' = provided ? 'provided' : 'gradebook';
			const entries: ReturnType<typeof gpaEntry>[] = [];
			if (provided) {
				for (const raw of provided) {
					const entry = readGpaCourse(raw, 'provided');
					if (entry) entries.push(entry);
				}
			} else {
				const gradebook = await fetchGradebook(ctx, {
					includeCategories: false,
					includeAssignments: false,
					assignmentLimit: 1
				});
				for (const course of gradebook.courses) {
					const entry = gpaEntry({ name: course.title, letter: course.score, basis: 'portal' });
					if (entry) entries.push(entry);
				}
			}
			const hypotheticalEntries: ReturnType<typeof gpaEntry>[] = [];
			for (const raw of hypothetical ?? []) {
				const entry = readGpaCourse(raw, 'hypothetical');
				if (entry) hypotheticalEntries.push(entry);
			}
			const all = [...entries, ...hypotheticalEntries].filter(
				(
					entry
				): entry is GpaEnrollment & { basis: string; points: number; weightedPoints: number } =>
					entry !== undefined
			);
			if (all.length === 0)
				return {
					basis,
					unweighted: null,
					weighted: null,
					academicWeighted: null,
					graded: [],
					notes: ['No courses with recognized letter grades were available to grade.']
				};
			const pipelines = calculateGpaPipelines(all, GPA_POLICY);
			return {
				basis,
				policy: GPA_POLICY.label,
				unweighted: round(pipelines.unweighted, 3),
				weighted: round(pipelines.weighted, 3),
				academicWeighted: round(pipelines.academicWeighted, 3),
				attemptedCredits: round(pipelines.attemptedCredits, 2),
				academicCredits: round(pipelines.academicCredits, 2),
				graded: all.map((entry) => ({
					name: entry.courseName,
					letter: entry.letter,
					points: entry.points,
					weightedPoints: entry.weightedPoints,
					credits: entry.credits,
					academic: entry.academic,
					basis: entry.basis
				})),
				notes: [
					`Grade points follow the "${GPA_POLICY.label}" policy used by the Grademaxxing GPA calculator.`,
					...(basis === 'gradebook'
						? ['Courses whose official mark is not a letter grade were skipped.']
						: []),
					...(hypotheticalEntries.length
						? ['Hypothetical entries are planning values, not official records.']
						: [])
				]
			};
		}
	},
	{
		name: 'project_course_grade',
		title: 'Project a course grade (what-if)',
		description:
			'Runs a what-if simulation on one course: add a hypothetical assignment and/or replace an existing score, then returns the projected mark. Results are private simulations, never official values.',
		inputSchema: {
			type: 'object',
			properties: {
				courseId: { type: 'string', description: 'Course identifier from get_gradebook.' },
				...optionalReportPeriod,
				mode: {
					type: 'string',
					enum: ['auto', 'weighted', 'points'],
					default: 'auto',
					description:
						'How to combine categories. auto detects weighting from official category weights.'
				},
				changes: {
					type: 'array',
					minItems: 1,
					maxItems: 20,
					description: 'Score changes to simulate.',
					items: {
						type: 'object',
						properties: {
							type: {
								type: 'string',
								enum: ['add', 'change'],
								description: "'add' creates a new assignment; 'change' replaces an existing score."
							},
							assignmentId: {
								type: 'string',
								description: 'Existing assignment id (required when type is change).'
							},
							name: { type: 'string', description: 'Label for a new assignment.' },
							category: { type: 'string', description: 'Category name for the score.' },
							earned: { type: 'number', minimum: 0, description: 'Points earned.' },
							possible: { type: 'number', exclusiveMinimum: 0, description: 'Points possible.' }
						},
						required: ['type', 'earned', 'possible'],
						additionalProperties: false
					}
				}
			},
			required: ['courseId', 'changes'],
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: {
				official: { type: 'object' },
				simulation: { type: 'object' },
				assumptions: { type: 'array' }
			},
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			const courseId = stringArg(args, 'courseId', { required: true })!;
			const requestedMode = (stringArg(args, 'mode') ?? 'auto') as 'auto' | 'weighted' | 'points';
			if (!['auto', 'weighted', 'points'].includes(requestedMode))
				throw new McpToolInputError('mode must be auto, weighted, or points.');
			const rawChanges = args.changes;
			if (!Array.isArray(rawChanges) || rawChanges.length < 1 || rawChanges.length > 20)
				throw new McpToolInputError('changes must be an array of 1 to 20 entries.');
			const gradebook = await fetchGradebook(ctx, {
				reportPeriod: integerArg(args, 'reportPeriod', 0, 999),
				includeCategories: true,
				includeAssignments: true,
				assignmentLimit: 300
			});
			const course = requireCourse(gradebook, courseId);
			const assumptions: string[] = [];
			const apply = (categories: CategoryState[]) => {
				const replaced = new Set<string>();
				for (const raw of rawChanges) {
					const change = asObject(raw);
					const type = stringArg(change, 'type', { required: true });
					const earned = numberArg(change, 'earned', { required: true })!;
					const possible = numberArg(change, 'possible', { required: true })!;
					if (earned < 0 || possible <= 0)
						throw new McpToolInputError('earned must be >= 0 and possible must be > 0.');
					const categoryHint = stringArg(change, 'category');
					if (type === 'change') {
						const assignmentId = stringArg(change, 'assignmentId', { required: true })!;
						if (replaced.has(assignmentId))
							throw new McpToolInputError('An assignment can only be changed once per simulation.');
						replaced.add(assignmentId);
						const assignment = course.assignments.find(
							(entry) => entry.AssignmentID === assignmentId
						);
						if (!assignment)
							throw new McpToolInputError(
								`No assignment "${assignmentId}" in this course. Use get_course to list ids.`
							);
						const parsed = parseAssignment(assignment);
						if (parsed.earned === undefined || parsed.possible === undefined)
							throw new McpToolInputError(
								`Assignment "${assignmentId}" has no parseable current score to replace.`
							);
						if (
							categoryHint &&
							categoryHint.trim().toLowerCase() !== parsed.category.trim().toLowerCase()
						)
							throw new McpToolInputError('Changing an assignment category is not supported.');
						const target = resolveCategory(categories, parsed.category, course, assumptions);
						if (target) {
							target.earned += earned - parsed.earned;
							target.possible += possible - parsed.possible;
						}
					} else if (type === 'add') {
						const target = resolveCategory(categories, categoryHint, course, assumptions);
						if (target) {
							target.earned += earned;
							target.possible += possible;
						}
					} else {
						throw new McpToolInputError("change type must be 'add' or 'change'.");
					}
				}
				return categories;
			};

			const base = buildCategoryStates(course);
			if (base.length === 0) {
				const totals = course.assignments.map(parseAssignment).reduce(
					(state, assignment) => ({
						earned: state.earned + (assignment.earned ?? 0),
						possible: state.possible + (assignment.possible ?? 0)
					}),
					{ earned: 0, possible: 0 }
				);
				base.push({ name: 'All work', ...totals, weight: 100 });
				assumptions.push(
					'The portal reported no categories, so the simulation uses total points across all assignments.'
				);
			}
			const mode = pickMode(requestedMode, base);
			const before = computeMark(
				mode,
				base.map((category) => ({ ...category }))
			);
			const projectedCategories = apply(base.map((category) => ({ ...category })));
			const after = computeMark(mode, projectedCategories);
			if (after.percent === undefined)
				throw new McpToolExecutionError(
					'The course has no gradable points to simulate.',
					'NOT_SIMULABLE'
				);
			const afterLetter = estimateHypotheticalLetter(after.percent, []);
			return {
				course: { id: course.id, title: course.title },
				official: {
					letter: course.score,
					percentage: course.scoreRaw,
					source: 'StudentVUE official mark'
				},
				simulation: {
					mode,
					modeRequested: requestedMode,
					beforePercent: round(before.percent),
					afterPercent: round(after.percent),
					deltaPercent: before.percent !== undefined ? round(after.percent - before.percent) : null,
					estimatedLetter: afterLetter
						? { letter: afterLetter.letter, basis: afterLetter.basis }
						: null,
					categories: projectedCategories.map((category) => ({
						name: category.name,
						earned: round(category.earned, 2),
						possible: round(category.possible, 2),
						percent: round(percent(category.earned, category.possible)),
						weight: category.weight
					}))
				},
				assumptions: [
					...assumptions,
					...(before.excludedCategories.length
						? [
								`Categories without points yet were excluded: ${before.excludedCategories.join(', ')}.`
							]
						: []),
					...(after.excludedCategories.length
						? [
								`Categories without points yet were excluded: ${after.excludedCategories.join(', ')}.`
							]
						: []),
					'The letter estimate uses a standard plus/minus scale because per-class observed scales are stored only in the browser.',
					'Hidden assignments, drop rules, and teacher-managed rounding may make the real result differ.'
				],
				disclaimer:
					'Simulation only. The official mark above is the real StudentVUE value; never present a simulation as an official grade.'
			};
		}
	},
	{
		name: 'get_attendance',
		title: 'Get attendance',
		description:
			'Returns the attendance record: normalized daily statuses (present/absent/tardy, with future days and weekends excluded), reported absences, per-course totals, and raw calendar days.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { dailyStatuses: { type: 'array' }, courseTotals: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => {
			const details = await portal(ctx, () => ctx.session.client.attendanceDetails());
			const normalized = adaptAttendance(details);
			const totalsByType = normalized as unknown as Record<
				string,
				{ PeriodTotal: Array<{ _Total: string }> }
			>;
			const sumTotals = (key: string) =>
				totalsByType[key]?.PeriodTotal?.reduce(
					(total, entry) => total + (Number(entry._Total) || 0),
					0
				) ?? 0;
			return {
				schoolName: details.schoolName ?? normalized._SchoolName ?? '',
				dailyStatuses: normalized.DailyRecords,
				reportedAbsences: normalized.Absences.Absence,
				courseTotals: normalized.CourseTotals,
				totals: {
					excused: sumTotals('TotalExcused'),
					tardies: sumTotals('TotalTardies'),
					unexcused: sumTotals('TotalUnexcused')
				},
				periodEvents: details.periods,
				calendarDays: details.days,
				note: 'StudentVUE attendance is exception-based: ordinary past days are implicitly present, and future/weekend cells are never marked present.'
			};
		}
	},
	{
		name: 'get_calendar',
		title: 'Get school calendar',
		description:
			'Returns school calendar events. month and year must be supplied together; omit both for the default window.',
		inputSchema: {
			type: 'object',
			properties: {
				month: { type: 'integer', minimum: 1, maximum: 12 },
				year: { type: 'integer', minimum: 2000, maximum: 2200 }
			},
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: { events: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			const month = integerArg(args, 'month', 1, 12);
			const year = integerArg(args, 'year', 2000, 2200);
			if ((month === undefined) !== (year === undefined))
				throw new McpToolInputError('month and year must be supplied together.');
			return portal(ctx, () => ctx.session.client.calendar(month, year));
		}
	},
	{
		name: 'get_schedule',
		title: 'Get class schedule',
		description: 'Returns the daily class schedule with periods, rooms, teachers, and times.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { classes: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => portal(ctx, () => ctx.session.client.schedule())
	},
	{
		name: 'list_documents',
		title: 'List documents',
		description:
			'Lists StudentVUE documents (report cards, forms, letters) with ids for get_document.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { documents: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => {
			const documents = await portal(ctx, () => ctx.session.client.documents());
			return { count: documents.length, documents };
		}
	},
	{
		name: 'get_document',
		title: 'Download a document',
		description:
			'Returns one document as base64 with metadata. Small images are also returned as a viewable image block. Large files are metadata-only.',
		inputSchema: {
			type: 'object',
			properties: {
				documentId: { type: 'string', description: 'Document id from list_documents.' }
			},
			required: ['documentId'],
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: { fileName: { type: 'string' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const documentId = stringArg(asObject(rawArgs), 'documentId', {
				required: true,
				maxLength: 1_024
			})!;
			const file = await portal(ctx, () => ctx.session.client.document(documentId));
			const envelope = binaryEnvelope(file);
			return new McpToolResult({ ...envelope, documentId }, imageBlock(file, envelope));
		}
	},
	{
		name: 'get_report_cards',
		title: 'Get report cards',
		description:
			'Returns official report-card/transcript marks plus report-card document downloads.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: { type: 'object', properties: { transcript: {} }, additionalProperties: true },
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => portal(ctx, () => ctx.session.client.reportCards())
	},
	{
		name: 'get_student_profile',
		title: 'Get student information',
		description:
			'Returns official student information fields: name, perm id, grade, gender, and district-provided fields.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { fields: { type: 'object' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => {
			const info = await portal(ctx, () => ctx.session.client.studentInfo());
			return {
				name: info.name,
				permId: info.permId,
				grade: info.grade,
				gender: info.gender,
				fields: info.fields
			};
		}
	},
	{
		name: 'get_student_photo',
		title: 'Get student photo',
		description:
			'Returns the StudentVUE profile photo as a viewable image block when the district provides one.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { available: { type: 'boolean' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => {
			const info = await portal(ctx, () => ctx.session.client.studentInfo());
			if (!info.photo)
				return {
					available: false,
					note: 'StudentVUE does not provide a profile photo for this account.'
				};
			const envelope = binaryEnvelope(info.photo);
			return new McpToolResult({ available: true, ...envelope }, imageBlock(info.photo, envelope));
		}
	},
	{
		name: 'get_school_info',
		title: 'Get school information',
		description:
			'Returns school contact information: name, principal, address, phone, fax, and website.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { fields: { type: 'object' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => portal(ctx, () => ctx.session.client.schoolInfo())
	},
	{
		name: 'list_mail_folders',
		title: 'List mail folders',
		description:
			'Lists StudentVUE mail folders (Inbox, Sent, Drafts, …) with folder ids for list_mail.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		outputSchema: {
			type: 'object',
			properties: { folders: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (_args, ctx) => {
			const folders = await portal(ctx, () => ctx.session.client.folders());
			return { count: folders.length, folders: folders.slice(0, 50) };
		}
	},
	{
		name: 'list_mail',
		title: 'List mail messages',
		description:
			'Returns message previews (id, subject, sender, date, read state, attachment names) for one folder. Defaults to the inbox.',
		inputSchema: {
			type: 'object',
			properties: {
				folderId: {
					type: 'string',
					description: 'Folder id from list_mail_folders. Omit for the inbox.'
				},
				folderType: {
					type: 'integer',
					minimum: 0,
					maximum: 64,
					description: 'Folder type from list_mail_folders.'
				},
				limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
			},
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: { messages: { type: 'array' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			const folderId = stringArg(args, 'folderId', { maxLength: 128 }) ?? null;
			const folderType = integerArg(args, 'folderType', 0, 64) ?? 0;
			const limit = integerArg(args, 'limit', 1, 100) ?? 50;
			const records = await portal(ctx, () => ctx.session.client.messages(folderId, folderType));
			const messages = records.slice(0, limit).map((record) => {
				const attachments = Array.isArray(record.attachments) ? record.attachments : [];
				const from = record.from as { contactDetails1?: unknown } | undefined;
				return {
					id: String(record.messagePersonId ?? record.messageId ?? ''),
					messageId: String(record.messageId ?? ''),
					subject: typeof record.subject === 'string' ? record.subject : '',
					from: typeof from?.contactDetails1 === 'string' ? from.contactDetails1 : '',
					sentAt: typeof record.sendDateTime === 'string' ? record.sendDateTime : '',
					sentLabel:
						typeof record.sendDateTimeFormattedShort === 'string'
							? record.sendDateTimeFormattedShort
							: typeof record.sendDateTimeFormattedLong === 'string'
								? record.sendDateTimeFormattedLong
								: '',
					read: record.mailRead === true || String(record.mailRead).toLowerCase() === 'true',
					isSystemMessage: Boolean(record.isSystemMessage),
					attachments: attachments.flatMap((attachment) => {
						if (!attachment || typeof attachment !== 'object') return [];
						const item = attachment as Record<string, unknown>;
						return typeof item.attachmentId === 'string' && typeof item.name === 'string'
							? [{ id: item.attachmentId, name: item.name }]
							: [];
					}),
					preview: typeof record.messageText === 'string' ? record.messageText.slice(0, 400) : ''
				};
			});
			return {
				folder: { id: folderId, type: folderType },
				count: messages.length,
				messages,
				...(records.length > limit
					? { note: `${records.length} messages match; showing ${limit}.` }
					: {})
			};
		}
	},
	{
		name: 'get_message',
		title: 'Read one mail message',
		description:
			'Returns the full content of one StudentVUE message: sender, recipients, body text, and attachments.',
		inputSchema: {
			type: 'object',
			properties: {
				messageId: { type: 'string', description: 'Message id from list_mail.' },
				system: {
					type: 'boolean',
					default: false,
					description: 'True for system/broadcast messages.'
				}
			},
			required: ['messageId'],
			additionalProperties: false
		},
		outputSchema: { type: 'object', properties: { message: {} }, additionalProperties: true },
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const args = asObject(rawArgs);
			const messageId = stringArg(args, 'messageId', { required: true, maxLength: 128 })!;
			const system = booleanArg(args, 'system', false);
			const detail = await portal(ctx, () => ctx.session.client.messageDetails(messageId, system));
			return { message: boundMessageText(detail) };
		}
	},
	{
		name: 'get_mail_attachment',
		title: 'Download a mail attachment',
		description:
			'Returns one mail attachment as base64 with metadata. Small images are also returned as a viewable image block.',
		inputSchema: {
			type: 'object',
			properties: {
				attachmentId: {
					type: 'string',
					description: 'Attachment id from list_mail or get_message.'
				}
			},
			required: ['attachmentId'],
			additionalProperties: false
		},
		outputSchema: {
			type: 'object',
			properties: { fileName: { type: 'string' } },
			additionalProperties: true
		},
		annotations: { readOnlyHint: true, openWorldHint: true },
		handler: async (rawArgs, ctx) => {
			const attachmentId = stringArg(asObject(rawArgs), 'attachmentId', {
				required: true,
				maxLength: 128
			})!;
			const file = await portal(ctx, () => ctx.session.client.attachment(attachmentId));
			const envelope = binaryEnvelope(file);
			return new McpToolResult({ ...envelope, attachmentId }, imageBlock(file, envelope));
		}
	}
];

function readGpaCourse(raw: unknown, basis: 'provided' | 'hypothetical') {
	const course = asObject(raw);
	const name = stringArg(course, 'name', { required: true, maxLength: 200 })!;
	const letter = stringArg(course, 'letter', { required: true, maxLength: 4 })!;
	const credits = numberArg(course, 'credits');
	if (credits !== undefined && (credits < 0 || credits > 40))
		throw new McpToolInputError('credits must be between 0 and 40.');
	return gpaEntry({
		name,
		letter,
		credits,
		academic: typeof course.academic === 'boolean' ? course.academic : undefined,
		basis
	});
}

function resolveCategory(
	categories: CategoryState[],
	hint: string | undefined,
	course: PortalCourse,
	assumptions: string[]
): CategoryState | undefined {
	// The synthetic total-points bucket absorbs every change regardless of hints.
	if (categories.length === 1 && categories[0]!.name === 'All work') return categories[0];
	const trimmed = hint?.trim();
	if (trimmed) {
		const match = categories.find(
			(category) => category.name.toLowerCase() === trimmed.toLowerCase()
		);
		if (!match)
			throw new McpToolInputError(
				`No category "${trimmed}". Available: ${categories.map((category) => category.name).join(', ')}.`
			);
		return match;
	}
	if (categories.length === 1) return categories[0];
	if (categories.length === 0) {
		assumptions.push('The portal reported no categories; totals were tracked across all work.');
		return undefined;
	}
	throw new McpToolInputError(
		`A category is required. Available: ${categories.map((category) => category.name).join(', ')}.`
	);
}

export const mcpToolByName = new Map(mcpTools.map((tool) => [tool.name, tool]));
