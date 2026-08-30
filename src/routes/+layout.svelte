<script lang="ts">
	import '@fontsource-variable/instrument-sans';
	import '@fontsource-variable/space-grotesk';
	import '@fontsource/ibm-plex-mono';
	import { Toaster } from '$lib/components/ui/sonner';
	import { ModeWatcher } from 'mode-watcher';
	import '../app.css';

	let { children } = $props();
</script>

<!-- mode-watcher normally injects an un-nonced inline bootstrap script. The app
     starts dark in app.html and applies the saved preference after hydration, so
     disabling that injection keeps the strict script CSP intact. -->
<ModeWatcher disableHeadScriptInjection />

<Toaster />

{@render children()}
