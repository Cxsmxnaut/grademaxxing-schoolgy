<script lang="ts">
	import { removeCourseType } from '$lib';
	import { acc } from '$lib/account.svelte';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { gradebookState, initializeGradebookCatalog } from '$lib/grades/catalog.svelte';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import {
		calculateGpa,
		calculateGpaPipelines,
		formatGpa,
		getGpaCourses,
		letterGradePoints
	} from '$lib/grades/gpa';
	import { GPA_POLICY } from '$lib/grades/gpa-policy';
	import type { TranscriptImport } from '$lib/grades/transcript';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import { onMount, untrack } from 'svelte';

	type GpaRow = {
		id: string;
		name: string;
		letter: string;
		weighted: boolean;
		weightBonus: number;
		academic: boolean;
	};
	const gradeOptions = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];
	let rows = $state<GpaRow[]>([]);
	let loadedCourseKey = '';
	let transcript = $state<TranscriptImport | undefined>();
	let transcriptLoading = $state(false);
	let transcriptError = $state(false);
	const transcriptGpa = $derived(
		transcript?.enrollments.length ? calculateGpaPipelines(transcript.enrollments) : undefined
	);

	const courses = $derived.by(() => {
		gradebookState.version;
		return getActiveGradebook()?.Courses.Course ?? [];
	});
	const courseKey = $derived(
		courses
			.map((course) => `${course._CourseID}:${course.Marks?.Mark[0]?._CalculatedScoreString ?? ''}`)
			.join('|')
	);
	const unweighted = $derived(
		calculateGpa(rows.flatMap((row) => letterGradePoints(row.letter) ?? []))
	);
	const weighted = $derived(
		calculateGpa(
			rows.flatMap((row) => {
				const points = letterGradePoints(row.letter);
				return points === undefined ? [] : [points + (row.weighted ? row.weightBonus : 0)];
			})
		)
	);
	const academicWeighted = $derived(
		calculateGpa(
			rows.flatMap((row) => {
				const points = letterGradePoints(row.letter);
				return points === undefined || !row.academic
					? []
					: [points + (row.weighted ? row.weightBonus : 0)];
			})
		)
	);

	onMount(() => {
		if (!acc.studentAccount) return;
		void initializeGradebookCatalog();
		transcriptLoading = true;
		void acc.studentAccount
			.transcript()
			.then((result) => (transcript = result.transcript))
			.catch(() => (transcriptError = true))
			.finally(() => (transcriptLoading = false));
	});

	$effect(() => {
		if (!courseKey || courseKey === loadedCourseKey) return;
		const nextRows = getGpaCourses(courses).map(
			({ course, letter, weighted, weightBonus, academic }) => ({
				id: course._CourseID,
				name: removeCourseType(course._CourseName),
				letter,
				weighted,
				weightBonus,
				academic
			})
		);
		untrack(() => {
			rows = nextRows;
			loadedCourseKey = courseKey;
		});
	});

	function resetRows() {
		rows = getGpaCourses(courses).map(({ course, letter, weighted, weightBonus, academic }) => ({
			id: course._CourseID,
			name: removeCourseType(course._CourseName),
			letter,
			weighted,
			weightBonus,
			academic
		}));
	}
</script>

<svelte:head><title>GPA calculator - {brand}</title></svelte:head>

