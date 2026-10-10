<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		introduction,
		children
	}: { title: string; introduction: string; children: Snippet } = $props();
</script>

<div class="tool-page">
	<header>
		<a class="back-link" href="/calculators">All calculators</a>
		<p class="eyebrow">No login needed · entered values only</p>
		<h1>{title}</h1>
		<p class="introduction">{introduction}</p>
	</header>
	{@render children()}
	<aside>
		<p>
			Check the assumptions against your teacher's grading policy. See our <a
				href="/methodology/grade-calculations">calculation methodology and worked examples</a
			>
			or try the <a href="/demo">synthetic demo</a>.
		</p>
	</aside>
</div>

<style>
	.tool-page {
		width: min(100%, 56rem);
		margin: 0 auto;
		padding-top: clamp(2rem, 5vw, 4rem);
	}
	header {
		margin-bottom: 2rem;
	}
	.back-link {
		color: var(--muted-foreground);
		font-size: 0.85rem;
	}
	.eyebrow {
		margin-top: 1.5rem;
		color: var(--muted-foreground);
		font-size: 0.8rem;
	}
	h1 {
		font-family: var(--font-heading);
		font-size: clamp(2rem, 5vw, 3.3rem);
		line-height: 1.15;
		margin: 0.8rem 0 1rem;
		letter-spacing: -0.025em;
	}
	.introduction {
		color: var(--muted-foreground);
		line-height: 1.8;
		max-width: 48rem;
	}
	aside {
		margin-top: 1.5rem;
		color: var(--muted-foreground);
		font-size: 0.9rem;
		line-height: 1.8;
	}
	aside a {
		color: var(--link);
		text-decoration: underline;
		text-underline-offset: 0.2em;
	}
	a:focus-visible {
		outline: 2px solid var(--ring);
		outline-offset: 4px;
	}
</style>
