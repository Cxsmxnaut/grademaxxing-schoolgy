/**
 * JSON-RPC / MCP protocol dispatcher for the Grademaxxing connector.
 *
 * Transport-agnostic: the route layer handles HTTP, authentication, and 401
 * challenges; this module turns one JSON-RPC message into a response. It
 * supports the initialize-based handshake (2025-06-18 / 2025-11-25) as well as
 * the stateless 2026-07-28 shape (`server/discover`, no session id) so current
 * and upcoming ChatGPT/Claude clients can both connect.
 */
import { MCP_SERVER_NAME, MCP_SERVER_TITLE, MCP_SERVER_VERSION } from '$lib/server/mcp/metadata';
import { buildPrompt, mcpPrompts } from './prompts';
import { McpResourceNotFoundError, mcpResources, readMcpResource } from './resources';
import {
	McpAuthRequiredError,
	McpToolInputError,
	McpToolResult,
	mcpToolByName,
	toToolFailure,
	type ToolContext,
	type ToolDefinition
} from './tools';

const INITIALIZE_VERSIONS = ['2025-11-25', '2025-06-18'];
const ACCEPTED_PROTOCOL_VERSIONS = [
	'2026-07-28',
	'2025-11-25',
	'2025-06-18',
	'2025-03-26',
	'2024-11-05'
];
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

const INSTRUCTIONS = [
	"Grademaxxing MCP: read-only access to one student's StudentVUE records.",
	'Start with get_gradebook_digest for grades, then drill into get_course, project_course_grade, or calculate_gpa as needed.',
	'Official StudentVUE values are labeled official*; everything else is a local calculation or simulation and must be presented that way.',
	'This connector cannot send mail, change records, or modify grades. If a request needs write access, say so instead of improvising.',
	'If tools report an expired connection, ask the user to reconnect the connector so they can sign in to StudentVUE again.'
].join(' ');

type RpcId = string | number | null;
type RpcResponse = {
	jsonrpc: '2.0';
	id: RpcId;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
};

export class McpProtocolError extends Error {
	constructor(
		readonly code: number,
		message: string,
		readonly data?: unknown
	) {
		super(message);
		this.name = 'McpProtocolError';
	}
}

export function isSupportedProtocolVersion(header: string | null) {
	if (header === null || header === '') return true;
	return ACCEPTED_PROTOCOL_VERSIONS.includes(header);
}

export function serverCapabilities() {
	return {
		tools: {},
		resources: {},
		prompts: {}
	};
}

function serverInfo() {
	return { name: MCP_SERVER_NAME, title: MCP_SERVER_TITLE, version: MCP_SERVER_VERSION };
}

function result(id: RpcId, value: unknown): RpcResponse {
	return { jsonrpc: '2.0', id, result: value };
}

function error(id: RpcId, code: number, message: string, data?: unknown): RpcResponse {
	return {
		jsonrpc: '2.0',
		id,
		error: { code, message, ...(data === undefined ? {} : { data }) }
	};
}

function serializedTools() {
	return [...mcpToolByName.values()].map(serializeTool);
}

function serializeTool(tool: ToolDefinition) {
	return {
		name: tool.name,
		title: tool.title,
		description: tool.description,
		inputSchema: tool.inputSchema,
		outputSchema: tool.outputSchema,
		annotations: tool.annotations,
		...(tool._meta ? { _meta: tool._meta } : {})
	};
}

function asParamsObject(params: unknown): Record<string, unknown> {
	if (params === undefined || params === null) return {};
	if (typeof params !== 'object' || Array.isArray(params))
		throw new McpProtocolError(-32602, 'Invalid params: expected an object.');
	return params as Record<string, unknown>;
}

function requireString(params: Record<string, unknown>, name: string): string {
	const value = params[name];
	if (typeof value !== 'string' || !value)
		throw new McpProtocolError(-32602, `Invalid params: ${name} is required.`);
	return value;
}

/**
 * Handle one JSON-RPC message. Returns null for notifications (HTTP 202 with
 * no body). Throws McpAuthRequiredError when the portal session died mid-call
 * so the route can answer 401 and trigger re-authorization.
 */
export async function handleMcpMessage(
	message: unknown,
	ctx: ToolContext
): Promise<RpcResponse | null> {
	if (!message || typeof message !== 'object' || Array.isArray(message))
		throw new McpProtocolError(-32600, 'Invalid Request.');
	const request = message as Record<string, unknown>;
	if (request.jsonrpc !== '2.0' || typeof request.method !== 'string')
		throw new McpProtocolError(-32600, 'Invalid Request.');
	const isNotification = !('id' in request);
	const id: RpcId = isNotification
		? null
		: typeof request.id === 'string' || typeof request.id === 'number' || request.id === null
			? request.id
			: (() => {
					throw new McpProtocolError(
						-32600,
						'Invalid Request: id must be a string, number, or null.'
					);
				})();
	const method = request.method;
	try {
		const value = await dispatch(method, request.params, ctx);
		if (isNotification) return null;
		return result(id, value);
	} catch (cause) {
		if (cause instanceof McpAuthRequiredError) throw cause;
		if (cause instanceof McpProtocolError) {
			if (isNotification) return null;
			return error(id, cause.code, cause.message, cause.data);
		}
		// Never leak internals or student data into protocol errors.
		console.warn('MCP request failed', {
			method,
			errorName: cause instanceof Error ? cause.name : typeof cause
		});
		if (isNotification) return null;
		return error(id, -32603, 'Internal error.');
	}
}