<AppPageShell>
	<div class="max-w-[62rem]">
		<div class="flex items-start justify-between gap-4">
			<a
				href="/grades"
				class="text-primary inline-flex items-center gap-2 text-sm font-semibold hover:underline"
				><ArrowLeftIcon class="size-4" /> Back to Gradebook</a
			>
			<Button variant="outline" size="sm" onclick={resetRows}>Reset all</Button>
		</div>

		<p class="text-primary mt-3 text-[0.68rem] font-bold tracking-[0.15em] uppercase">Projected</p>
		<h1
			class="font-heading mt-2 text-2xl leading-[1.5] font-bold tracking-[-0.035em] sm:text-[1.875rem] sm:leading-[1.2]"
		>
			GPA calculator
		</h1>
		<p class="text-muted-foreground mt-1 text-sm">
			Try hypothetical grades and see how your GPA moves — nothing here touches your real grades.
		</p>

		<section
			class="border-border/80 bg-card mt-2 grid overflow-hidden rounded-xl border shadow-sm sm:mt-5 sm:grid-cols-3"
			aria-label="Estimated GPA"
		>
			<div class="h-[5.6875rem] px-5 pt-3 pb-1 sm:h-auto sm:min-h-28 sm:px-7 sm:py-5">
				<p class="metric-label">GPA · Unweighted</p>
				<div class="mt-2 flex items-baseline gap-3">
					<p class="text-success font-heading text-[2rem] font-bold tracking-[-0.035em]">
						{formatGpa(unweighted)}
					</p>
					<p class="text-muted-foreground font-mono text-xs">{rows.length} courses</p>
				</div>
			</div>
			<div
				class="border-border/70 h-[5.6875rem] border-t px-5 pt-3 pb-1 sm:h-auto sm:min-h-28 sm:border-t-0 sm:border-l sm:px-7 sm:py-5"
			>
				<p class="metric-label">GPA · Weighted</p>
				<p class="font-heading mt-2 text-[2rem] font-bold tracking-[-0.035em]">
					{formatGpa(weighted)}
				</p>
			</div>
			<div
				class="border-border/70 h-[5.6875rem] border-t px-5 pt-3 pb-1 sm:h-auto sm:min-h-28 sm:border-t-0 sm:border-l sm:px-7 sm:py-5"
			>
				<p class="metric-label">GPA · Academic weighted</p>
				<p class="font-heading mt-2 text-[2rem] font-bold tracking-[-0.035em]">
					{formatGpa(academicWeighted)}
				</p>
			</div>
		</section>

		<p class="text-muted-foreground mt-5 text-xs leading-5">
			{GPA_POLICY.label} estimate: AP/IB courses add +1.0 and honors courses add +0.5 when eligible. This
			is not an official transcript GPA; update the policy when your district confirms its rules.
		</p>

		<section
			class="border-border/80 bg-card mt-4 overflow-hidden rounded-xl border shadow-sm sm:mt-5"
			aria-label="Transcript GPA"
		>
			<div class="border-border/70 border-b px-5 py-4">
				<h2 class="font-bold">Transcript GPA</h2>
				<p class="text-muted-foreground mt-1 text-sm">
					Completed courses and credit values from StudentVUE report cards.
				</p>
			</div>
			{#if transcriptLoading}
				<p class="text-muted-foreground px-5 py-5 text-sm">
					Loading transcript history. It's a longer story.
				</p>
			{:else if transcriptError}
				<p class="text-muted-foreground px-5 py-5 text-sm">
					Transcript history did not load. The hypothetical calculator still works.
				</p>
			{:else if transcriptGpa && transcript}
				<div class="grid gap-4 px-5 py-5 sm:grid-cols-3">
					<div>
						<p class="metric-label">Unweighted</p>
						<p class="font-heading mt-1 text-2xl font-bold">
							{formatGpa(transcriptGpa.unweighted)}
						</p>
					</div>
					<div>
						<p class="metric-label">Weighted</p>
						<p class="font-heading mt-1 text-2xl font-bold">{formatGpa(transcriptGpa.weighted)}</p>
					</div>
					<div>
						<p class="metric-label">Academic weighted</p>
						<p class="font-heading mt-1 text-2xl font-bold">
							{formatGpa(transcriptGpa.academicWeighted)}
						</p>
					</div>
				</div>
				<p class="text-muted-foreground border-border/70 border-t px-5 py-3 text-xs leading-5">
					{transcript.message} This remains a policy-based calculation, not a district-issued GPA.
				</p>
			{:else if transcript}
				<p class="text-muted-foreground px-5 py-5 text-sm">{transcript.message}</p>
			{/if}
		</section>

		<section
			class="border-border/80 bg-card mt-4 overflow-hidden rounded-xl border shadow-sm sm:mt-5"
		>
			<div class="border-border/70 border-b px-5 py-4">
				<h2 class="font-bold">Courses</h2>
			</div>
			{#if rows.length}
				<ol class="divide-border/70 divide-y">
					{#each rows as row, index (row.id)}
						<li
							class="grid grid-cols-[minmax(0,1fr)_230px] items-center gap-2 px-3 py-2.5 text-[13px] leading-[1.5] sm:gap-3 sm:px-5 sm:py-[0.8125rem] sm:text-sm"
						>
							<div class="min-w-0">
								<p class="font-semibold">{row.name}</p>
								<p class="text-muted-foreground mt-0.5 font-mono text-xs">
									current: {getGpaCourses(courses)[index]?.letter ?? row.letter}
								</p>
								<div class="mt-2 flex items-center gap-2">
									{#if row.weightBonus > 0}
										<Checkbox bind:checked={row.weighted} id={`weighted-${row.id}`} /><Label
											for={`weighted-${row.id}`}
											class="text-xs"
											>weighted <span class="text-muted-foreground ml-1 font-mono"
												>+{row.weightBonus.toFixed(1)}</span
											></Label
										>
									{:else}
										<span class="text-muted-foreground text-xs">not weighted by policy</span>
									{/if}
								</div>
							</div>
							<label class="grid gap-1 justify-self-end text-xs font-semibold"
								><span class="sr-only">Projected grade</span><select
									bind:value={row.letter}
									class="border-input bg-background h-[2.375rem] w-[7.375rem] justify-self-end rounded-[0.625rem] border px-2.5 text-sm font-semibold"
									>{#each gradeOptions as grade (grade)}<option value={grade}
											>{grade}{grade === getGpaCourses(courses)[index]?.letter
												? ' (current)'
												: ''}</option
										>{/each}</select
								></label
							>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="text-muted-foreground px-5 py-10 text-center text-sm">
					No graded courses are available for this report period. The calculator can't invent them.
				</p>
			{/if}
		</section>
	</div>
</AppPageShell>

<style>
	.metric-label {
		color: var(--muted-foreground);
		font-size: 0.69rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
</style>
