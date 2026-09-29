<script lang="ts">
	import Clock3Icon from '@lucide/svelte/icons/clock-3';
	import MapPinIcon from '@lucide/svelte/icons/map-pin';
	import UserRoundIcon from '@lucide/svelte/icons/user-round';

	interface Props {
		courseId: string;
		position: number;
		name: string;
		period: string;
		room: string;
		teacher: string;
		teacherEmail: string;
		unseenAssignmentsCount: number;
		grade?: { letter: string; percentage: number };
	}
	const { courseId, position, name, period, room, teacher, unseenAssignmentsCount, grade }: Props =
		$props();

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
	class="group border-border bg-card hover:border-primary focus-visible:ring-ring grid grid-cols-[40px_minmax(0,1fr)_78px] items-center gap-3 rounded-[0.75rem] border px-[0.875rem] py-[0.8125rem] transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-[82px] sm:grid-cols-[56px_minmax(0,1fr)_minmax(280px,40%)] sm:gap-4 sm:px-5 sm:py-4"
>
	<div
		aria-hidden="true"
		class="border-border bg-secondary text-foreground grid size-10 place-items-center rounded-full border text-base font-bold sm:size-12 sm:text-lg"
	>
		{position}
	</div>

	<div class="min-w-0">
		<div class="flex min-w-0 items-center gap-2">
			<h2
				class="truncate text-[0.9375rem] leading-[1.3] font-semibold tracking-normal sm:text-[1.03125rem]"
			>
				{name}
			</h2>
			{#if unseenAssignmentsCount > 0}
				<span class="bg-primary/12 text-primary rounded-full px-2 py-0.5 text-[0.65rem] font-bold">
					{unseenAssignmentsCount} new
				</span>
			{/if}
		</div>
		<div
			class="text-muted-foreground mt-[0.4375rem] flex flex-wrap items-center gap-1.5 text-[0.71875rem] leading-[normal] font-medium tracking-[0.04em]"
		>
			<span
				class="bg-secondary inline-flex h-[1.3125rem] items-center gap-[0.3125rem] rounded-full px-[0.5625rem]"
			>
				<Clock3Icon class="size-3" /> Period {period}
			</span>
			{#if room}
				<span
					class="bg-secondary inline-flex h-[1.3125rem] items-center gap-[0.3125rem] rounded-full px-[0.5625rem]"
				>
					<MapPinIcon class="size-3" />
					{room}
				</span>
			{/if}
			{#if teacher}
				<div class="basis-full sm:basis-auto">
					<span
						class="bg-secondary inline-flex h-[1.3125rem] min-w-0 items-center gap-[0.3125rem] rounded-full px-[0.5625rem]"
					>
						<UserRoundIcon class="size-3 shrink-0" />
						<span class="max-w-28 truncate sm:max-w-36">{teacher}</span>
					</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="min-w-0">
		{#if grade}
			<div
				class="{gradeTone(
					grade.percentage
				)} flex items-baseline justify-end gap-1.5 whitespace-nowrap font-bold sm:justify-start sm:gap-2"
				style="font-family: 'Outfit', 'Manrope', system-ui, sans-serif;"
			>
				<span class="text-base sm:text-2xl">{grade.letter}</span>
				<span class="text-sm sm:text-2xl"
					>{grade.percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span
				>
			</div>
			<div
				class="bg-secondary mt-1.5 h-1.5 min-w-0 overflow-hidden rounded-full sm:mt-2"
				role="progressbar"
				aria-label={`${name} grade`}
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Number(Math.min(Math.max(grade.percentage, 0), 100).toFixed(1))}
				aria-valuetext={`${grade.percentage.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`}
			>
				<div
					class="h-full rounded-full {indicatorTone(grade.percentage)}"
					style:width={`${Math.min(Math.max(grade.percentage, 0), 100)}%`}
				></div>
			</div>
		{:else}
			<span class="text-muted-foreground block text-right text-xs sm:text-left">Not graded</span>
		{/if}
	</div>
</a>
