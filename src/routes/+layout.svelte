<script lang="ts">
	import '@fontsource/instrument-sans/400.css';
	import '@fontsource/instrument-sans/500.css';
	import '@fontsource/instrument-sans/600.css';
	import '@fontsource/space-grotesk/600.css';
	import '@fontsource/space-grotesk/700.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/600.css';
	import { browser } from '$app/environment';
	import MaintenancePage from '$lib/components/MaintenancePage.svelte';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';

	let { children, data } = $props();
</script>

<!-- mode-watcher normally injects an un-nonced inline bootstrap script. The app
     starts dark in app.html and applies the saved preference after hydration, so
     disabling that injection keeps the strict script CSP intact. -->
<ModeWatcher disableHeadScriptInjection />

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
