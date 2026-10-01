<script lang="ts">
	import { brand } from '$lib/brand';
	import * as Alert from '$lib/components/ui/alert';
	import AlertCircleIcon from '@lucide/svelte/icons/circle-alert';

	interface Props {
		hypotheticalMode?: boolean;
		officialPercentage?: number;
		estimatedPercentage?: number;
	}
	let { hypotheticalMode = false, officialPercentage, estimatedPercentage }: Props = $props();

	const formatPercentage = (percentage: number) =>
		new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(percentage) + '%';
</script>

<Alert.Root class="border-grade-watch bg-grade-watch-soft w-full py-2.5">
	<AlertCircleIcon class="text-grade-watch" />

	<Alert.Title>
		{#if hypotheticalMode}
			What-if estimate is limited
		{:else}
			Official and visible-work grades differ
		{/if}
	</Alert.Title>

	<Alert.Description>
		<p>
			{#if officialPercentage !== undefined && estimatedPercentage !== undefined}
				StudentVUE reports <strong>{formatPercentage(officialPercentage)}</strong>. Work visible to
				{brand} estimates
				<strong>{formatPercentage(estimatedPercentage)}</strong>. StudentVUE's official grade is
				used for your course mark; the estimate may omit grading rules or work StudentVUE does not
				list.
			{/if}
		</p>
	</Alert.Description>
</Alert.Root>
