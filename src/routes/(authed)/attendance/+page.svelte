<script lang="ts">
	import { removeCourseType } from '$lib/grades/course-name';
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import { gradebookState } from '$lib/grades/catalog.svelte';
	import { getActiveGradebook } from '$lib/grades/gradebook';
	import type { Period } from '$lib/contracts/studentvue/attendance';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ListIcon from '@lucide/svelte/icons/list';
	import { attendanceState, loadAttendance } from './attendance.svelte';

	loadAttendance();

	type AttendanceType = 'Absent' | 'Tardy' | 'Excused' | 'Present' | 'Unknown';
	type AttendanceRow = {
		date: string;
		dateObject?: Date;
		note: string;
		type: AttendanceType;
		periods: Period[];
		reason: string;
	};

	const excusedReasonRegex =
		/Field Trip|School Pass|Excused|Medical\/Dent|Comp Ed\/Court-Religi|Illness or Sickness|SB14 Wellness\/Illnes|Med. all day\/period/;
	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
	const dateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'numeric',
		day: 'numeric',
		year: 'numeric'
	});
	const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	let view = $state<'overview' | 'calendar'>('overview');
	let currentMonth = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

	function getAbsenceType(periods: Period[]): AttendanceType {
		const reasons = periods.map((period) => period._Name);
		if (reasons.some((reason) => reason === 'Absent' || reason === 'Non ADA')) return 'Absent';
		if (reasons.some((reason) => /Tardy/.test(reason))) return 'Tardy';
		if (reasons.some((reason) => excusedReasonRegex.test(reason))) return 'Excused';
		if (reasons.some((reason) => reason === 'Present')) return 'Present';
		return 'Unknown';
	}

	function getDailyType(status: string, reason: string): AttendanceType {
		const value = `${status} ${reason}`;
		if (/present/i.test(value)) return 'Present';
		if (/tardy|late/i.test(value)) return 'Tardy';
		if (/absent|unexcused|unverified|truan/i.test(value)) return 'Absent';
		if (/excused|field trip|activity|school business|school pass/i.test(value)) return 'Excused';
		return 'Unknown';
	}

	function parseAttendanceDate(value: string) {
		const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
		if (match) {
			const date = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
			if (!Number.isNaN(date.getTime())) return date;
		}
		const date = new Date(value);
		return value && !Number.isNaN(date.getTime())
			? new Date(date.getFullYear(), date.getMonth(), date.getDate())
			: undefined;
	}

	function dateKey(date: Date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function statusClasses(type: AttendanceType) {
		switch (type) {
			case 'Absent':
				return 'bg-destructive-soft text-destructive';
			case 'Tardy':
				return 'bg-warning-soft text-warning';
			case 'Excused':
				return 'bg-destructive-soft text-destructive';
			case 'Present':
				return 'bg-success-soft text-success';
			default:
				return 'bg-muted text-muted-foreground';
		}
	}

	function dotClasses(type: AttendanceType) {
		switch (type) {
			case 'Absent':
				return 'bg-destructive';
			case 'Tardy':
				return 'bg-warning';
			case 'Excused':
				return 'bg-destructive';
			case 'Present':
				return 'bg-success';
			default:
				return 'bg-muted-foreground';
		}
	}

	const attendanceRows = $derived.by((): AttendanceRow[] => {
		const absences = attendanceState.data?.Absences.Absence ?? [];
		const incidentDates = new Set(absences.map((absence) => absence._AbsenceDate));
		return [
			...absences.map((absence) => ({
				date: absence._AbsenceDate,
				dateObject: parseAttendanceDate(absence._AbsenceDate),
				note: absence._Note || absence._Reason,
				type: getAbsenceType(absence.Periods.Period ?? []),
				periods: absence.Periods.Period ?? [],
				reason: absence._Reason
			})),
			...(attendanceState.data?.DailyRecords ?? [])
				.filter((record) => !incidentDates.has(record.Date))
				.map((record) => ({
					date: record.Date,
					dateObject: parseAttendanceDate(record.Date),
					note: record.Reason,
					type: getDailyType(record.Status, record.Reason),
					periods: [],
					reason: record.Reason || record.Status
				}))
		].toSorted((a, b) => (b.dateObject?.getTime() ?? 0) - (a.dateObject?.getTime() ?? 0));
	});

	const absences = $derived(
		attendanceRows.filter((row) => row.type === 'Absent' || row.type === 'Excused').length
	);
	const tardies = $derived(
		attendanceRows.filter(
			(row) => row.type === 'Tardy' || row.periods.some((period) => /tardy/i.test(period._Name))
		).length
	);
	const daysRecorded = $derived(
		new Set(attendanceRows.flatMap((row) => (row.dateObject ? [dateKey(row.dateObject)] : []))).size
	);
	const courseTotals = $derived.by(() => {
		if (attendanceState.data?.CourseTotals?.length) return attendanceState.data.CourseTotals;
		const totals = new Map<
			string,
			{
				Course: string;
				Present: number;
				Tardy: number;
				Absent: number;
				Excused: number;
				Unexcused: number;
			}
		>();
		for (const row of attendanceRows) {
			for (const period of row.periods.filter((item) => item._Course)) {
				const entry = totals.get(period._Course) ?? {
					Course: period._Course,
					Present: 0,
					Tardy: 0,
					Absent: 0,
					Excused: 0,
					Unexcused: 0
				};
				if (/tardy/i.test(period._Name)) entry.Tardy += 1;
				else if (excusedReasonRegex.test(period._Name)) entry.Excused += 1;
				else if (/absent|non ada/i.test(period._Name)) entry.Absent += 1;
				else if (/present/i.test(period._Name)) entry.Present += 1;
				totals.set(period._Course, entry);
			}
		}
		return [...totals.values()];
	});
	const gradebookCourses = $derived.by(() => {
		gradebookState.version;
		return getActiveGradebook()?.Courses.Course ?? [];
	});
	const courseAttendanceRows = $derived(
		courseTotals.map((total, index) => {
			const normalizedName = removeCourseType(total.Course).trim().toLocaleLowerCase();
			const course = gradebookCourses.find(
				(candidate) =>
					removeCourseType(candidate._CourseName).trim().toLocaleLowerCase() === normalizedName
			);
			return {
				...total,
				period: course?._Period || String(index + 1),
				teacher: course?._Staff || '—',
				absenceCount: total.Absent + total.Unexcused + total.Excused
			};
		})
	);

	const calendarDays = $derived.by(() => {
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();
		const leadingDays = new Date(year, month, 1).getDay();
		const dayCount = new Date(year, month + 1, 0).getDate();
		return [
			...Array.from({ length: leadingDays }, (_, index) => ({
				key: `blank-${index}`,
				date: undefined
			})),
			...Array.from({ length: dayCount }, (_, index) => {
				const date = new Date(year, month, index + 1);
				return { key: dateKey(date), date };
			})
		];
	});

	function recordsForDate(date: Date) {
		const key = dateKey(date);
		return attendanceRows.filter(
			(record) => record.dateObject && dateKey(record.dateObject) === key
		);
	}
	function changeMonth(offset: number) {
		currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
	}
	function goToToday() {
		const today = new Date();
		currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
	}
	function isToday(date: Date) {
		return dateKey(date) === dateKey(new Date());
	}
</script>

<svelte:head><title>Attendance - {brand}</title></svelte:head>

<AppPageShell class="max-w-[67.5rem]">
	<div class="mb-7 flex items-start justify-between gap-4">
		<div>
			<p class="text-primary text-[0.68rem] font-bold tracking-[0.14em] uppercase">School year</p>
			<h1 class="font-heading mt-2 text-2xl font-bold tracking-[-0.035em] sm:text-[1.875rem]">
				Attendance
			</h1>
		</div>
		<div class="bg-secondary grid grid-cols-2 rounded-xl p-1" aria-label="Attendance view">
			<button
				type="button"
				onclick={() => (view = 'overview')}
				class="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold {view ===
				'overview'
					? 'bg-primary/12 text-primary shadow-sm'
					: 'text-muted-foreground'}"><ListIcon class="size-4" /> Overview</button
			>
			<button
				type="button"
				onclick={() => (view = 'calendar')}
				class="flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold {view ===
				'calendar'
					? 'bg-primary/12 text-primary shadow-sm'
					: 'text-muted-foreground'}"><CalendarDaysIcon class="size-4" /> Calendar</button
			>
		</div>
	</div>

	{#if !attendanceState.loaded}<LoadingBanner
			>Loading attendance. Checking the ledger.</LoadingBanner
		>{:else if attendanceState.refreshing}<LoadingBanner>Refreshing attendance...</LoadingBanner
		>{/if}
	{#if attendanceState.loaded && attendanceState.error}<RecordLoadFailure
			label="attendance"
			error={attendanceState.error}
			refreshing={attendanceState.refreshing}
			retry={() => loadAttendance(true)}
		/>{/if}

	{#if attendanceState.data}
		{#if view === 'overview'}
			<section class="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Attendance summary">
				<div class="summary-card">
					<p class="metric-label">Absences</p>
					<strong>{absences}</strong>
				</div>
				<div class="summary-card">
					<p class="metric-label">Tardies</p>
					<strong class="text-grade-watch">{tardies}</strong>
				</div>
				<div class="summary-card">
					<p class="metric-label">Days recorded</p>
					<strong class="text-grade-strong">{daysRecorded}</strong>
				</div>
			</section>

			<section class="record-table mt-6">
				<h2>By class</h2>
				<div class="overflow-x-auto">
					<table>
						<thead
							><tr
								><th>Period</th><th>Class</th><th class="hidden sm:table-cell">Teacher</th><th
									>Absent</th
								><th>Tardy</th></tr
							></thead
						><tbody
							>{#if courseAttendanceRows.length}{#each courseAttendanceRows as course (course.Course)}<tr
										><td class="text-muted-foreground font-mono">{course.period}</td><td
											class="font-semibold">{removeCourseType(course.Course)}</td
										><td class="text-muted-foreground hidden sm:table-cell">{course.teacher}</td><td
											>{course.absenceCount}</td
										><td class="text-grade-watch">{course.Tardy}</td></tr
									>{/each}{:else}<tr
									><td colspan="5" class="empty-cell"
										>No class attendance totals have been reported.</td
									></tr
								>{/if}</tbody
						>
					</table>
				</div>
			</section>

			<section class="record-table mt-6">
				<h2>History</h2>
				<div class="overflow-x-auto">
					<table>
						<thead class="sr-only"><tr><th>Date</th><th>Status</th><th>Details</th></tr></thead
						><tbody
							>{#if attendanceRows.length}{#each attendanceRows as record, index (`${record.date}-${record.type}-${index}`)}<tr
										><td class="whitespace-nowrap"
											>{record.dateObject
												? dateFormatter.format(record.dateObject)
												: record.date}</td
										><td
											><span
												class="rounded-full px-2.5 py-1 text-xs font-semibold {statusClasses(
													record.type
												)}">{record.type}</span
											></td
										><td class="min-w-64"
											>{record.periods.length
												? record.periods
														.filter((period) => period._Course)
														.map(
															(period) => `P${period._Number} ${removeCourseType(period._Course)}`
														)
														.join(' · ')
												: record.note || record.reason || record.type}</td
										></tr
									>{/each}{:else}<tr
									><td colspan="3" class="empty-cell">No attendance records have been reported.</td
									></tr
								>{/if}</tbody
						>
					</table>
				</div>
			</section>
		{:else}
			<section aria-labelledby="attendance-month">
				<div class="mb-4 flex flex-wrap items-center justify-center gap-3">
					<button
						type="button"
						onclick={() => changeMonth(-1)}
						class="calendar-control"
						aria-label="Previous month"><ChevronLeftIcon class="size-4" /></button
					>
					<h2 id="attendance-month" class="min-w-40 text-center text-lg font-bold">
						{monthFormatter.format(currentMonth)}
					</h2>
					<button
						type="button"
						onclick={() => changeMonth(1)}
						class="calendar-control"
						aria-label="Next month"><ChevronRightIcon class="size-4" /></button
					><button type="button" onclick={goToToday} class="calendar-control w-auto px-3"
						>Today</button
					>
				</div>
				<div class="overflow-x-auto pb-2">
					<div class="min-w-[44rem]">
						<div class="grid grid-cols-7">
							{#each weekdayNames as weekday (weekday)}<div
									class="metric-label px-2 pb-2 text-center"
								>
									{weekday}
								</div>{/each}
						</div>
						<div
							class="border-border/70 bg-card grid grid-cols-7 overflow-hidden rounded-xl border shadow-sm"
						>
							{#each calendarDays as day (day.key)}{#if day.date}{@const dayRecords =
										recordsForDate(day.date)}
									<div class="border-border/70 min-h-24 border-r border-b p-2">
										<div class="mb-1 flex justify-end">
											<time
												datetime={day.key}
												class="flex size-6 items-center justify-center rounded-full text-xs font-semibold {isToday(
													day.date
												)
													? 'bg-foreground text-background'
													: ''}">{day.date.getDate()}</time
											>
										</div>
										<div class="space-y-1">
											{#each dayRecords.slice(0, 3) as record, index (`${record.date}-${record.type}-${index}`)}<div
													class="flex items-center gap-1.5 truncate rounded px-1.5 py-1 text-[0.68rem] font-semibold {statusClasses(
														record.type
													)}"
												>
													<span class="size-1.5 shrink-0 rounded-full {dotClasses(record.type)}"
													></span><span class="truncate">{record.type}</span>
												</div>{/each}
										</div>
									</div>{:else}<div
										class="border-border/70 bg-muted/20 min-h-24 border-r border-b"
									></div>{/if}{/each}
						</div>
					</div>
				</div>
			</section>
		{/if}
	{/if}
</AppPageShell>

<style>
	.metric-label {
		color: var(--muted-foreground);
		font-size: 0.69rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.summary-card {
		border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
		border-radius: 0.75rem;
		background: var(--card);
		min-height: 108px;
		padding: 1.25rem;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
	}
	.summary-card strong {
		display: block;
		margin-top: 0.8rem;
		font-family: var(--font-mono);
		font-size: 2rem;
		line-height: 1;
	}
	.record-table {
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--border) 80%, transparent);
		border-radius: 0.75rem;
		background: var(--card);
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.06);
	}
	.record-table h2 {
		border-bottom: 1px solid color-mix(in oklab, var(--border) 70%, transparent);
		padding: 1rem 1.25rem;
		font-weight: 700;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}
	th {
		color: var(--muted-foreground);
		padding: 0.8rem 1.25rem;
		text-align: left;
		font-size: 0.68rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	td {
		border-top: 1px solid color-mix(in oklab, var(--border) 65%, transparent);
		padding: 0.9rem 1.25rem;
	}
	.empty-cell {
		color: var(--muted-foreground);
		padding: 2.5rem 1.25rem;
		text-align: center;
	}
	.calendar-control {
		display: flex;
		height: 2.25rem;
		width: 2.25rem;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: 0.5rem;
	}
	@media (max-width: 639px) {
		th,
		td {
			padding-right: 0.75rem;
			padding-left: 0.75rem;
		}
	}
</style>
