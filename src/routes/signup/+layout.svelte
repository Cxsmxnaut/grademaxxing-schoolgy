<script lang="ts">
	import { brand } from '$lib/brand';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>Sign Up - {brand}</title>
</svelte:head>

<AuthShell promo={false}>
	<div
		class="w-full max-w-[35rem] rounded-2xl border border-[rgba(228,238,248,0.1)] bg-[#0d2033] p-6 text-[#e4eef8] shadow-[0_1.25rem_4rem_rgba(0,0,0,0.24)] sm:p-9"
	>
		{@render children()}
	</div>
</AuthShell>
