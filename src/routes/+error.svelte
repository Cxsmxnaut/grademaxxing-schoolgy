<script lang="ts">
	import { page } from '$app/state';
	import { brand } from '$lib/brand';
	import AuthPanelHeader from '$lib/components/auth/AuthPanelHeader.svelte';
	import AuthShell from '$lib/components/auth/AuthShell.svelte';
	import { Button } from '$lib/components/ui/button';
</script>

<svelte:head>
	<title>{page.status} {page.error?.message} - {brand}</title>
</svelte:head>

<AuthShell promo={false}>
	<main
		class="w-full max-w-[25rem] rounded-2xl border border-[rgba(228,238,248,0.1)] bg-[#0d2033] p-5 text-[#e4eef8] shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)] sm:p-9"
	>
		<AuthPanelHeader />
		<p class="mb-2 text-xs font-bold tracking-[0.14em] text-[#4db6f5] uppercase">
			Error {page.status}
		</p>
		<h1
			class="text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em]"
			style="font-family: 'Space Grotesk', sans-serif"
		>
			This page failed to show up.
		</h1>
		<p class="mt-3 leading-6 text-[#8fa9c2]">
			{page.error?.message ?? 'An unexpected problem interrupted this page.'}
		</p>
		<Button
			href="/"
			class="mt-6 h-12 w-full rounded-lg bg-[#4db6f5] font-semibold text-[#081522] hover:bg-[#6fc4f7]"
		>
			Return home
		</Button>
	</main>
</AuthShell>
