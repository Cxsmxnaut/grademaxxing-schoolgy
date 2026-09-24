<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import RankEmblem from '$lib/components/RankEmblem.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import { getRankAchievements } from '$lib/grades/achievements';
	import { gradebookState, initializeGradebookCatalog } from '$lib/grades/catalog.svelte';
	import { getCourseGrade, isNotForGrade } from '$lib/grades/course';
	import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
	import { getGpaRank, GPA_RANKS } from '$lib/grades/rank';
	import { parseGradebookXML } from '$lib/synergy';
	import AwardIcon from '@lucide/svelte/icons/award';
	import CheckIcon from '@lucide/svelte/icons/check';
	import LockKeyholeIcon from '@lucide/svelte/icons/lock-keyhole';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';
	import TargetIcon from '@lucide/svelte/icons/target';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import { onMount } from 'svelte';
	import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
	import { studentInfoState } from '../studentinfo/studentInfo.svelte';

	function firstFinite(...values: (string | undefined)[]) {
		for (const value of values) {
			const number = Number.parseFloat(value ?? '');
			if (Number.isFinite(number)) return number;
		}
		return undefined;
	}

	function achievementAssignment(assignment: AssignmentEntity, courseId: string, order: number) {
		const earned = firstFinite(assignment._Point, assignment._ScoreCalValue, assignment._Score);
		const possible = firstFinite(assignment._PointPossible, assignment._ScoreMaxValue);
		if (earned === undefined || possible === undefined || possible <= 0) return undefined;
		const parsedDate = Date.parse(assignment._DueDate || assignment._Date);
		return {
			courseId,
			date: (Number.isFinite(parsedDate) ? parsedDate : 0) + order / 1000,
			earned,
			possible
		};
	}

	onMount(() => {
		void initializeGradebookCatalog();
	});

	const gradebook = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const record = catalog.recordCache[catalog.overrideIndex ?? catalog.defaultIndex];
		return record ? parseGradebookXML(record.xml) : undefined;
	});
	const courses = $derived(gradebook?.Courses.Course ?? []);
	const gpas = $derived(calculateCourseGpas(courses, studentInfoState.data?.Grade ?? undefined));
	const gradedCourses = $derived(
		courses.flatMap((course) => (getCourseGrade(course) ? [course] : []))
	);
	const rank = $derived(getGpaRank(gpas.unweighted, gradedCourses.length));
	const achievementCourses = $derived(
		gradedCourses.flatMap((course) => {
			const grade = getCourseGrade(course);
			return grade ? [{ id: course._CourseID, percentage: grade.percentage }] : [];
		})
	);
	const achievementAssignments = $derived(
		courses.flatMap((course) =>
			(course.Marks?.Mark[0]?.Assignments?.Assignment ?? []).flatMap((assignment, order) => {
				if (isNotForGrade(assignment._Notes)) return [];
				const scored = achievementAssignment(assignment, course._CourseID, order);
				return scored ? [scored] : [];
			})
		)
	);
	const achievements = $derived(
		getRankAchievements({
			courses: achievementCourses,
			assignments: achievementAssignments
		})
	);
	const unlockedAchievements = $derived(
		achievements.filter((achievement) => achievement.unlocked).length
	);
</script>

<svelte:head><title>Rankings - {brand}</title></svelte:head>

