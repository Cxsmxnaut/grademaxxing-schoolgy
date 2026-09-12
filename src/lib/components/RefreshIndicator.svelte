<script lang="ts">
	import { getRelativeTime } from '$lib';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		lastRefresh?: number;
		canRefresh: boolean;
		refreshing?: boolean;
		refresh: () => unknown | Promise<unknown>;
	}
	let { lastRefresh, canRefresh, refreshing = false, refresh }: Props = $props();
</script>

<Badge variant="secondary" class="text-tertiary-foreground mx-auto my-2 p-1 px-3 text-sm">
	<ClockIcon class="h-4 w-4" />
	{#if lastRefresh === undefined}
		Not synced yet
	{:else}
		Last updated {getRelativeTime(new Date(lastRefresh))}
	{/if}
	<button
		class={canRefresh && !refreshing ? 'cursor-pointer underline' : 'cursor-not-allowed'}
		onclick={refresh}
		disabled={!canRefresh || refreshing}
		aria-busy={refreshing}
	>
		{refreshing ? 'Refreshing…' : 'Refresh'}
	</button>
</Badge>
