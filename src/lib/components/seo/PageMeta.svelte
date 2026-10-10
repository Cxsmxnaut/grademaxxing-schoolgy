<script lang="ts">
	import { page as currentPage } from '$app/state';
	import {
		canonicalUrl,
		getPublicPage,
		isProductionHost,
		publicPageSchema,
		schemaScript,
		socialImagePath,
		SITE_NAME,
		SITE_ORIGIN,
		type PublicPage
	} from '$lib/seo/public-pages';

	let {
		path,
		page,
		title,
		description,
		schema
	}: {
		path?: string;
		page?: PublicPage;
		title?: string;
		description?: string;
		schema?: Record<string, unknown>;
	} = $props();

	let entry = $derived(page ?? getPublicPage(path ?? currentPage.url.pathname));
	let meta = $derived(
		entry
			? { ...entry, title: title ?? entry.title, description: description ?? entry.description }
			: undefined
	);
	let url = $derived(entry ? canonicalUrl(entry.path) : undefined);
	let image = $derived(entry ? `${SITE_ORIGIN}${socialImagePath(entry.path)}` : undefined);
	let structuredData = $derived(meta ? schemaScript(schema ?? publicPageSchema(meta)) : '');
</script>

<svelte:head>
	{#if meta && url && image}
		<title>{meta.title}</title>
		<meta name="description" content={meta.description} />
		<link rel="canonical" href={url} />
		{#if !isProductionHost(currentPage.url.hostname)}
			<meta name="robots" content="noindex" />
		{/if}
		<meta property="og:type" content="website" />
		<meta property="og:site_name" content={SITE_NAME} />
		<meta property="og:title" content={meta.title} />
		<meta property="og:description" content={meta.description} />
		<meta property="og:url" content={url} />
		<meta property="og:image" content={image} />
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
		<meta property="og:image:alt" content={`${meta.label} — ${SITE_NAME}`} />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content={meta.title} />
		<meta name="twitter:description" content={meta.description} />
		<meta name="twitter:image" content={image} />
		<!-- schemaScript escapes all markup delimiters in its JSON payload. -->
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html structuredData}
	{/if}
</svelte:head>