<AppPageShell class="max-w-[78rem]">
	<AppPageHeader
		eyebrow="Progress"
		title="Rankings & achievements"
		description="Build your GPA tier and unlock milestones from the grades in your active report period. These are Grademaxxing goals—not your school’s official class rank or awards."
	/>

	{#if !gradebook && !gradebookState.loadingError}
		<div class="border-border bg-card flex min-h-64 items-center justify-center rounded-2xl border">
			<div class="text-muted-foreground flex items-center gap-3 text-sm">
				<Spinner class="size-5" /> Calculating your progress…
			</div>
		</div>
	{:else if !gradebook}
		<section class="border-border bg-card rounded-2xl border px-6 py-12 text-center">
			<TrophyIcon class="text-muted-foreground mx-auto size-9" />
			<h2 class="font-heading mt-4 text-xl font-bold">No rank data yet</h2>
			<p class="text-muted-foreground mx-auto mt-2 max-w-md text-sm leading-6">
				Your ranking appears after the gradebook loads at least one calculated course grade.
			</p>
		</section>
	{:else}
		<div class="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.7fr)]">
			<section
				class="border-border bg-card relative overflow-hidden rounded-2xl border p-6 shadow-sm sm:p-8"
				style:--rank-color={rank?.current.color ?? 'var(--color-muted-foreground)'}
				aria-labelledby="current-rank-heading"
			>
				<div
					class="pointer-events-none absolute inset-0 opacity-70"
					style="background: radial-gradient(circle at 12% 12%, color-mix(in oklab, var(--rank-color) 22%, transparent), transparent 42%), linear-gradient(120deg, transparent 55%, color-mix(in oklab, var(--rank-color) 5%, transparent));"
				></div>
				<div class="relative flex flex-col gap-7 sm:flex-row sm:items-center">
					<RankEmblem
						color={rank?.current.color ?? '#aab7c5'}
						size={112}
						label={`${rank?.current.name ?? 'Unranked'} GPA rank`}
					/>
					<div class="min-w-0 flex-1">
						<p class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.16em] uppercase">
							Current tier
						</p>
						<div class="mt-1 flex flex-wrap items-center gap-3">
							<h2
								id="current-rank-heading"
								class="font-heading text-4xl font-bold tracking-[-0.04em] sm:text-5xl"
								style:color={rank?.current.color}
							>
								{rank?.current.name ?? 'Unranked'}
							</h2>
							{#if rank?.provisional}
								<span
									class="border-border bg-secondary text-muted-foreground rounded-full border px-2.5 py-1 text-[0.6875rem] font-bold tracking-wide uppercase"
									>Provisional</span
								>
							{/if}
						</div>
						<p class="text-muted-foreground mt-2 text-sm">
							Estimated unweighted GPA <strong class="text-foreground font-mono"
								>{formatGpa(gpas.unweighted)}</strong
							>
						</p>
						{#if rank?.provisional}
							<p class="text-muted-foreground mt-2 text-xs leading-5">
								Based on {rank.gradedCourses} graded {rank.gradedCourses === 1
									? 'class'
									: 'classes'}. Add {rank.coursesNeeded} more to confirm this tier.
							</p>
						{/if}

						{#if rank?.next}
							<div class="mt-6" aria-label={`Progress to ${rank.next.name}`}>
								<div class="mb-2 flex items-center justify-between gap-4 text-xs">
									<span class="font-semibold">Next: {rank.next.name}</span>
									<span class="text-muted-foreground font-mono"
										>{rank.pointsAway.toFixed(2)} GPA to go</span
									>
								</div>
								<div
									class="bg-secondary h-2 overflow-hidden rounded-full"
									role="progressbar"
									aria-label={`Progress to ${rank.next.name}`}
									aria-valuemin="0"
									aria-valuemax="100"
									aria-valuenow={Number((rank.progress * 100).toFixed(1))}
									aria-valuetext={`${rank.pointsAway.toFixed(2)} GPA points to ${rank.next.name}`}
								>
									<div
										class="h-full rounded-full transition-[width] duration-500"
										style:background={rank.next.color}
										style:width={`${rank.progress * 100}%`}
									></div>
								</div>
							</div>
						{:else if rank}
							{#if rank.provisional}
								<p class="text-muted-foreground mt-5 flex items-center gap-2 text-sm font-semibold">
									<SparklesIcon class="size-4" /> Currently calculating at the highest tier.
								</p>
							{:else}
								<p class="text-grade-strong mt-5 flex items-center gap-2 text-sm font-semibold">
									<SparklesIcon class="size-4" /> You reached the highest tier.
								</p>
							{/if}
						{/if}
					</div>
				</div>
			</section>

			<section
				class="border-border bg-card rounded-2xl border p-6 shadow-sm"
				aria-labelledby="progress-heading"
			>
				<div class="flex items-start justify-between gap-4">
					<div>
						<p class="text-muted-foreground font-mono text-[0.6875rem] tracking-[0.14em] uppercase">
							Collection
						</p>
						<h2 id="progress-heading" class="font-heading mt-1 text-xl font-bold">
							Achievement progress
						</h2>
					</div>
					<AwardIcon class="text-primary size-7" />
				</div>
				<p class="mt-7 font-mono text-4xl font-bold tabular-nums">
					{unlockedAchievements}<span class="text-muted-foreground text-lg">
						/ {achievements.length}</span
					>
				</p>
				<p class="text-muted-foreground mt-1 text-sm">achievements unlocked</p>
				<div
					class="bg-secondary mt-5 h-2 overflow-hidden rounded-full"
					role="progressbar"
					aria-label="Achievements unlocked"
					aria-valuemin="0"
					aria-valuemax={achievements.length}
					aria-valuenow={unlockedAchievements}
					aria-valuetext={`${unlockedAchievements} of ${achievements.length} achievements unlocked`}
				>
					<div
						class="bg-primary h-full rounded-full"
						style:width={`${(unlockedAchievements / achievements.length) * 100}%`}
					></div>
				</div>
				<div class="border-border mt-6 flex items-center justify-between border-t pt-5 text-sm">
					<span class="text-muted-foreground">Graded classes</span>
					<strong class="font-mono">{gradedCourses.length}</strong>
				</div>
			</section>
		</div>

		<section class="mt-8 sm:mt-10" aria-labelledby="rank-ladder-heading">
			<div class="mb-4 flex items-end justify-between gap-4">
				<div>
					<p
						class="text-primary font-mono text-[0.6875rem] font-semibold tracking-[0.16em] uppercase"
					>
						The climb
					</p>
					<h2 id="rank-ladder-heading" class="font-heading mt-1 text-xl font-bold sm:text-2xl">
						Rank ladder
					</h2>
				</div>
				<p class="text-muted-foreground hidden max-w-md text-right text-xs leading-5 sm:block">
					Upper tiers use stricter GPA thresholds so every promotion means more.
				</p>
			</div>

			<ol class="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				{#each GPA_RANKS as tier (tier.name)}
					{@const unlocked = (gpas.unweighted ?? -1) >= tier.min}
					{@const current = rank?.current.name === tier.name}
					<li
						class="border-border bg-card relative overflow-hidden rounded-xl border p-4 shadow-sm transition-[border-color,transform] {current
							? 'ring-primary ring-offset-background -translate-y-0.5 ring-2 ring-offset-2'
							: ''} {unlocked ? '' : 'opacity-60'}"
					>
						<div class="flex items-center justify-between gap-3">
							<RankEmblem color={tier.color} size={42} label={`${tier.name} GPA rank`} />
							{#if current}
								<span
									class="bg-primary/10 text-primary rounded-full px-2 py-1 text-[0.625rem] font-bold uppercase"
								>
									Current
								</span>
							{:else if unlocked}
								<CheckIcon class="text-grade-strong size-4" aria-label="Unlocked" />
							{:else}
								<LockKeyholeIcon class="text-muted-foreground size-4" aria-label="Not reached" />
							{/if}
						</div>
						<h3 class="font-heading mt-4 text-base font-bold" style:color={tier.color}>
							{tier.name}
						</h3>
						<p class="text-muted-foreground mt-1 font-mono text-xs">
							{tier.min === 0 ? 'Start here' : `${tier.min.toFixed(2)}+ GPA`}
						</p>
					</li>
				{/each}
			</ol>
		</section>

		<section class="mt-10 sm:mt-12" aria-labelledby="achievements-heading">
			<div class="mb-4">
				<p
					class="text-primary font-mono text-[0.6875rem] font-semibold tracking-[0.16em] uppercase"
				>
					Milestones
				</p>
				<h2 id="achievements-heading" class="font-heading mt-1 text-xl font-bold sm:text-2xl">
					Achievements
				</h2>
			</div>

			<ul class="grid gap-3 lg:grid-cols-2">
				{#each achievements as achievement (achievement.id)}
					<li
						class="border-border bg-card rounded-xl border p-5 shadow-sm transition-colors {achievement.unlocked
							? 'hover:border-primary/35'
							: 'bg-card/70'}"
					>
						<div class="flex items-start gap-4">
							<div
								class="grid size-11 shrink-0 place-items-center rounded-xl {achievement.unlocked
									? 'bg-primary/12 text-primary'
									: 'bg-secondary text-muted-foreground'}"
							>
								{#if achievement.unlocked}<AwardIcon class="size-5" />{:else}<TargetIcon
										class="size-5"
									/>{/if}
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-3">
									<p
										class="text-primary font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase"
									>
										{achievement.category}
									</p>
									<span class="text-muted-foreground text-[0.625rem] font-bold uppercase">
										{achievement.unlocked ? 'Unlocked' : 'In progress'}
									</span>
								</div>
								<h3 class="font-heading mt-1 font-bold">{achievement.title}</h3>
								<p class="text-muted-foreground mt-1 min-h-10 text-xs leading-5 lg:min-h-0">
									{achievement.description}
								</p>
								<div
									class="bg-secondary mt-3 h-1.5 overflow-hidden rounded-full"
									role="progressbar"
									aria-label={`${achievement.title} progress`}
									aria-valuemin="0"
									aria-valuemax="100"
									aria-valuenow={Number((achievement.progress * 100).toFixed(1))}
									aria-valuetext={achievement.progressLabel}
								>
									<div
										class="h-full rounded-full {achievement.unlocked
											? 'bg-grade-strong'
											: 'bg-primary'}"
										style:width={`${achievement.progress * 100}%`}
									></div>
								</div>
								<p class="text-muted-foreground mt-2 font-mono text-[0.6875rem]">
									{achievement.progressLabel}
								</p>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</AppPageShell>
