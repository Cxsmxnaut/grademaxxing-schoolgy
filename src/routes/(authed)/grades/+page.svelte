<script lang="ts">
	import { removeCourseType } from '$lib/grades/course-name';
	import { acc } from '$lib/account.svelte';
	import { brand, brandName } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import RankEmblem from '$lib/components/RankEmblem.svelte';
	import {
		getReportPeriodName,
		gradebookState,
		initializeGradebookCatalog,
		switchReportPeriod
	} from '$lib/grades/catalog.svelte';
	import {
		clearCourseUnseenAssignments,
		getCourseGrade,
		getCourseUnseenAssignmentsCount
	} from '$lib/grades/course';
	import { saveSeenAssignmentsToLocalStorage } from '$lib/grades/seenAssignments';
	import { seenAssignmentIDs } from '$lib/grades/seenAssignments.svelte';
	import { calculateCourseGpas, formatGpa } from '$lib/grades/gpa';
	import { recordCourseGradeScaleObservation } from '$lib/grades/grade-scale';
	import { getGpaRank } from '$lib/grades/rank';
	import { parseGradebookXML } from '$lib/synergy';
	import type { AssignmentEntity } from '$lib/contracts/studentvue/gradebook';
	import CalculatorIcon from '@lucide/svelte/icons/calculator';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import ShareIcon from '@lucide/svelte/icons/share';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import CourseButton from './CourseButton.svelte';
	import ReportPeriodSwitcher from './ReportPeriodSwitcher.svelte';

	let rankShareOpen = $state(false);
	let currentGradeLevel = $state<number | undefined>(undefined);

	onMount(() => {
		const account = acc.studentAccount;
		if (!account) return;
		void initializeGradebookCatalog();
		void account
			.studentInfo()
			.then((profile) => {
				currentGradeLevel = profile.Grade ?? undefined;
			})
			.catch(() => {
				// GPA remains a clearly labeled current-gradebook estimate when the profile is unavailable.
				currentGradeLevel = undefined;
			});
	});

	const gradebookCatalog = $derived.by(() => {
		gradebookState.version;
		return gradebookState.gradebookCatalog;
	});
	const gradebook = $derived.by(() => {
		gradebookState.version;
		const catalog = gradebookState.gradebookCatalog;
		if (!catalog) return undefined;
		const record = catalog.recordCache[catalog.overrideIndex ?? catalog.defaultIndex];
		return record ? parseGradebookXML(record.xml) : undefined;
	});
	const activeReportPeriod = $derived(gradebook?.ReportingPeriod);
	const activeReportPeriodIndex = $derived(
		gradebookCatalog ? (gradebookCatalog.overrideIndex ?? gradebookCatalog.defaultIndex) : undefined
	);
	const courses = $derived(gradebook?.Courses.Course ?? []);
	$effect(() => {
		for (const course of courses) {
			const mark = course.Marks?.Mark[0];
			const percentage = Number.parseFloat(mark?._CalculatedScoreRaw ?? '');
			recordCourseGradeScaleObservation(
				course._CourseID,
				Number.isFinite(percentage) ? percentage : undefined,
				mark?._CalculatedScoreString
			);
		}
	});
	const hasNoGrades = $derived(
		courses
			.map((course) => course.Marks?.Mark[0]?._CalculatedScoreString ?? 'N/A')
			.every((score) => score === 'N/A')
	);
	const totalUnseenAssignments = $derived(
		courses.reduce((total, course) => total + getCourseUnseenAssignmentsCount(course), 0)
	);
	const gpas = $derived(calculateCourseGpas(courses, currentGradeLevel));
	const rank = $derived(getGpaRank(gpas.unweighted, gpas.graded.length));
	const recentAssignments = $derived(
		courses
			.flatMap((course) =>
				(course.Marks?.Mark[0]?.Assignments?.Assignment ?? []).map((assignment) => ({
					assignment,
					course,
					date: assignmentDate(assignment)
				}))
			)
			.filter(
				(item) => item.assignment._Score !== undefined || item.assignment._Point !== undefined
			)
			.toSorted((a, b) => b.date.getTime() - a.date.getTime())
			.slice(0, 8)
	);
	function assignmentDate(assignment: AssignmentEntity) {
		const date = new Date(assignment._DueDate || assignment._Date);
		return Number.isNaN(date.getTime()) ? new Date(0) : date;
	}
	function assignmentPercentage(assignment: AssignmentEntity) {
		const earned = Number.parseFloat(assignment._Point ?? assignment._ScoreCalValue ?? '');
		const possible = Number.parseFloat(
			assignment._PointPossible ?? assignment._ScoreMaxValue ?? ''
		);
		return Number.isFinite(earned) && Number.isFinite(possible) && possible > 0
			? (earned / possible) * 100
			: undefined;
	}
	function percentageTone(percentage: number) {
		if (percentage >= 90) return 'text-grade-strong';
		if (percentage >= 80) return 'text-grade-watch';
		return 'text-grade-risk';
	}
	async function changeReportPeriod(index: number) {
		try {
			await switchReportPeriod({ overrideIndex: index, delta: true });
		} catch {
			// The shared loading state surfaces the request failure.
		}
	}

	function markAllAssignmentsSeen() {
		courses.forEach(clearCourseUnseenAssignments);
		saveSeenAssignmentsToLocalStorage(seenAssignmentIDs);
	}

	async function shareRank() {
		if (!rank || gpas.unweighted === undefined) return;
		const text = `My ${brand} ${rank.provisional ? 'provisional ' : ''}GPA rank is ${rank.current.name} with a ${formatGpa(gpas.unweighted)} estimated unweighted GPA.`;
		try {
			if (navigator.share) await navigator.share({ title: `${brand} GPA rank`, text });
			else {
				await navigator.clipboard.writeText(text);
				toast.success('Rank copied');
			}
			rankShareOpen = false;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			toast.error('Could not share your rank');
		}
	}

	function saveRankImage() {
		if (!rank) return;
		const color = rank.current.color.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
		const rankName = rank.current.name.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
		const appName = brand.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
		const rankLabel = rank.provisional ? 'Your provisional GPA rank is' : 'Your GPA rank is';
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080"><rect width="1080" height="1080" rx="72" fill="#0d2033"/><path d="M0 760 Q270 680 540 760 T1080 760 V1080 H0Z" fill="#12395d"/><text x="80" y="120" fill="#e4eef8" font-family="Arial,sans-serif" font-size="48" font-weight="700">${appName}</text><path d="M540 250 675 340 630 560 540 650 450 560 405 340Z" fill="${color}" stroke="#e4eef8" stroke-width="12"/><text x="540" y="780" text-anchor="middle" fill="#8fa9c2" font-family="Arial,sans-serif" font-size="40">${rankLabel}</text><text x="540" y="880" text-anchor="middle" fill="${color}" font-family="Arial,sans-serif" font-size="96" font-weight="700">${rankName}</text><text x="540" y="975" text-anchor="middle" fill="#4db6f5" font-family="monospace" font-size="34">What’s your rank?</text></svg>`;
		const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${brandName.toLowerCase()}-${rank.current.name.toLowerCase()}-rank.svg`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Gradebook - {brand}</title></svelte:head>

<AppPageShell>
	{#if activeReportPeriod && activeReportPeriodIndex !== undefined && gradebook}
		<div class="grid items-start gap-[22px] xl:grid-cols-[minmax(0,770px)_320px]">
			<div class="min-w-0">
				<div
					class="mb-[1.21875rem] flex flex-col gap-[0.75rem] sm:mb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
				>
					<h1
						class="font-heading -translate-y-[0.5px] text-2xl leading-[1.5] font-bold tracking-[-0.02em] sm:translate-y-0 sm:text-[1.875rem]"
					>
						Gradebook
					</h1>
					<div
						class="grid -translate-y-[0.5px] grid-cols-2 items-center gap-2.5 sm:flex sm:translate-y-[3.5px]"
					>
						<Button
							href="/gpa-calculator"
							class="border-primary h-[2.171875rem] w-full gap-[0.4375rem] rounded-[0.4375rem] border px-3 py-[0.4375rem] text-[0.78125rem] leading-[1.5] font-semibold tracking-[0.015625rem] shadow-none sm:w-[8.6328125rem]"
							><CalculatorIcon class="size-[0.9375rem]" /> GPA calculator</Button
						>
						<ReportPeriodSwitcher
							activeIndex={activeReportPeriodIndex}
							reportPeriods={gradebookCatalog?.canonicalReportPeriodEntries ??
								gradebook.ReportingPeriods.ReportPeriod}
							switchReportPeriod={changeReportPeriod}
							disabled={gradebookCatalog?.loadingIndex !== undefined}
						/>
					</div>
				</div>

				<details class="gradebook-panel border-border bg-card group mb-6 border sm:hidden">
					<summary
						class="flex h-[2.625rem] cursor-pointer list-none items-center justify-between px-[0.875rem] text-[0.84375rem] leading-[normal] font-semibold"
					>
						<span>GPA and rank</span>
						<span class="text-muted-foreground flex items-center gap-[0.4375rem] font-mono">
							{#if rank}<span class="contents group-open:hidden"
									><RankEmblem
										color={rank.current.color}
										size={18}
										label={`${rank.current.name} GPA rank`}
									/></span
								>{/if}
							<span class="group-open:hidden">{formatGpa(gpas.unweighted)}</span>
							<ChevronDownIcon class="size-4 transition-transform group-open:rotate-180" /></span
						>
					</summary>
					<div class="border-border/70 grid grid-cols-2 border-t">
						<div class="flex h-[6.375rem] items-center px-4 py-[0.875rem]">
							<div>
								<p class="metric-label">GPA · Unweighted</p>
								<div class="mt-2 flex items-baseline gap-2.5">
									<p class="text-grade-strong text-[1.625rem] leading-[1.5] font-bold">
										{formatGpa(gpas.unweighted)}
									</p>
									<span class="text-tertiary-foreground font-mono text-xs leading-[1.5]"
										>{gpas.graded.length} graded courses</span
									>
								</div>
							</div>
						</div>
						<div
							class="border-border/70 flex h-[6.375rem] items-center border-l px-4 py-[0.875rem]"
						>
							<div>
								<p class="metric-label">GPA · Weighted</p>
								<p class="mt-2 text-[1.625rem] leading-[1.5] font-bold">
									{formatGpa(gpas.weighted)}
								</p>
							</div>
						</div>
						<div
							class="rank-summary border-border/70 col-span-2 flex h-[5.90625rem] items-center border-t px-4 py-[0.875rem]"
							style:--rank-color={rank?.current.color ?? 'transparent'}
						>
							<div>
								<p class="metric-label">Rank</p>
								<div class="mt-1.5 flex items-center gap-2">
									{#if rank}<RankEmblem
											color={rank.current.color}
											size={34}
											label={`${rank.current.name} GPA rank`}
										/>{/if}
									<strong
										class="truncate text-[1.5625rem] leading-[1.5] tracking-[-0.02em]"
										style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif; color: {rank
											?.current.color};">{rank?.current.name ?? '—'}</strong
									>
									{#if rank?.provisional}<span
											class="bg-secondary text-muted-foreground rounded-full px-2 py-1 text-[0.5625rem] font-bold uppercase"
											>Provisional</span
										>{/if}
									{#if rank}<button
											type="button"
											onclick={() => (rankShareOpen = true)}
											class="rank-share hover:text-foreground ml-1 size-[2.3125rem] rounded-[0.625rem] p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
											title="Share your rank"
											aria-label="Share your rank"><ShareIcon class="size-[1.0625rem]" /></button
										>{/if}
								</div>
							</div>
						</div>
					</div>
				</details>

				<section
					class="gradebook-panel border-border bg-card mb-6 hidden h-28 grid-cols-[1.4fr_1fr_1fr] overflow-hidden border sm:grid"
					aria-label="Grade summary"
				>
					<div class="flex flex-col px-5 py-[1.125rem]">
						<p class="metric-label">GPA · Unweighted</p>
						<div class="mt-2 flex items-baseline gap-[0.625rem]">
							<strong
								class="text-grade-strong text-[2rem] leading-[1.5]"
								style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif;"
								>{formatGpa(gpas.unweighted)}</strong
							><span class="text-tertiary-foreground font-mono text-xs leading-[1.5]"
								>{gpas.graded.length} graded courses</span
							>
						</div>
					</div>
					<div class="border-border flex flex-col border-x px-5 py-[1.125rem]">
						<p class="metric-label">GPA · Weighted</p>
						<strong
							class="mt-2 text-[2rem] leading-[1.5]"
							style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif;"
							>{formatGpa(gpas.weighted)}</strong
						>
					</div>
					<div
						class="rank-summary flex flex-col px-5 py-[1.125rem]"
						style:--rank-color={rank?.current.color ?? 'transparent'}
					>
						<p class="metric-label">Rank</p>
						<div class="mt-1.5 flex items-center gap-2">
							{#if rank}<RankEmblem
									color={rank.current.color}
									size={34}
									label={`${rank.current.name} GPA rank`}
								/>{/if}
							<strong
								class="truncate text-[1.5625rem] leading-[1.5] tracking-[-0.02em]"
								style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif; color: {rank
									?.current.color};">{rank?.current.name ?? '—'}</strong
							>
							{#if rank?.provisional}<span
									class="bg-secondary text-muted-foreground rounded-full px-2 py-1 text-[0.5625rem] font-bold uppercase"
									>Provisional</span
								>{/if}
							{#if rank}<button
									type="button"
									onclick={() => (rankShareOpen = true)}
									class="rank-share hover:text-foreground ml-1 size-[2.3125rem] rounded-md p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
									title="Share your rank"
									aria-label="Share your rank"><ShareIcon class="size-[1.3125rem]" /></button
								>{/if}
						</div>
					</div>
				</section>

				{#if hasNoGrades}
					<Alert.Root
						><CircleXIcon />No grades in {activeReportPeriod._GradePeriod} yet. Either the portal is early
						or the semester is.{#if activeReportPeriodIndex > 0}<Button
								onclick={() => void changeReportPeriod(activeReportPeriodIndex - 1)}
								variant="outline">View {getReportPeriodName(activeReportPeriodIndex - 1)}</Button
							>{/if}</Alert.Root
					>
				{/if}

				<ol class="space-y-3">
					{#each courses as course (course._CourseID)}
						<li>
							<CourseButton
								courseId={course._CourseID}
								name={removeCourseType(course._CourseName)}
								period={course._Period}
								room={course._Room}
								teacher={course._Staff}
								teacherEmail={course._StaffEMail}
								unseenAssignmentsCount={getCourseUnseenAssignmentsCount(course)}
								grade={getCourseGrade(course)}
							/>
						</li>
					{/each}
				</ol>

				{#if courses.length > 0 && totalUnseenAssignments > 0}<div class="flex justify-center">
						<Button variant="outline" onclick={markAllAssignmentsSeen}
							>Mark {totalUnseenAssignments} new assignment{totalUnseenAssignments === 1 ? '' : 's'} as
							seen</Button
						>
					</div>{/if}
			</div>

			<aside class="hidden space-y-3.5 xl:block" aria-label="Gradebook details">
				<section class="gradebook-panel border-border bg-card overflow-hidden border">
					<h2 class="border-border border-b px-5 py-4 text-sm leading-[1.5] font-semibold">
						Next rank
					</h2>
					<div class="px-5 py-4">
						{#if rank?.next}
							<div class="flex items-center gap-3">
								<RankEmblem
									color={rank.next.color}
									size={26}
									label={`${rank.next.name} GPA rank`}
								/>
								<div class="flex min-w-0 flex-1 items-baseline gap-2">
									<p
										class="text-base leading-[1.5] font-bold"
										style="font-family: 'Space Grotesk', 'Instrument Sans', system-ui, sans-serif; color: {rank
											.next.color};"
									>
										{rank.next.name}
									</p>
									<p
										class="text-tertiary-foreground ml-auto font-mono text-[0.65625rem] leading-[1.5]"
									>
										{rank.pointsAway.toFixed(2)} GPA away
									</p>
								</div>
							</div>
							<div
								class="bg-secondary mt-3 h-1.5 overflow-hidden rounded-full"
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
						{:else if rank}
							<div class="flex items-center gap-3">
								<RankEmblem
									color={rank.current.color}
									size={26}
									label={`${rank.current.name} GPA rank`}
								/>
								<div>
									<p class="text-lg font-bold" style:color={rank.current.color}>Diamond</p>
									<p class="text-muted-foreground mt-1 text-xs">
										{rank.provisional
											? `Provisional until ${rank.coursesNeeded} more graded ${rank.coursesNeeded === 1 ? 'class' : 'classes'}.`
											: "You've reached the top."}
									</p>
								</div>
							</div>
						{:else}<p class="text-muted-foreground text-sm">No grades, no rank math.</p>{/if}
						<p class="sr-only">
							Rank is a {brand} GPA tier, not your official class rank.
						</p>
					</div>
				</section>

				<section class="gradebook-panel border-border bg-card overflow-hidden border">
					<h2 class="border-border border-b px-5 py-4 text-sm leading-[1.5] font-semibold">
						Recently graded
					</h2>
					{#if recentAssignments.length}<ol class="divide-border divide-y">
							{#each recentAssignments as item (`${item.course._CourseID}-${item.assignment._GradebookID}`)}{@const score =
									assignmentPercentage(item.assignment)}
								<li class="px-[1.125rem] py-[0.625rem]">
									<div class="flex items-start justify-between gap-3">
										<p
											class="line-clamp-1 text-[0.78125rem] leading-[1.5] font-semibold tracking-[0.03em]"
										>
											{item.assignment._Measure}
										</p>
										{#if score !== undefined}<span
												class="{percentageTone(
													score
												)} shrink-0 font-mono text-[0.78125rem] leading-[1.5] font-semibold"
												>{score.toFixed(1)}%</span
											>{/if}
									</div>
									<p class="text-tertiary-foreground truncate text-[0.6875rem] leading-[1.5]">
										{removeCourseType(item.course._CourseName)} · {item.date.getTime()
											? item.date.toLocaleDateString(undefined, {
													month: 'numeric',
													day: 'numeric',
													year: '2-digit'
												})
											: 'Date unavailable'}
									</p>
								</li>{/each}
						</ol>{:else}<p class="text-muted-foreground px-5 py-8 text-center text-sm">
							No graded assignments yet. The portal may be pacing itself.
						</p>{/if}
				</section>
			</aside>
		</div>
	{/if}
</AppPageShell>

<Dialog.Root bind:open={rankShareOpen}>
	<Dialog.Content
		class="border-border bg-card w-[25rem] max-w-[calc(100%-2rem)] gap-0 overflow-hidden rounded-xl p-0"
	>
		<Dialog.Header class="border-border border-b px-4 py-3.5">
			<Dialog.Title class="text-sm">Your rank card</Dialog.Title>
			<Dialog.Description class="sr-only">
				Preview and share a rank card without grades or GPA.
			</Dialog.Description>
		</Dialog.Header>

		{#if rank}
			<div class="p-4">
				<div
					class="rank-card-preview relative overflow-hidden rounded-xl bg-[#081522] px-6 pt-5 pb-6 text-center"
				>
					<div class="flex items-center gap-2 text-left">
						<img src="/grademaxxing-logo.png" class="size-8" alt="" />
						<span class="font-heading text-base font-bold">{brand}</span>
					</div>
					<div class="relative z-10 mt-8 flex flex-col items-center">
						<RankEmblem
							color={rank.current.color}
							size={112}
							label={`${rank.current.name} GPA rank`}
						/>
						<p class="text-muted-foreground mt-3 text-sm">
							Your {rank.provisional ? 'provisional ' : ''}GPA rank is
						</p>
						<p class="font-heading text-4xl font-bold" style:color={rank.current.color}>
							{rank.current.name}
						</p>
						<p class="text-primary mt-7 font-mono text-xs font-semibold">What’s your rank?</p>
					</div>
					<div class="absolute right-0 bottom-0 left-0 h-24 bg-[#12395d] opacity-75"></div>
				</div>
			</div>
		{/if}

		<div class="border-border flex flex-wrap items-center gap-2 border-t px-4 py-3">
			<p class="text-muted-foreground mr-auto text-xs">No GPA or grades on the card.</p>
			<Button variant="outline" size="sm" onclick={() => (rankShareOpen = false)}>Cancel</Button>
			<Button variant="outline" size="sm" onclick={saveRankImage}>Save image</Button>
			<Button size="sm" onclick={() => void shareRank()}>Share</Button>
		</div>
	</Dialog.Content>
</Dialog.Root>

<style>
	.gradebook-panel {
		border-radius: 0.75rem;
		box-shadow:
			0 1px 2px rgb(15 28 46 / 6%),
			0 8px 24px rgb(11 125 194 / 8%);
	}

	:global(.dark) .gradebook-panel {
		box-shadow:
			0 1px 2px rgb(0 0 0 / 40%),
			0 8px 24px rgb(0 0 0 / 30%);
	}

	.rank-share {
		color: color-mix(in srgb, var(--rank-color) 60%, var(--tertiary-foreground));
	}

	.metric-label {
		color: var(--muted-foreground);
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1.5;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.rank-summary {
		background: radial-gradient(
			circle at 72% 45%,
			color-mix(in oklab, var(--rank-color) 16%, transparent),
			transparent 58%
		);
	}
</style>