async function dispatch(method: string, rawParams: unknown, ctx: ToolContext): Promise<unknown> {
	switch (method) {
		case 'initialize': {
			const params = asParamsObject(rawParams);
			const requested = typeof params.protocolVersion === 'string' ? params.protocolVersion : '';
			return {
				protocolVersion: INITIALIZE_VERSIONS.includes(requested)
					? requested
					: DEFAULT_PROTOCOL_VERSION,
				capabilities: serverCapabilities(),
				serverInfo: serverInfo(),
				instructions: INSTRUCTIONS
			};
		}
		case 'server/discover':
			// 2026-07-28 stateless discovery replaces the initialize handshake.
			return {
				resultType: 'complete',
				supportedVersions: ACCEPTED_PROTOCOL_VERSIONS,
				capabilities: serverCapabilities(),
				serverInfo: serverInfo(),
				instructions: INSTRUCTIONS
			};
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: serializedTools() };
		case 'tools/call':
			return callTool(asParamsObject(rawParams), ctx);
		case 'resources/list':
			return { resources: mcpResources };
		case 'resources/templates/list':
			return { resourceTemplates: [] };
		case 'resources/read': {
			const params = asParamsObject(rawParams);
			const uri = requireString(params, 'uri');
			try {
				return await readMcpResource(uri, ctx);
			} catch (cause) {
				if (cause instanceof McpResourceNotFoundError)
					throw new McpProtocolError(-32602, cause.message);
				if (cause instanceof McpToolInputError) throw new McpProtocolError(-32602, cause.message);
				if (cause instanceof McpAuthRequiredError) throw cause;
				const failure = toToolFailure(cause);
				throw new McpProtocolError(-32000, failure.message, { code: failure.code });
			}
		}
		case 'prompts/list':
			return {
				prompts: mcpPrompts.map((prompt) => ({
					name: prompt.name,
					title: prompt.title,
					description: prompt.description,
					arguments: prompt.arguments
				}))
			};
		case 'prompts/get': {
			const params = asParamsObject(rawParams);
			const name = requireString(params, 'name');
			const rawArgs = params.arguments === undefined ? {} : params.arguments;
			if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs))
				throw new McpProtocolError(-32602, 'Invalid params: arguments must be an object.');
			const prompt = buildPrompt(
				name,
				Object.fromEntries(
					Object.entries(rawArgs as Record<string, unknown>).map(([key, value]) => [
						key,
						typeof value === 'string' ? value : ''
					])
				)
			);
			if (!prompt)
				throw new McpProtocolError(-32602, `Unknown prompt or missing required argument: ${name}`);
			return prompt;
		}
		case 'logging/setLevel':
			return {};
		case 'notifications/initialized':
		case 'notifications/cancelled':
		case 'notifications/roots/list_changed':
			return {};
		default:
			throw new McpProtocolError(-32601, `Method not found: ${method}`);
	}
}

async function callTool(params: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
	const name = requireString(params, 'name');
	const tool = mcpToolByName.get(name);
	if (!tool) throw new McpProtocolError(-32602, `Unknown tool: ${name}`);
	const rawArgs = params.arguments === undefined ? {} : params.arguments;
	if (!rawArgs || typeof rawArgs !== 'object' || Array.isArray(rawArgs))
		throw new McpProtocolError(-32602, 'Invalid params: arguments must be an object.');
	let outcome: unknown;
	try {
		outcome = await tool.handler(rawArgs, ctx);
	} catch (cause) {
		if (cause instanceof McpAuthRequiredError) throw cause;
		if (cause instanceof McpToolInputError) throw new McpProtocolError(-32602, cause.message);
		const failure = toToolFailure(cause);
		return {
			content: [
				{ type: 'text', text: JSON.stringify({ code: failure.code, message: failure.message }) }
			],
			structuredContent: { code: failure.code, message: failure.message },
			isError: true
		};
	}
	const images = outcome instanceof McpToolResult ? (outcome.images ?? []) : [];
	const structured = outcome instanceof McpToolResult ? outcome.structured : outcome;
	return {
		content: [
			...images.map((image) => ({ type: 'image', data: image.data, mimeType: image.mimeType })),
			{ type: 'text', text: JSON.stringify(structured) }
		],
		structuredContent: structured
	};
}

/**
 * Entry point for one HTTP POST body: single message, batch, or notification.
 * Returns null when the correct HTTP response is 202 Accepted with no body.
 */
export async function handleMcpPayload(
	payload: unknown,
	ctx: ToolContext
): Promise<RpcResponse | RpcResponse[] | null> {
	if (Array.isArray(payload)) {
		if (payload.length === 0) throw new McpProtocolError(-32600, 'Invalid Request: empty batch.');
		if (payload.length > 20)
			throw new McpProtocolError(-32600, 'Invalid Request: batch exceeds 20 messages.');
		const responses: RpcResponse[] = [];
		for (const entry of payload) {
			try {
				const response = await handleMcpMessage(entry, ctx);
				if (response) responses.push(response);
			} catch (cause) {
				if (cause instanceof McpAuthRequiredError) throw cause;
				responses.push(error(null, -32600, 'Invalid Request.'));
			}
		}
		return responses.length > 0 ? responses : null;
	}
	return handleMcpMessage(payload, ctx);
}
