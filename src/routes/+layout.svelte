<script lang="ts">
	import '@fontsource/manrope/400.css';
	import '@fontsource/manrope/500.css';
	import '@fontsource/manrope/600.css';
	import '@fontsource/outfit/600.css';
	import '@fontsource/outfit/700.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/600.css';
	import { browser } from '$app/environment';
	import { onNavigate } from '$app/navigation';
	import MaintenancePage from '$lib/components/MaintenancePage.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onMount } from 'svelte';
	import '../app.css';

	let { children, data } = $props();
	let activeTransition: ViewTransition | undefined;

	onNavigate((navigation) => {
		const from = navigation.from?.route.id;
		const to = navigation.to?.route.id;
		const betweenLandingAndLogin =
			(from === '/' && to === '/login') || (from === '/login' && to === '/');
		if (
			!betweenLandingAndLogin ||
			!document.startViewTransition ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;

		activeTransition?.skipTransition();
		document.documentElement.classList.add('auth-page-transition');
		return new Promise<void>((resolve) => {
			// Release navigation once the old page is captured, then capture the new page
			// after SvelteKit has rendered it. Routing never waits for the animation to end.
			const transition = document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
			activeTransition = transition;
			void transition.finished
				.catch(() => {})
				.finally(() => {
					if (activeTransition !== transition) return;
					activeTransition = undefined;
					document.documentElement.classList.remove('auth-page-transition');
				});
		});
	});

	onMount(() => {
		if (location.hostname === 'new.grademaxxing.app')
			console.info('hi 👋 preprod StudentVUE grade sync is live · check 3');
	});
</script>

<!-- svelte-sonner reads HTMLElement while rendering. Render it only after hydration so
     edge runtimes without DOM globals can still server-render every app route. -->
{#if data.maintenance}
	<MaintenancePage />
{:else}
	{#if browser}
		<Toaster />
	{/if}

	{@render children()}
{/if}
