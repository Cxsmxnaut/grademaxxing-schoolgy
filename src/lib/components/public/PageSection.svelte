<script lang="ts">
	import type { Snippet } from 'svelte';
	let { id, heading, children }: { id?: string; heading: string; children: Snippet } = $props();
</script>

<section {id}>
	<h2>{heading}</h2>
	{@render children()}
</section>

<style>
	section {
		min-width: 0;
		scroll-margin-top: 1rem;
	}
	h2 {
		font-size: clamp(1.4rem, 3vw, 1.7rem);
		line-height: 1.25;
		font-weight: 500;
		margin-bottom: 1rem;
		letter-spacing: -0.015em;
	}
</style>
