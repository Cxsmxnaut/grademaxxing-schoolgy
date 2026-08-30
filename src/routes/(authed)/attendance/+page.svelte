<script lang="ts">
	import { fullDateFormatter, removeCourseType } from '$lib';
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import * as Accordion from '$lib/components/ui/accordion';
	import type { Period } from '$lib/types/Attendance';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import CheckCircleIcon from '@lucide/svelte/icons/circle-check';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ListIcon from '@lucide/svelte/icons/list';
	import { attendanceState, loadAttendance } from './attendance.svelte';

	loadAttendance();

	type AttendanceType = 'Absent' | 'Tardy' | 'Excused' | 'Present' | 'Unknown';

	const excusedReasonRegex =
		/Field Trip|School Pass|Excused|Medical\/Dent|Comp Ed\/Court-Religi|Illness or Sickness|SB14 Wellness\/Illnes|Med. all day\/period/;
	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
	const shortDateFormatter = new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric'
	});
	const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	let view = $state<'calendar' | 'list'>('calendar');
	let currentMonth = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

	function getAbsenceType(periods: Period[]): AttendanceType {
		const reasons = periods.map((period: Period) => period._Name);
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
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
			date.getDate()
		).padStart(2, '0')}`;
	}

	function attendanceDate(value: string) {
		const date = parseAttendanceDate(value);
		return date ? fullDateFormatter.format(date) : 'Date unavailable';
	}

	function statusClasses(type: AttendanceType) {
		switch (type) {
			case 'Absent':
				return 'bg-destructive-soft text-destructive';
			case 'Tardy':
				return 'bg-warning-soft text-warning';
			case 'Excused':
				return 'bg-primary/10 text-primary';
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
				return 'bg-primary';
			case 'Present':
				return 'bg-success';
			default:
				return 'bg-muted-foreground';
		}
	}

	const attendanceRows = $derived.by(() => {
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
					periods: [] as Period[],
					reason: record.Reason || record.Status
				}))
		].toSorted((a, b) => (b.dateObject?.getTime() ?? 0) - (a.dateObject?.getTime() ?? 0));
	});

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

<svelte:head>
	<title>Attendance - {brand}</title>
</svelte:head>

<AppPageShell class="max-w-[72rem]">
	<div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
		<AppPageHeader
			eyebrow="School record"
			title="Attendance"
			description="See absences, tardies, and school activities on a clear monthly calendar."
		/>

		<div
			class="bg-secondary/70 grid shrink-0 grid-cols-2 rounded-xl p-1"
			aria-label="Attendance view"
		>
			<button
				type="button"
				onclick={() => (view = 'calendar')}
				class="flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors {view ===
				'calendar'
					? 'bg-primary/12 text-primary shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				aria-pressed={view === 'calendar'}
			>
				<CalendarDaysIcon class="size-4" /> Calendar
			</button>
			<button
				type="button"
				onclick={() => (view = 'list')}
				class="flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors {view ===
				'list'
					? 'bg-primary/12 text-primary shadow-sm'
					: 'text-muted-foreground hover:text-foreground'}"
				aria-pressed={view === 'list'}
			>
				<ListIcon class="size-4" /> List
			</button>
		</div>
	</div>

	{#if !attendanceState.loaded}
		<LoadingBanner>Loading attendance...</LoadingBanner>
	{:else if attendanceState.refreshing}
		<LoadingBanner>Refreshing attendance...</LoadingBanner>
	{/if}

	{#if attendanceState.lastRefresh !== undefined}
		<RefreshIndicator
			canRefresh={attendanceState.loaded}
			lastRefresh={attendanceState.lastRefresh}
			refreshing={attendanceState.refreshing}
			refresh={() => loadAttendance(true)}
		/>
	{/if}

	{#if attendanceState.loaded && attendanceState.error}
		<RecordLoadFailure
			label="attendance"
			error={attendanceState.error}
			refreshing={attendanceState.refreshing}
			retry={() => loadAttendance(true)}
		/>
	{/if}

	{#if attendanceState.data}
		{#if view === 'calendar'}
			<section class="mt-5" aria-labelledby="attendance-month">
				<div class="mb-4 flex flex-wrap items-center justify-center gap-3">
					<button
						type="button"
						onclick={() => changeMonth(-1)}
						class="border-border/70 hover:bg-secondary flex size-9 items-center justify-center rounded-lg border"
						aria-label="Previous month"
					>
						<ChevronLeftIcon class="size-4" />
					</button>
					<h2 id="attendance-month" class="min-w-40 text-center text-lg font-bold">
						{monthFormatter.format(currentMonth)}
					</h2>
					<button
						type="button"
						onclick={() => changeMonth(1)}
						class="border-border/70 hover:bg-secondary flex size-9 items-center justify-center rounded-lg border"
						aria-label="Next month"
					>
						<ChevronRightIcon class="size-4" />
					</button>
					<button
						type="button"
						onclick={goToToday}
						class="border-border/70 hover:bg-secondary h-9 rounded-full border px-3 text-xs font-semibold"
					>
						Today
					</button>
				</div>

				<div class="overflow-x-auto pb-2">
					<div class="min-w-[44rem]">
						<div class="grid grid-cols-7">
							{#each weekdayNames as weekday (weekday)}
								<div
									class="text-muted-foreground px-2 pb-2 text-center text-[0.68rem] font-bold tracking-[0.08em] uppercase"
								>
									{weekday}
								</div>
							{/each}
						</div>
						<div
							class="border-border/70 bg-card grid grid-cols-7 overflow-hidden rounded-xl border shadow-sm"
						>
							{#each calendarDays as day (day.key)}
								{#if day.date}
									{@const dayRecords = recordsForDate(day.date)}
									<div class="border-border/70 min-h-24 border-r border-b p-2 last:border-r-0">
										<div class="mb-1 flex justify-end">
											<time
												datetime={day.key}
												class="flex size-6 items-center justify-center rounded-full text-xs font-semibold {isToday(
													day.date
												)
													? 'bg-foreground text-background'
													: ''}"
											>
												{day.date.getDate()}
											</time>
										</div>
										<div class="space-y-1">
											{#each dayRecords.slice(0, 3) as record, index (`${record.date}-${record.type}-${index}`)}
												<div
													class="flex items-center gap-1.5 truncate rounded px-1.5 py-1 text-[0.68rem] font-semibold {statusClasses(
														record.type
													)}"
													title={record.note || record.reason || record.type}
												>
													<span class="size-1.5 shrink-0 rounded-full {dotClasses(record.type)}"
													></span>
													<span class="truncate">{record.type}</span>
												</div>
											{/each}
											{#if dayRecords.length > 3}
												<p class="text-muted-foreground px-1 text-[0.65rem]">
													+{dayRecords.length - 3} more
												</p>
											{/if}
										</div>
									</div>
								{:else}
									<div class="border-border/70 bg-muted/20 min-h-24 border-r border-b"></div>
								{/if}
							{/each}
						</div>
					</div>
				</div>

				<div
					class="text-muted-foreground mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs"
				>
					{#each ['Present', 'Excused', 'Tardy', 'Absent'] as item (item)}
						<span class="flex items-center gap-1.5">
							<span class="size-2 rounded-full {dotClasses(item as AttendanceType)}"></span>
							{item}
						</span>
					{/each}
				</div>
			</section>
		{:else}
			<section class="mx-auto mt-6 max-w-3xl" aria-label="Attendance records">
				{#if attendanceRows.length > 0}
					<Accordion.Root type="single" class="bg-card overflow-hidden rounded-xl shadow-sm">
						{#each attendanceRows as record, index (`${record.date}-${record.type}-${index}`)}
							<Accordion.Item class="border-border/70 px-4 last:border-b-0">
								<Accordion.Trigger class="gap-4 py-4 hover:no-underline">
									<span class="min-w-20 text-left">
										<span class="block font-semibold">
											{record.dateObject
												? shortDateFormatter.format(record.dateObject)
												: record.date}
										</span>
										<span class="text-muted-foreground block text-xs">
											{record.dateObject?.getFullYear() ?? ''}
										</span>
									</span>
									<span class="min-w-0 flex-1 truncate text-left font-medium">
										{record.note || record.reason || record.type}
									</span>
									<span
										class="rounded-full px-2.5 py-1 text-xs font-semibold {statusClasses(
											record.type
										)}"
									>
										{record.type}
									</span>
								</Accordion.Trigger>

								<Accordion.Content class="pb-4 pl-24">
									{#if record.periods.length > 0}
										<ol class="text-muted-foreground space-y-2 text-sm">
											{#each record.periods.filter((course) => course._Name) as period (`${period._Number}-${period._Course}`)}
												<li>
													<span class="text-foreground font-medium"
														>{removeCourseType(period._Course)}</span
													>
													· {period._Name}
												</li>
											{/each}
										</ol>
									{:else}
										<p class="text-muted-foreground text-sm">{record.reason || record.type}</p>
									{/if}
									<p class="sr-only">{attendanceDate(record.date)}</p>
								</Accordion.Content>
							</Accordion.Item>
						{/each}
					</Accordion.Root>
				{:else}
					<div class="py-16 text-center">
						<CheckCircleIcon class="text-success mx-auto size-9" />
						<h2 class="mt-3 font-semibold">No attendance events</h2>
						<p class="text-muted-foreground mt-1 text-sm">
							Nothing has been reported by your school.
						</p>
					</div>
				{/if}
			</section>
		{/if}
	{/if}
</AppPageShell>
