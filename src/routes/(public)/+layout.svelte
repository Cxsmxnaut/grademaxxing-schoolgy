<script lang="ts">
	import { page } from '$app/state';
	import { recordPublicEvent } from '$lib/analytics/public-client';
	import { getPublicPage } from '$lib/seo/public-pages';
	import { onMount, type Snippet } from 'svelte';
	let { children }: { children: Snippet } = $props();
	let mounted = $state(false);
	let lastPath = '';
	let currentPage = $derived(getPublicPage(page.url.pathname));
	let parentPage = $derived(currentPage?.parent ? getPublicPage(currentPage.parent) : undefined);
	onMount(() => {
		mounted = true;
	});
	$effect(() => {
		const path = page.url.pathname;
		if (mounted && path !== lastPath) {
			lastPath = path;
			recordPublicEvent('page_view', path);
		}
	});
</script>

<div class="public-site">
	<a class="skip-link" href="#public-main">Skip to content</a>
	<header class="site-header">
		<a class="brand" href="/" aria-label="Grademaxxing home"
			><img src="/brand-mark-48.webp" alt="" width="24" height="24" />Grademaxxing</a
		>
		<nav aria-label="Primary navigation">
			<a
				href="/calculators"
				aria-current={page.url.pathname.startsWith('/calculators') ? 'page' : undefined}
				>Calculators</a
			>
			<a href="/demo" aria-current={page.url.pathname === '/demo' ? 'page' : undefined}>Demo</a>
			<a
				href="/guides/studentvue-grade-calculation"
				aria-current={page.url.pathname.startsWith('/guides') ? 'page' : undefined}>Guides</a
			>
			<a
				class="sign-in"
				href="/login"
				onclick={() => recordPublicEvent('connection_start', page.url.pathname)}
				>Sign in <span aria-hidden="true">↗</span></a
			>
		</nav>
	</header>
	<main id="public-main" tabindex="-1" data-public-ready={mounted ? 'true' : 'false'}>
		{#if currentPage && currentPage.path !== '/'}
			<nav class="breadcrumbs" aria-label="Breadcrumbs">
				<ol>
					<li><a href="/">Home</a></li>
					{#if parentPage}<li><a href={parentPage.path}>{parentPage.label}</a></li>{/if}
					<li><span aria-current="page">{currentPage.label}</span></li>
				</ol>
			</nav>
		{/if}
		{@render children()}
	</main>
	<footer class="site-footer">
		<p>Independent, read-only StudentVUE companion. Simulations are estimates.</p>
		<nav aria-label="Footer navigation">
			<a href="/about">About</a><a href="/studentvue-compatibility">Compatibility</a><a
				href="/methodology/grade-calculations">Methodology</a
			><a href="/privacy">Privacy</a>
		</nav>
		<p class="attribution">
			Grademaxxing is not affiliated with or endorsed by Edupoint or a school district.
		</p>
	</footer>
</div>

<style>
	.public-site {
		width: min(100% - 3rem, 76rem);
		margin: 0 auto;
	}
	.skip-link {
		position: fixed;
		top: 0.5rem;
		left: 0.5rem;
		transform: translateY(-200%);
		padding: 0.75rem 1rem;
		background: var(--foreground);
		color: var(--background);
		border-radius: var(--corner-sm);
		z-index: 10;
	}
	.skip-link:focus {
		transform: translateY(0);
	}
	.site-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1.5rem;
		padding: 1.4rem 0;
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		font-family: var(--font-heading);
		font-weight: 600;
		font-size: 1.15rem;
		text-decoration: none;
		white-space: nowrap;
	}
	.brand img {
		width: 24px;
		height: 24px;
	}
	nav {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 1.3rem;
	}
	nav a {
		color: var(--muted-foreground);
		text-decoration: none;
		font-size: 0.88rem;
		padding: 0.35rem 0;
	}
	nav a:hover,
	nav a[aria-current] {
		color: var(--foreground);
	}
	a:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
		border-radius: var(--corner-xs);
	}
	nav .sign-in {
		color: var(--foreground);
		font-weight: 600;
	}
	main {
		outline: none;
		min-height: 65vh;
	}
	.breadcrumbs {
		max-width: 49rem;
		margin: 1.4rem auto 0;
		color: var(--tertiary-foreground);
	}
	.breadcrumbs ol {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.4rem 0.6rem;
		list-style: none;
		padding: 0;
		margin: 0;
	}
	.breadcrumbs li {
		font-size: 0.78rem;
	}
	.breadcrumbs li + li::before {
		content: '/';
		margin-right: 0.6rem;
		color: var(--tertiary-foreground);
	}
	.breadcrumbs a {
		font-size: inherit;
		padding: 0;
		color: var(--muted-foreground);
	}
	.site-footer {
		margin-top: 3rem;
		padding: 2rem 0 2.5rem;
		border-top: 1px solid var(--border);
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}
	.site-footer nav {
		margin: 1rem 0;
	}
	.attribution {
		color: var(--tertiary-foreground);
		font-size: 0.78rem;
	}
	@media (max-width: 680px) {
		.site-header {
			align-items: flex-start;
			flex-direction: column;
			gap: 0.65rem;
			padding: 1.1rem 0;
		}
		nav {
			gap: 1.1rem;
		}
	}
	@media (max-width: 400px) {
		.public-site {
			width: calc(100% - 2rem);
		}
		.site-header nav {
			gap: 0.85rem;
		}
		nav a {
			font-size: 0.82rem;
		}
	}
</style>
