<script lang="ts">
	import * as Chart from '$lib/components/ui/chart';
	import { getGradeChartDomain } from '$lib/grades/grade-chart';
	import {
		calculateCourseGradePercentageFromCategories,
		calculateCourseGradePercentageFromTotals,
		getCalculableAssignments,
		getCalculableAssignmentsWithCategories,
		getPointsByCategory,
		type Assignment,
		type Calculable,
		type CalculableWithCategory,
		type Category
	} from '$lib/grades/assignments';
	import { Area, AreaChart, LinearGradient, Points } from 'layerchart';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		assignments: Assignment[];
		gradeCategories?: Category[];
		animate: boolean;
		officialGrade?: number;
	}
	let { assignments, gradeCategories, officialGrade }: Props = $props();

	interface DataPointMetadata {
		assignmentsOnDate: Assignment[];
		label?: string;
	}

	type ChartPoint = {
		date: Date;
		grade: number;
		metadata: DataPointMetadata;
	};

	const assignmentChartData: ChartPoint[] = $derived.by(() => {
		if (gradeCategories) {
			const assignmentsByDate: Map<number, CalculableWithCategory<Assignment>[]> = new SvelteMap();

			const calculableAssignments = getCalculableAssignmentsWithCategories(assignments);

			calculableAssignments.forEach((assignment) => {
				const ms = assignment.date.getTime();
				const existingAssignments = assignmentsByDate.get(ms) ?? [];
				assignmentsByDate.set(ms, [...existingAssignments, assignment]);
			});

			const entries = [...assignmentsByDate.entries()].toSorted(([ms_a], [ms_b]) => ms_a - ms_b);

			return entries
				.map(([ms, assignments], i) => {
					const assignmentsUntil = entries
						.map((entry) => entry[1])
						.slice(0, i + 1)
						.flat();

					const grade = calculateCourseGradePercentageFromCategories(
						getPointsByCategory(assignmentsUntil),
						gradeCategories
					);

					const metadata: DataPointMetadata = {
						assignmentsOnDate: assignments
					};

					return { date: new Date(ms), grade, metadata };
				})
				.filter(({ date, grade }) => Number.isFinite(date.getTime()) && Number.isFinite(grade));
		} else {
			const assignmentsByDate: Map<number, Calculable<Assignment>[]> = new SvelteMap();

			const calculableAssignments = getCalculableAssignments(assignments);

			calculableAssignments.forEach((assignment) => {
				const ms = assignment.date.getTime();
				const existingAssignments = assignmentsByDate.get(ms) ?? [];
				assignmentsByDate.set(ms, [...existingAssignments, assignment]);
			});

			const entries = [...assignmentsByDate.entries()].toSorted(([ms_a], [ms_b]) => ms_a - ms_b);

			return entries
				.map(([ms, assignments], i) => {
					const assignmentsUntil = entries
						.map((entry) => entry[1])
						.slice(0, i + 1)
						.flat();

					const grade = calculateCourseGradePercentageFromTotals(assignmentsUntil);

					const metadata: DataPointMetadata = {
						assignmentsOnDate: assignments
					};

					return { date: new Date(ms), grade, metadata };
				})
				.filter(({ date, grade }) => Number.isFinite(date.getTime()) && Number.isFinite(grade));
		}
	});

	const chartData: ChartPoint[] = $derived.by(() => {
		const points = [...assignmentChartData];
		if (officialGrade === undefined || !Number.isFinite(officialGrade)) return points;
		const last = points.at(-1);
		if (last && Math.abs(last.grade - officialGrade) < 0.001) return points;
		const date = new Date(Math.max(Date.now(), (last?.date.getTime() ?? 0) + 1));
		points.push({
			date,
			grade: officialGrade,
			metadata: { assignmentsOnDate: [], label: 'Official StudentVUE grade' }
		});
		return points;
	});

	const yDomain = $derived(getGradeChartDomain(chartData.map(({ grade }) => grade)));

	const dayFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric'
	});

	const percentFormatter = new Intl.NumberFormat('en-US', {
		style: 'percent',
		maximumFractionDigits: 3
	});
</script>

{#if chartData.length >= 2}
	<Chart.Container
		config={{}}
		class="m-4 aspect-auto h-[11.25rem] sm:m-5"
		data-testid="grade-trend-chart"
	>
		<!-- https://techniq-docs-v2.layerchart.pages.dev/docs -->
		<AreaChart data={chartData} x="date" y="grade" {yDomain}>
			{#snippet tooltip()}
				<Chart.Tooltip labelFormatter={dayFormatter.format} hideIndicator={true}>
					{#snippet formatter({ value, item })}
						<div>
							<p>{percentFormatter.format(Number(value) / 100)}</p>
							{#if (item.payload.metadata as DataPointMetadata).label}
								<p>{(item.payload.metadata as DataPointMetadata).label}</p>
							{/if}
							{#each (item.payload.metadata as DataPointMetadata).assignmentsOnDate as assignment (assignment.id)}
								<p>{assignment.name}</p>
							{/each}
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
			{percentFormatter.format(chartData[0]!.grade / 100)}
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
		<p class="text-muted-foreground text-sm">No graded assignments are available to chart yet.</p>
	</div>
{/if}
