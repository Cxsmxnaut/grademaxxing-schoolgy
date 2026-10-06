import { renderAuthorizeErrorPage, renderAuthorizePage } from '$lib/server/mcp/authorize-page';
import { mcpResource } from '$lib/server/mcp/metadata';
import {
	type AuthorizeRequest,
	consumeAttempt,
	issueAuthorizationCode,
	validateAuthorizeParams
} from '$lib/server/mcp/oauth';
import { Pxp2AuthenticationError, Pxp2InputError, Pxp2TimeoutError } from '$lib/server/pxp2';
import {
	createStudentSession,
	StudentSessionCapacityError,
	StudentSessionConfigurationError
} from '$lib/server/student-session';
import type { RequestHandler } from './$types';

const MAX_FORM_BYTES = 16 * 1024;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS_PER_IP_AND_ACCOUNT = 8;
const MAX_ATTEMPTS_PER_ACCOUNT = 20;
const MAX_ATTEMPTS_PER_IP = 50;
const attempts = new Map<string, { count: number; resetAt: number }>();

const AUTH_CSP = [
	"default-src 'none'",
	"style-src 'unsafe-inline'",
	"img-src 'self'",
	"form-action 'self'",
	"base-uri 'none'",
	"frame-ancestors 'none'"
].join('; ');

function html(body: string, status: number): Response {
	return new Response(body, {
		status,
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Content-Security-Policy': AUTH_CSP,
			'Cache-Control': 'private, no-store, max-age=0',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'no-referrer'
		}
	});
}

function redirect(location: string): Response {
	return new Response(null, { status: 302, headers: { Location: location } });
}

function safeClientAddress(getClientAddress: () => string) {
	try {
		return getClientAddress().slice(0, 128);
	} catch {
		return 'local';
	}
}

function hiddenFields(request: AuthorizeRequest, params: URLSearchParams): Array<[string, string]> {
	const fields: Array<[string, string]> = [
		['client_id', request.clientId],
		['redirect_uri', request.redirectUri],
		['response_type', 'code'],
		['code_challenge', request.challenge],
		['code_challenge_method', 'S256'],
		['resource', request.resource]
	];
	if (request.state) fields.push(['state', request.state]);
	if (params.has('scope')) fields.push(['scope', params.get('scope')!]);
	if (params.has('nonce')) fields.push(['nonce', params.get('nonce')!]);
	return fields;
}

function errorRedirect(
	request: AuthorizeRequest,
	params: URLSearchParams,
	code: string,
	description: string
) {
	const target = new URL(request.redirectUri);
	target.searchParams.set('error', code);
	target.searchParams.set('error_description', description);
	if (request.state) target.searchParams.set('state', request.state);
	if (params.has('scope')) target.searchParams.set('scope', params.get('scope')!);
	// RFC 9207 issuer identification; ChatGPT verifies this before exchanging.
	target.searchParams.set('iss', new URL(request.resource).origin);
	return redirect(target.toString());
}

function invalidRequestPage(detail: string) {
	return html(
		renderAuthorizeErrorPage({
			status: 400,
			title: 'This connection link is not valid',
			detail
		}),
		400
	);
}

