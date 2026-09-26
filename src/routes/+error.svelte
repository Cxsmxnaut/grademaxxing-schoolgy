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
		class="border-border bg-card text-card-foreground w-full max-w-[25rem] rounded-2xl border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.4),0_8px_24px_rgba(0,0,0,0.3)] sm:p-9"
	>
		<AuthPanelHeader />
		<p class="text-primary mb-2 text-xs font-bold tracking-[0.14em] uppercase">
			Error {page.status}
		</p>
		<h1
			class="text-[1.4375rem] leading-[2.15625rem] font-bold tracking-[-0.01em]"
			style="font-family: 'Outfit', sans-serif"
		>
			This page failed to show up.
		</h1>
		<p class="text-muted-foreground mt-3 leading-6">
			{page.error?.message ?? 'An unexpected problem interrupted this page.'}
		</p>
		<Button
			href="/"
			class="bg-primary text-primary-foreground mt-6 h-12 w-full rounded-lg font-semibold hover:brightness-110"
		>
			Return home
		</Button>
	</main>
</AuthShell>
