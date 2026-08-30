<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<main class={`mx-auto w-full max-w-[65rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-9 ${className}`}>
	{@render children()}
</main>
