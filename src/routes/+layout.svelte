<script lang="ts">
	import '@fontsource/instrument-sans/400.css';
	import '@fontsource/instrument-sans/500.css';
	import '@fontsource/instrument-sans/600.css';
	import '@fontsource/space-grotesk/600.css';
	import '@fontsource/space-grotesk/700.css';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/600.css';
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
