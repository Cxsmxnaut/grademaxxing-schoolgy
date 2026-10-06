/**
 * MCP resources: the same read-only StudentVUE datasets addressable as URIs so
 * hosts can list/read them directly. Each resource delegates to the shared tool
 * fetchers so tools and resources can never disagree about data shape.
 */
import { McpToolResult, mcpToolByName, type ToolContext } from './tools';

export type McpResource = {
	uri: string;
	name: string;
	title: string;
	description: string;
	mimeType: string;
};

export class McpResourceNotFoundError extends Error {
	constructor(uri: string) {
		super(`Unknown resource: ${uri}`);
		this.name = 'McpResourceNotFoundError';
	}
}

type ResourceRoute = {
	name: string;
	title: string;
	description: string;
	tool: string;
	args?: (params: URLSearchParams) => Record<string, unknown>;
};

const routes: ResourceRoute[] = [
	{
		name: 'capabilities',
		title: 'API capabilities',
		description: 'Machine-readable inventory of supported StudentVUE resources and guarantees.',
		tool: 'get_capabilities'
	},
	{
		name: 'gradebook',
		title: 'Gradebook',
		description:
			'Official gradebook data. Add ?reportPeriod=N for a specific period and ?includeAssignments=1 for assignment lists.',
		tool: 'get_gradebook',
		args: (params) => gradebookArgs(params)
	},
	{
		name: 'attendance',
		title: 'Attendance',
		description: 'Normalized attendance record: daily statuses, absences, and course totals.',
		tool: 'get_attendance'
	},
	{
		name: 'calendar',
		title: 'School calendar',
		description: 'Calendar events. Add ?month=N&year=YYYY to target one month.',
		tool: 'get_calendar',
		args: (params) => {
			const month = integer(params.get('month'));
			const year = integer(params.get('year'));
			return {
				...(month !== undefined ? { month } : {}),
				...(year !== undefined ? { year } : {})
			};
		}
	},
	{
		name: 'schedule',
		title: 'Class schedule',
		description: 'Daily class schedule with rooms, teachers, and times.',
		tool: 'get_schedule'
	},
	{
		name: 'student-info',
		title: 'Student information',
		description: 'Official student information fields from StudentVUE.',
		tool: 'get_student_profile'
	},
	{
		name: 'school-info',
		title: 'School information',
		description: 'School contact information.',
		tool: 'get_school_info'
	},
	{
		name: 'documents',
		title: 'Documents',
		description: 'Document list with ids for download through the get_document tool.',
		tool: 'list_documents'
	},
	{
		name: 'report-cards',
		title: 'Report cards',
		description: 'Official report-card marks and report-card documents.',
		tool: 'get_report_cards'
	},
	{
		name: 'mailbox',
		title: 'Mail inbox',
		description: 'Message previews for the inbox. Use the list_mail tool for other folders.',
		tool: 'list_mail',
		args: (params) => {
			const limit = integer(params.get('limit'));
			return limit === undefined ? {} : { limit };
		}
	}
];

function integer(value: string | null) {
	return value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
}

function gradebookArgs(params: URLSearchParams) {
	const reportPeriod = integer(params.get('reportPeriod'));
	return {
		...(reportPeriod !== undefined ? { reportPeriod } : {}),
		includeCategories: true,
		includeAssignments: params.get('includeAssignments') === '1'
	};
}

export const mcpResources: McpResource[] = routes.map((route) => ({
	uri: `studentvue://${route.name}`,
	name: route.name,
	title: route.title,
	description: route.description,
	mimeType: 'application/json'
}));

export async function readMcpResource(uri: string, ctx: ToolContext) {
	let parsed: URL;
	try {
		parsed = new URL(uri);
	} catch {
		throw new McpResourceNotFoundError(uri);
	}
	if (parsed.protocol !== 'studentvue:') throw new McpResourceNotFoundError(uri);
	const name = parsed.host || parsed.pathname.replace(/^\/+/, '');
	const route = routes.find((entry) => entry.name === name);
	if (!route) throw new McpResourceNotFoundError(uri);
	const tool = mcpToolByName.get(route.tool);
	if (!tool) throw new McpResourceNotFoundError(uri);
	const args = route.args?.(parsed.searchParams) ?? {};
	const result = await tool.handler(args, ctx);
	const data = result instanceof McpToolResult ? result.structured : result;
	return {
		contents: [
			{
				uri,
				mimeType: 'application/json',
				text: JSON.stringify(data ?? {})
			}
		]
	};
}
