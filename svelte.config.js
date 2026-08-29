import adapterNode from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

if (process.env.VERCEL === '1') {
	throw new Error(
		'Grademaxxing requires a long-lived Node process because StudentVUE sessions are held in memory. Serverless Vercel deployment is intentionally disabled.'
	);
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
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
		adapter: adapterNode()
	}
};

export default config;
