<script lang="ts">
	import '@fontsource/manrope/400.css';
	import '@fontsource/manrope/600.css';
	import '@fontsource/outfit/600.css';
	import '@fontsource/outfit/700.css';
	import { browser } from '$app/environment';
	import { page } from '$app/state';
	import MaintenancePage from '$lib/components/MaintenancePage.svelte';
	import { getPublicPage } from '$lib/seo/public-pages';
	import type { Component } from 'svelte';
	import '../app.css';

	let { children, data } = $props();
	let AppEnhancements = $state<Component | null>(null);
	const needsAppEnhancements = $derived(!getPublicPage(page.url.pathname));

	$effect(() => {
		if (browser && needsAppEnhancements && !AppEnhancements) {
			void import('$lib/components/AppEnhancements.svelte')
				.then((module) => {
					AppEnhancements = module.default;
				})
				.catch(() => {
					// An optional toast/font chunk must not interrupt the app.
				});
		}
	});
</script>

<!-- svelte-sonner reads HTMLElement while rendering. Render it only after hydration so
     edge runtimes without DOM globals can still server-render every app route. -->
{#if data.maintenance}
	<MaintenancePage />
{:else}
	{#if browser && needsAppEnhancements && AppEnhancements}
		<AppEnhancements />
	{/if}

	{@render children()}
{/if}
