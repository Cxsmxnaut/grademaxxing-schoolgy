<script lang="ts">
	import type { ReportPeriod } from '$lib/contracts/studentvue/gradebook';
	import { getReportPeriodIndex } from '$lib/grades/catalog';

	interface Props {
		activeIndex: number;
		reportPeriods: ReportPeriod[];
		switchReportPeriod: (index: number) => unknown;
		disabled?: boolean;
	}
	let { activeIndex, reportPeriods, switchReportPeriod, disabled = false }: Props = $props();

	function handleChange(event: Event) {
		const index = Number.parseInt((event.currentTarget as HTMLSelectElement).value);
		if (Number.isInteger(index)) switchReportPeriod(index);
	}
</script>

<select
	aria-label="Report period"
	class="border-input bg-card h-[2.375rem] w-full rounded-sm border px-3 py-[0.5625rem] text-left text-[0.84375rem] leading-[normal] font-medium shadow-none sm:w-[11.125rem]"
	value={activeIndex.toString()}
	{disabled}
	onchange={handleChange}
>
	{#each reportPeriods as reportPeriod, index (reportPeriod._Index)}
		{@const reportPeriodIndex = getReportPeriodIndex(reportPeriod, index)}
		<option value={reportPeriodIndex.toString()}>{reportPeriod._GradePeriod}</option>
	{/each}
</select>
