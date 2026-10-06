/**
 * Discovery documents for the Grademaxxing MCP resource.
 *
 * Both Claude and ChatGPT locate the authorization server through the protected
 * resource metadata advertised on the MCP endpoint, then read RFC 8414 / OIDC
 * discovery from the issuer. The 401 challenge header points at the base
 * well-known document; the path-scoped variant is served too because clients
 * probe it first as a fallback.
 */

export const MCP_PATH = '/mcp';
export const MCP_SERVER_NAME = 'grademaxxing';
export const MCP_SERVER_TITLE = 'Grademaxxing (Beta)';
export const MCP_SERVER_VERSION = '0.2.0-beta.1';

export function mcpResource(origin: string) {
	return `${origin}${MCP_PATH}`;
}

export function protectedResourceMetadata(origin: string) {
	return {
		resource: mcpResource(origin),
		authorization_servers: [origin],
		resource_name: MCP_SERVER_TITLE,
		resource_documentation: `${origin}/privacy`,
		bearer_methods_supported: ['header'],
		scopes_supported: ['studentvue:read', 'offline_access']
	};
}

export function authorizationServerMetadata(origin: string) {
	return {
		issuer: origin,
		authorization_endpoint: `${origin}/mcp/authorize`,
		token_endpoint: `${origin}/mcp/token`,
		registration_endpoint: `${origin}/mcp/register`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		scopes_supported: ['studentvue:read', 'offline_access'],
		token_endpoint_auth_methods_supported: ['none'],
		authorization_response_iss_parameter_supported: true
	};
}

/** RFC 9728 401 challenge pointing clients at the discovery document. */
export function wwwAuthenticateChallenge(origin: string) {
	return [
		`Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
		'scope="studentvue:read"'
	].join(', ');
}

export const CORS_HEADERS = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
	'Access-Control-Allow-Headers':
		'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Method, Mcp-Name, MCP-Protocol-Version',
	'Access-Control-Expose-Headers': 'Mcp-Session-Id',
	'Access-Control-Max-Age': '600'
} as const;

/**
 * Intercept `/.well-known/*` before application routing so discovery works on
 * every adapter without depending on dot-directory route generation.
 */
export function wellKnownResponse(url: URL): Response | undefined {
	const path = url.pathname.replace(/\/+$/, '') || '/';
	const origin = url.origin;
	const documents: Record<string, unknown> = {
		'/.well-known/oauth-protected-resource': protectedResourceMetadata(origin),
		'/.well-known/oauth-protected-resource/mcp': protectedResourceMetadata(origin),
		'/.well-known/oauth-authorization-server': authorizationServerMetadata(origin),
		'/.well-known/openid-configuration': authorizationServerMetadata(origin)
	};
	const document = documents[path];
	if (!document) return undefined;
	return new Response(JSON.stringify(document), {
		status: 200,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'public, max-age=300',
			'X-Content-Type-Options': 'nosniff',
			'Referrer-Policy': 'no-referrer',
			...CORS_HEADERS
		}
	});
}
