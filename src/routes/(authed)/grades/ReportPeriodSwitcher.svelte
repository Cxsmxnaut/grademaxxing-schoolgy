<script lang="ts">
	import * as Select from '$lib/components/ui/select';
	import type { ReportPeriod } from '$lib/types/Gradebook';
	import { getReportPeriodIndex } from '$lib/grades/catalog';
	import CloudCheckIcon from '@lucide/svelte/icons/cloud-check';
	import HourglassIcon from '@lucide/svelte/icons/hourglass';

	interface Props {
		activeName: string;
		activeIndex: number;
		reportPeriods: ReportPeriod[];
		switchReportPeriod: (index: number) => unknown;
		hasReportPeriodCached?: (index: number) => boolean;
		disabled?: boolean;
		defaultIndex?: number;
	}
	let {
		activeName,
		activeIndex,
		reportPeriods,
		hasReportPeriodCached,
		switchReportPeriod,
		disabled = false,
		defaultIndex
	}: Props = $props();
</script>

<Select.Root
	type="single"
	bind:value={
		() => activeIndex.toString(),
		(value) => {
			const index = Number.parseInt(value);
			if (Number.isInteger(index)) switchReportPeriod(index);
		}
	}
	{disabled}
>
	<Select.Trigger
		class="bg-card! h-[2.375rem]! w-full rounded-[0.5rem] px-3 py-[0.5625rem] text-left text-[0.84375rem] leading-[normal] font-medium shadow-none sm:w-[11.125rem]"
	>
		{activeName}
	</Select.Trigger>

	<Select.Content>
		<Select.Group>
			<Select.Label>Report Periods</Select.Label>

			{#each reportPeriods as reportPeriod, index (reportPeriod._Index)}
				{@const reportPeriodIndex = getReportPeriodIndex(reportPeriod, index)}
				<Select.Item value={reportPeriodIndex.toString()} label={reportPeriod._GradePeriod}>
					{reportPeriod._GradePeriod}
					{#if hasReportPeriodCached?.(reportPeriodIndex)}
						<CloudCheckIcon />
					{/if}
					{#if reportPeriodIndex === defaultIndex}
						<HourglassIcon />
					{/if}
				</Select.Item>
			{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>
