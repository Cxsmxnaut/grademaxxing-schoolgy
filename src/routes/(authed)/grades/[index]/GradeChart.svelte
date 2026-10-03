<script lang="ts">
	import * as Chart from '$lib/components/ui/chart';
	import type { Assignment, Category } from '$lib/grades/assignments';
	import { getEstimatedGradeTrend, getGradeChartDomain } from '$lib/grades/grade-chart';
	import type { OfficialGradeSnapshot } from '$lib/grades/official-grade-history';
	import { formatPercentage } from '$lib/grades/percentage-format';
	import { Area, AreaChart, LinearGradient, Points } from 'layerchart';

	interface Props {
		snapshots: OfficialGradeSnapshot[];
		assignments: Assignment[];
		gradeCategories?: Category[];
		hypotheticalMode: boolean;
		hypotheticalGrade: number;
	}
	let { snapshots, assignments, gradeCategories, hypotheticalMode, hypotheticalGrade }: Props =
		$props();

	const assignmentPoints = $derived(
		hypotheticalMode
			? getEstimatedGradeTrend(assignments, gradeCategories, hypotheticalGrade)
			: snapshots.length === 1
				? getEstimatedGradeTrend(assignments, gradeCategories, snapshots[0]?.percentage)
				: []
	);

	const chartData = $derived.by(() => {
		if (hypotheticalMode && assignmentPoints.length > 0)
			return assignmentPoints.map(({ observedAt, percentage, assignmentNames }) => ({
				date: new Date(observedAt),
				grade: percentage,
				source: 'assignment' as const,
				assignmentNames
			}));
		const firstOfficialDate = snapshots[0]?.observedAt ?? 0;
		return [
			...assignmentPoints
				.filter(({ observedAt }) => observedAt < firstOfficialDate)
				.map(({ observedAt, percentage, assignmentNames }) => ({
					date: new Date(observedAt),
					grade: percentage,
					source: 'assignment' as const,
					assignmentNames
				})),
			...snapshots.map(({ observedAt, percentage }) => ({
				date: new Date(observedAt),
				grade: percentage,
				source: 'official' as const,
				assignmentNames: [] as string[]
			}))
		].filter(({ date, grade }) => Number.isFinite(date.getTime()) && Number.isFinite(grade));
	});
	const yDomain = $derived(getGradeChartDomain(chartData.map(({ grade }) => grade)));
	const dayFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});
</script>

{#if chartData.length >= 2}
	<Chart.Container
		config={{}}
		class="m-4 aspect-auto h-[11.25rem] sm:m-5"
		data-testid="grade-trend-chart"
	>
		<AreaChart data={chartData} x="date" y="grade" {yDomain}>
			{#snippet tooltip()}
				<Chart.Tooltip labelFormatter={dayFormatter.format} hideIndicator={true}>
					{#snippet formatter({ value, item })}
						<div>
							<p>{formatPercentage(Number(value))}%</p>
							{#if item.payload.source === 'official'}
								<p>Official StudentVUE grade</p>
							{:else}
								{#each item.payload.assignmentNames as name, index (`${name}-${index}`)}
									<p>{name}</p>
								{/each}
							{/if}
						</div>
					{/snippet}
				</Chart.Tooltip>
			{/snippet}

			{#snippet marks()}
				<LinearGradient
					stops={['var(--tw-gradient-from)', 'var(--tw-gradient-via)', 'var(--tw-gradient-to)']}
					class="from-chart-bg/50 via-chart-bg/15 to-chart-bg/1"
					vertical
				>
					{#snippet children({ gradient })}
						<Area line={{ class: 'stroke-chart stroke-2' }} fill={gradient} />
					{/snippet}
				</LinearGradient>
				<Points r={4} class="fill-chart" />
			{/snippet}
		</AreaChart>
	</Chart.Container>
{:else if chartData.length === 1}
	<div
		class="bg-secondary/35 m-4 flex h-[11.25rem] flex-col items-center justify-center gap-2 rounded-xl text-center sm:m-5"
		role="status"
		data-testid="grade-trend-insufficient"
	>
		<p class="font-mono text-3xl font-semibold">
			{formatPercentage(chartData[0]!.grade)}%
		</p>
		<p class="text-sm">
			{chartData[0]!.source === 'official' ? 'Official StudentVUE grade' : 'Calculated grade'}
		</p>
		<p class="text-muted-foreground max-w-sm text-sm">
			Only one graded date is available. Your trend graph will appear after another grade is posted.
		</p>
	</div>
{:else}
	<div
		class="bg-secondary/35 m-4 flex h-[11.25rem] items-center justify-center rounded-xl sm:m-5"
		role="status"
		data-testid="grade-trend-empty"
	>
		<p class="text-muted-foreground text-sm">No grade trend is available yet.</p>
	</div>
{/if}
