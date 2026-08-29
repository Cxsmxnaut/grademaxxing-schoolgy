<script lang="ts">
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import { fade, fly } from 'svelte/transition';

	let { children = null } = $props();
</script>

<div class="flex justify-center" in:fade out:fly={{ y: '-50%' }}>
	<Item.Root variant="muted" size="sm" class="bg-muted/90 z-30 mx-4 mt-2 md:fixed md:top-6 md:mt-0">
		<Item.Media><Spinner /></Item.Media>

		<Item.Content>
			<Item.Title>
				{#if children}
					{@render children()}
				{:else}
					Loading...
				{/if}
			</Item.Title>
		</Item.Content>
	</Item.Root>
</div>
