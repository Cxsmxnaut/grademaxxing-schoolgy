<script lang="ts">
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';
	import NumberFlow from '@number-flow/svelte';

	interface Props {
		courseId: string;
		name: string;
		period: string;
		room: string;
		teacher: string;
		teacherEmail: string;
		unseenAssignmentsCount: number;
		grade?: { letter: string; percentage: number };
	}
	const { courseId, name, period, room, teacher, unseenAssignmentsCount, grade }: Props = $props();

	function gradeTone(percentage: number) {
		if (percentage > 100) return 'text-grade-extra';
		if (percentage >= 90) return 'text-grade-strong';
		if (percentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	}

	function indicatorTone(percentage: number) {
		if (percentage > 100) return 'bg-grade-extra';
		if (percentage >= 90) return 'bg-grade-strong';
		if (percentage >= 80) return 'bg-grade-watch';
		return 'bg-grade-risk';
	}
</script>

<a
	href="/grades/{encodeURIComponent(courseId)}"
	class="group border-border/80 bg-card hover:border-primary focus-visible:ring-ring grid min-h-[82px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-4 py-3.5 shadow-sm transition-[border-color,background-color] focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[44px_minmax(0,1fr)_minmax(180px,210px)] sm:px-5"
>
	<div
		class="font-mono text-[1.65rem] leading-none font-bold {grade
			? gradeTone(grade.percentage)
			: 'text-muted-foreground'}"
	>
		{grade?.letter ?? '—'}
	</div>

	<div class="min-w-0">
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="truncate text-[1.03rem] leading-tight font-bold tracking-[-0.015em]">{name}</h2>
			{#if unseenAssignmentsCount > 0}
				<span class="bg-primary/12 text-primary rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
					{unseenAssignmentsCount} new
				</span>
			{/if}
		</div>
		<div class="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem]">
			<span class="bg-secondary inline-flex items-center gap-1 rounded-full px-2 py-1">
				<Clock3Icon class="size-3" /> Period {period}
			</span>
			{#if room}
				<span class="bg-secondary inline-flex items-center gap-1 rounded-full px-2 py-1">
					<MapPinIcon class="size-3" />
					{room}
				</span>
			{/if}
			{#if teacher}
				<span class="bg-secondary inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1">
					<UserRoundIcon class="size-3 shrink-0" />
					<span class="max-w-28 truncate sm:max-w-36">{teacher}</span>
				</span>
			{/if}
		</div>
	</div>

	<div class="hidden items-center gap-3 sm:flex">
		{#if grade}
			<NumberFlow
				value={grade.percentage / 100}
				format={{ style: 'percent', maximumFractionDigits: 1 }}
				class="{gradeTone(grade.percentage)} w-[4.3rem] text-right font-mono text-sm font-bold"
			/>
			<div class="bg-secondary h-1.5 min-w-0 flex-1 overflow-hidden rounded-full">
				<div
					class="h-full rounded-full {indicatorTone(grade.percentage)}"
					style:width={`${Math.min(Math.max(grade.percentage, 0), 100)}%`}
				></div>
			</div>
		{:else}
			<span class="text-muted-foreground ml-auto text-sm">Not graded</span>
		{/if}
	</div>

	{#if grade}
		<NumberFlow
			value={grade.percentage / 100}
			format={{ style: 'percent', maximumFractionDigits: 1 }}
			class="{gradeTone(grade.percentage)} text-right font-mono text-sm font-bold sm:hidden"
		/>
	{:else}
		<span class="text-muted-foreground text-xs sm:hidden">Not graded</span>
	{/if}
</a>
