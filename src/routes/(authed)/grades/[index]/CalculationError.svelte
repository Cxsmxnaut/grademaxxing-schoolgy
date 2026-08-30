<script lang="ts">
	import { brand } from '$lib/brand';
	import * as Alert from '$lib/components/ui/alert';
	import AlertCircleIcon from '@lucide/svelte/icons/circle-alert';

	interface Props {
		hypotheticalMode?: boolean;
		officialPercentage?: number;
		estimatedPercentage?: number;
		hiddenAssignmentCount?: number;
	}
	let {
		hypotheticalMode = false,
		officialPercentage,
		estimatedPercentage,
		hiddenAssignmentCount = 0
	}: Props = $props();

	const formatPercentage = (percentage: number) =>
		new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(percentage) + '%';
</script>

<Alert.Root class="border-grade-watch bg-grade-watch-soft max-w-3xl py-3">
	<AlertCircleIcon class="text-grade-watch" />

	<Alert.Title>
		{#if hypotheticalMode}
			What-if estimate is limited
		{:else}
			Official and visible-work grades differ
		{/if}
	</Alert.Title>

	<Alert.Description>
		{#if officialPercentage !== undefined && estimatedPercentage !== undefined}
			<p>
				StudentVUE reports <strong>{formatPercentage(officialPercentage)}</strong>. Work visible to
				{brand} estimates <strong>{formatPercentage(estimatedPercentage)}</strong>.
			</p>
		{/if}
		{#if hiddenAssignmentCount > 0}
			<p>
				{hiddenAssignmentCount} hidden point
				{hiddenAssignmentCount === 1 ? 'record was' : 'records were'} reconstructed from category totals.
			</p>
		{/if}
	</Alert.Description>
</Alert.Root>
