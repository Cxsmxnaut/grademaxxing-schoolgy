import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterNode from '@sveltejs/adapter-node';
import adapterVercel from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const adapter =
	process.env.DEPLOY_TARGET === 'cloudflare'
		? adapterCloudflare()
		: process.env.VERCEL === '1'
			? adapterVercel({ maxDuration: 300, runtime: 'nodejs24.x' })
			: {
					...adapterNode(),
					async emulate() {
						return {
							async platform({ config }) {
								if (!config?.maxDiagnostics) return {};
								const { maxDevelopmentPlatform } = await import('./scripts/max-dev-database.mjs');
								return maxDevelopmentPlatform();
							}
						};
					}
				};

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Server-to-server OAuth token exchanges are form POSTs with no Origin.
		// hooks.server.ts protects consent and app routes; public/bearer MCP APIs use CORS.
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
