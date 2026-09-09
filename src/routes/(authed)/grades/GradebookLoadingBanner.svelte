<script lang="ts">
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner';
	import { onMount } from 'svelte';

	interface Props {
		loadingReportPeriodName?: string;
		status: string;
	}
	let { loadingReportPeriodName, status }: Props = $props();

	let stopwatch = $state(0);
	onMount(() => {
		const interval = setInterval(() => {
			stopwatch += 1;
		}, 1000);

		return () => {
			clearInterval(interval);
		};
	});
</script>

<Item.Root variant="muted" size="sm" class="bg-muted/90 z-30 mx-4 mt-2 md:fixed md:top-6 md:mt-0">
	<Item.Media><Spinner /></Item.Media>

	<Item.Content>
		<Item.Title>
			{loadingReportPeriodName
				? `Loading ${loadingReportPeriodName} grades...`
				: 'Loading grades...'}
		</Item.Title>

		<Item.Description>
			{status}
			<span>{stopwatch}s</span>
		</Item.Description>
	</Item.Content>
</Item.Root>
