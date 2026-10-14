<script lang="ts">
	import { page } from '$app/state';

	interface Props {
		title: string;
		description: string;
		jsonLd?: Record<string, unknown> | Record<string, unknown>[];
	}
	let { title, description, jsonLd }: Props = $props();

	const SITE_ORIGIN = 'https://grademaxxing.app';
	const pathname = $derived(page.url.pathname.replace(/\/$/, '') || '/');
	const canonical = $derived(`${SITE_ORIGIN}${pathname === '/' ? '/' : pathname}`);
	const markdownHref = $derived(pathname === '/' ? '/index.md' : `${pathname}.md`);
	// Built dynamically so the component source never contains a closing script
	// tag, which would terminate the top-level script block. Inner "<" is
	// escaped so no literal closing tag can break out of the data block.
	const jsonLdScript = $derived.by(() => {
		if (!jsonLd) return '';
		const tag = 'script';
		return `<${tag} type="application/ld+json">${JSON.stringify(jsonLd).replaceAll('<', '\\u003c')}</${tag}>`;
	});
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={canonical} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:url" content={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="Grademaxxing" />
	<meta property="og:image" content="{SITE_ORIGIN}/gradebook-preview-dark-v3.png" />
	<link rel="alternate" type="text/markdown" href={markdownHref} />
	{#if jsonLdScript}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html jsonLdScript}
	{/if}
</svelte:head>
