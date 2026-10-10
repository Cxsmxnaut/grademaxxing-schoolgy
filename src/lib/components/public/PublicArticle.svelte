<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		eyebrow,
		title,
		intro,
		related = [],
		children
	}: {
		eyebrow?: string;
		title: string;
		intro?: string;
		related?: { href: string; label: string; detail?: string }[];
		children: Snippet;
	} = $props();
</script>

<article class="public-article">
	<header class="article-heading">
		{#if eyebrow}<p class="eyebrow">{eyebrow}</p>{/if}
		<h1>{title}</h1>
		{#if intro}<p class="intro">{intro}</p>{/if}
	</header>
	<div class="article-body">{@render children()}</div>
	{#if related.length}
		<nav class="related" aria-label="Continue exploring">
			<h2>Keep exploring</h2>
			<ul>
				{#each related as link (link.href)}
					<li>
						<a href={link.href}>{link.label}<span aria-hidden="true"> →</span></a
						>{#if link.detail}<p>{link.detail}</p>{/if}
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
</article>

<style>
	.public-article {
		max-width: 49rem;
		margin: 0 auto;
		padding: 3.5rem 0 2rem;
	}
	.article-heading {
		margin-bottom: 3rem;
	}
	.eyebrow {
		color: var(--success);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		margin-bottom: 0.8rem;
	}
	h1 {
		max-width: 18ch;
		font-size: clamp(2.15rem, 6vw, 3.65rem);
		line-height: 1.1;
		font-weight: 600;
		letter-spacing: -0.035em;
		overflow-wrap: anywhere;
	}
	.intro {
		margin-top: 1.4rem;
		font-size: 1.1rem;
		line-height: 1.75;
		color: var(--muted-foreground);
		max-width: 65ch;
	}
	.article-body {
		display: grid;
		gap: 2.5rem;
	}
	.article-body :global(p),
	.article-body :global(li) {
		line-height: 1.85;
		color: var(--muted-foreground);
	}
	.article-body :global(p + p),
	.article-body :global(p + ul),
	.article-body :global(p + ol),
	.article-body :global(ul + p),
	.article-body :global(ol + p) {
		margin-top: 1rem;
	}
	.article-body :global(strong) {
		color: var(--foreground);
		font-weight: 600;
	}
	.article-body :global(a),
	.related a {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	.article-body :global(a:hover),
	.related a:hover {
		color: var(--foreground);
	}
	.article-body :global(a:focus-visible),
	.related a:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 4px;
		border-radius: var(--corner-xs);
	}
	.article-body :global(ul),
	.article-body :global(ol) {
		padding-left: 1.4rem;
		margin: 0;
	}
	.article-body :global(li + li) {
		margin-top: 0.55rem;
	}
	.article-body :global(h3) {
		font-size: 1.15rem;
		line-height: 1.35;
		margin: 1.4rem 0 0.65rem;
	}
	.article-body :global(.formula) {
		font-family: var(--font-technical);
		color: var(--foreground);
		background: var(--surface-sunken);
		padding: 1rem 1.2rem;
		border-left: 2px solid var(--success);
		border-radius: var(--corner-xs);
		margin: 1rem 0;
		overflow-wrap: anywhere;
		font-size: 0.9rem;
	}
	.article-body :global(.callout) {
		padding: 1.2rem;
		border-left: 2px solid var(--warning);
		background: var(--warning-soft);
		border-radius: var(--corner-xs);
	}
	.article-body :global(.table-scroll) {
		width: 100%;
		overflow-x: auto;
		margin: 1rem 0;
	}
	.article-body :global(table) {
		border-collapse: collapse;
		width: 100%;
		font-size: 0.9rem;
		text-align: left;
	}
	.article-body :global(caption) {
		text-align: left;
		color: var(--muted-foreground);
		padding-bottom: 0.65rem;
	}
	.article-body :global(th),
	.article-body :global(td) {
		padding: 0.85rem 0.75rem;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}
	.article-body :global(th) {
		color: var(--foreground);
		font-weight: 600;
	}
	.article-body :global(td) {
		color: var(--muted-foreground);
		line-height: 1.7;
	}
	.article-body :global(code) {
		overflow-wrap: anywhere;
	}
	.related {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid var(--border);
	}
	.related h2 {
		font-size: 1.3rem;
		margin-bottom: 1rem;
	}
	.related ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 1rem;
	}
	.related a {
		font-weight: 600;
	}
	.related p {
		margin-top: 0.25rem;
		color: var(--muted-foreground);
		line-height: 1.7;
	}
	@media (max-width: 600px) {
		.public-article {
			padding-top: 2.5rem;
		}
		.article-heading {
			margin-bottom: 2.25rem;
		}
	}
</style>
