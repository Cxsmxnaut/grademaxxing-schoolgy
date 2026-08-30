<script lang="ts">
	import { page } from '$app/state';
	import { brand } from '$lib/brand';
	import { Button } from '$lib/components/ui/button';
</script>

<svelte:head>
	<title>{page.status} {page.error?.message} - {brand}</title>
</svelte:head>

<div class="bg-background flex min-h-screen items-center justify-center px-4">
	<main class="max-w-md text-center">
		<img src="/favicon.svg" class="mx-auto mb-6 size-14" alt="" />
		<p class="text-primary text-xs font-bold tracking-[0.14em] uppercase">Error {page.status}</p>
		<h1 class="mt-2 text-3xl font-bold tracking-tight">This page could not be opened</h1>
		<p class="text-muted-foreground mt-3 leading-6">
			{page.error?.message ?? 'An unexpected problem interrupted this page.'}
		</p>
		<Button href="/" class="mt-6">Return home</Button>
	</main>
</div>
