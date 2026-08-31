<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		children: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();
</script>

<main
	class={`min-h-[calc(100vh-3.09375rem)] w-full px-4 pt-3.5 pb-[5.25rem] sm:px-6 md:min-h-screen md:pb-16 lg:px-11 lg:pt-9 lg:pb-16 ${className}`}
>
	{@render children()}
</main>
