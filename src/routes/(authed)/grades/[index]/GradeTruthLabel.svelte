<script lang="ts">
	import { getRelativeTime } from '$lib';
	import { Badge } from '$lib/components/ui/badge';

	interface Props {
		hypotheticalMode: boolean;
		lastRefresh?: number;
	}

	let { hypotheticalMode, lastRefresh }: Props = $props();
</script>

{#if hypotheticalMode}
	<Badge
		variant="outline"
		class="border-grade-extra bg-grade-extra-soft text-grade-extra font-sans"
		title="A private what-if calculation. It does not change StudentVUE."
	>
		Simulation · not official
	</Badge>
{:else}
	<Badge
		variant="outline"
		class="border-border bg-surface-sunken text-official font-sans"
		title="The grade reported by StudentVUE"
	>
		Official{lastRefresh === undefined ? '' : ` · synced ${getRelativeTime(new Date(lastRefresh))}`}
	</Badge>
{/if}
