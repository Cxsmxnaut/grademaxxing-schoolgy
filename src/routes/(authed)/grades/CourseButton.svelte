<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import ArrowRightIcon from '@lucide/svelte/icons/arrow-right';
	import BellElectricIcon from '@lucide/svelte/icons/bell-electric';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import UserIcon from '@lucide/svelte/icons/user';
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

	function getGradeTone(percentage: number) {
		if (percentage > 100) return 'text-grade-extra';
		if (percentage >= 90) return 'text-grade-strong';
		if (percentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	}

	function getGradeSurface(percentage: number) {
		if (percentage > 100) return 'bg-grade-extra-soft';
		if (percentage >= 90) return 'bg-grade-strong-soft';
		if (percentage >= 80) return 'bg-grade-watch-soft';
		return 'bg-grade-risk-soft';
	}
</script>

<a
	href="/grades/{encodeURIComponent(courseId)}"
	class="group hover:bg-accent/45 focus-visible:ring-ring grid min-h-24 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 transition-colors focus-visible:ring-2 focus-visible:outline-none sm:grid-cols-[3.5rem_minmax(0,1fr)_auto] sm:gap-5 sm:px-6"
>
	<div
		class="bg-secondary text-muted-foreground flex size-12 shrink-0 flex-col items-center justify-center rounded-xl"
		aria-label="Period {period}"
	>
		<span class="text-[0.6rem] font-bold tracking-[0.12em] uppercase">Period</span>
		<strong class="text-foreground -mt-0.5 font-mono text-xl">{period}</strong>
	</div>

	<div class="min-w-0">
		<div class="flex min-w-0 items-center gap-2">
			<h2 class="truncate text-base font-bold tracking-[-0.01em] sm:text-lg">{name}</h2>
			{#if unseenAssignmentsCount > 0}
				<Badge
					variant="outline"
					class="border-grade-strong/20 bg-grade-strong-soft text-grade-strong shrink-0"
				>
					<BellElectricIcon class="size-3" />
					{unseenAssignmentsCount} new
				</Badge>
			{/if}
		</div>
		<div
			class="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm"
		>
			{#if teacher}
				<span class="inline-flex min-w-0 items-center gap-1.5">
					<UserIcon class="size-3.5 shrink-0" />
					<span class="truncate">{teacher}</span>
				</span>
			{/if}
			{#if room}
				<span class="inline-flex items-center gap-1.5">
					<MapPinIcon class="size-3.5" /> Room {room}
				</span>
			{/if}
		</div>
	</div>

	<div class="flex items-center gap-2.5 sm:gap-4">
		{#if grade}
			<div
				class="{getGradeSurface(
					grade.percentage
				)} flex min-w-20 flex-col items-end rounded-xl px-3 py-2 sm:min-w-28 sm:px-4"
			>
				<strong class="{getGradeTone(grade.percentage)} text-xl leading-none sm:text-2xl">
					{grade.letter}
				</strong>
				<NumberFlow
					value={grade.percentage / 100}
					format={{ style: 'percent', maximumFractionDigits: 2 }}
					class="text-muted-foreground mt-1 font-mono text-xs"
				/>
			</div>
		{:else}
			<div class="text-muted-foreground min-w-20 text-right text-sm sm:min-w-28">Not graded</div>
		{/if}
		<ArrowRightIcon
			class="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5"
		/>
	</div>
</a>
