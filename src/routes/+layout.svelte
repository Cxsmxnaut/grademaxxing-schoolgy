<script lang="ts">
	import '@fontsource/manrope/400.css';
	import '@fontsource/manrope/500.css';
	import '@fontsource/manrope/600.css';
	import '@fontsource/outfit/600.css';
	import '@fontsource/outfit/700.css';
	import '@fontsource/jetbrains-mono/400.css';
	import '@fontsource/jetbrains-mono/600.css';
	import { browser } from '$app/environment';
	import MaintenancePage from '$lib/components/MaintenancePage.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import '../app.css';

	let { children, data } = $props();
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
