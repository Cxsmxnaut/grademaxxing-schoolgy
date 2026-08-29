<script lang="ts">
	import { brand } from '$lib/brand';
	import { cn } from '$lib/utils';

	interface Props {
		trademark?: boolean;
		class?: string;
	}
	let { trademark = true, class: className }: Props = $props();
</script>

<p class={cn('text-muted-foreground mx-auto p-4 text-center text-xs', className)}>
	{#if trademark}StudentVUE is a registered trademark of Edupoint Educational Systems LLC.{/if}
	{brand} is not affiliated with or endorsed by Edupoint Educational Systems LLC.
</p>
