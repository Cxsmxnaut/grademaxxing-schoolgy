<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import Disclaimer from '$lib/components/Disclaimer.svelte';
	let { children } = $props();
</script>

<svelte:head><title>Sign Up - {brand}</title></svelte:head>
<AuthShell
	><div class="w-full max-w-[35rem]">
		{@render children()}<Disclaimer class="text-[#91aac2]" />
	</div></AuthShell
>
