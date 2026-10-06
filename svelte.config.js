import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const adapter =
	process.env.DEPLOY_TARGET === 'cloudflare'
		? adapterCloudflare()
		: process.env.VERCEL === '1'
			? adapterVercel({ maxDuration: 300, runtime: 'nodejs24.x' })
			: adapterNode();

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// The MCP OAuth token endpoint must accept RFC 6749
		// application/x-www-form-urlencoded POSTs from ChatGPT/Claude servers, which
		// send no Origin header; SvelteKit's built-in form CSRF check rejects those.
		// Browser-form protection is unchanged: hooks.server.ts guards /api/* and
		// /mcp/authorize enforces its own origin + sec-fetch-site checks.
		csrf: { trustedOrigins: ['*'] },
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'font-src': ['self', 'data:'],
				'img-src': ['self', 'data:', 'blob:'],
				'connect-src': ['self'],
				'frame-src': ['self', 'blob:'],
				'worker-src': ['self', 'blob:'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self'],
				'form-action': ['self'],
				'frame-ancestors': ['none']
			}
		},
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter
	}
};

export default config;