export const GET: RequestHandler = ({ url }) => {
	const params = url.searchParams;
	const validation = validateAuthorizeParams(params, url.origin, mcpResource(url.origin));
	if (!validation.ok) {
		const redirectUri = params.get('redirect_uri') ?? '';
		if (validation.redirectable && redirectUri) {
			const synthetic: AuthorizeRequest = {
				clientId: params.get('client_id') ?? '',
				client: { clientId: '', redirectUris: [redirectUri], name: '', issuedAt: 0 },
				redirectUri,
				challenge: params.get('code_challenge') ?? '',
				resource: mcpResource(url.origin),
				scopes: [],
				...(params.get('state') ? { state: params.get('state')! } : {})
			};
			return errorRedirect(synthetic, params, validation.error, validation.errorDescription);
		}
		return invalidRequestPage(validation.errorDescription);
	}
	return html(
		renderAuthorizePage({
			clientName: validation.request.client.name,
			actionPath: '/mcp/authorize',
			hiddenFields: hiddenFields(validation.request, params)
		}),
		200
	);
};

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim();
	if (contentType !== 'application/x-www-form-urlencoded')
		return html(
			renderAuthorizeErrorPage({
				status: 415,
				title: 'Unexpected form format',
				detail: 'The sign-in form must post as application/x-www-form-urlencoded.'
			}),
			415
		);
	const origin = request.headers.get('origin');
	const fetchSite = request.headers.get('sec-fetch-site');
	if ((origin && origin !== url.origin) || fetchSite === 'cross-site')
		return html(
			renderAuthorizeErrorPage({
				status: 403,
				title: 'Cross-site request blocked',
				detail: 'Sign in directly from this page.'
			}),
			403
		);
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > MAX_FORM_BYTES)
		return html(
			renderAuthorizeErrorPage({
				status: 413,
				title: 'Request too large',
				detail: 'The form submission exceeded the size limit.'
			}),
			413
		);
	const params = new URLSearchParams(raw);
	const validation = validateAuthorizeParams(params, url.origin, mcpResource(url.origin));
	if (!validation.ok) {
		if (validation.redirectable)
			return errorRedirect(
				{
					clientId: params.get('client_id') ?? '',
					client: { clientId: '', redirectUris: [], name: '', issuedAt: 0 },
					redirectUri: params.get('redirect_uri') ?? '',
					challenge: params.get('code_challenge') ?? '',
					resource: mcpResource(url.origin),
					scopes: [],
					...(params.get('state') ? { state: params.get('state')! } : {})
				},
				params,
				validation.error,
				validation.errorDescription
			);
		return invalidRequestPage(validation.errorDescription);
	}

	const domain = (params.get('domain') ?? '').trim();
	const username = (params.get('username') ?? '').trim();
	const password = params.get('password') ?? '';
	const clientAddress = safeClientAddress(getClientAddress);
	const accountKey = `${domain.toLowerCase()}:${username.toLowerCase()}`;
	const renderForm = (status: number, message: string) =>
		html(
			renderAuthorizePage({
				clientName: validation.request.client.name,
				actionPath: '/mcp/authorize',
				hiddenFields: hiddenFields(validation.request, params),
				district: domain,
				username,
				error: { status, message }
			}),
			status
		);

	if (
		!domain ||
		domain.length > 253 ||
		!username ||
		username.length > 254 ||
		!password ||
		password.length > 1024
	) {
		return renderForm(400, 'Enter your district StudentVUE URL, username, and password.');
	}
	// Mirrors the web sign-in limiter so the OAuth screen cannot become an
	// unauthenticated guess oracle for StudentVUE credentials.
	const limit = (key: string, maximum: number) => consumeAttempt(attempts, key, maximum, WINDOW_MS);
	if (
		!limit(`pair:${clientAddress}:${accountKey}`, MAX_ATTEMPTS_PER_IP_AND_ACCOUNT) ||
		!limit(`account:${accountKey}`, MAX_ATTEMPTS_PER_ACCOUNT) ||
		!limit(`ip:${clientAddress}`, MAX_ATTEMPTS_PER_IP)
	)
		return renderForm(
			429,
			'Too many failed sign-in attempts. Please wait ten minutes and try again.'
		);

	let session;
	try {
		session = await createStudentSession(domain, username, password);
	} catch (cause) {
		if (cause instanceof Pxp2AuthenticationError)
			return renderForm(
				401,
				'StudentVUE sign-in failed. Check your district URL, username, and password.'
			);
		if (cause instanceof Pxp2InputError)
			return renderForm(400, cause.message || 'That district URL is not valid.');
		if (cause instanceof Pxp2TimeoutError)
			return renderForm(504, 'StudentVUE took too long to respond. Please try again.');
		if (
			cause instanceof StudentSessionCapacityError ||
			cause instanceof StudentSessionConfigurationError
		)
			return renderForm(503, 'The sign-in service is busy. Please try again shortly.');
		console.warn('MCP sign-in failure', {
			errorName: cause instanceof Error ? cause.name : typeof cause
		});
		return renderForm(502, 'StudentVUE sign-in failed. Please try again.');
	}

	let code: string;
	try {
		code = issueAuthorizationCode(validation.request, session.token);
	} catch (cause) {
		console.warn('MCP code issuance failure', {
			errorName: cause instanceof Error ? cause.name : typeof cause
		});
		return renderForm(503, 'The connection could not be created. Please try again.');
	}
	const target = new URL(validation.request.redirectUri);
	target.searchParams.set('code', code);
	target.searchParams.set('iss', new URL(validation.request.resource).origin);
	if (validation.request.state) target.searchParams.set('state', validation.request.state);
	if (params.has('scope')) target.searchParams.set('scope', validation.request.scopes.join(' '));
	return redirect(target.toString());
};
