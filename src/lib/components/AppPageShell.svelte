<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<main class={`w-full px-4 py-6 sm:px-6 md:pb-16 lg:px-11 lg:py-9 ${className}`}>
	{@render children()}
</main>
