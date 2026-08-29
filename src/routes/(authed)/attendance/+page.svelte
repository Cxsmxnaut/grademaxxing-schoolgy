<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageHeader from '$lib/components/AppPageHeader.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import { Button } from '$lib/components/ui/button';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { attendanceState, loadAttendance } from './attendance.svelte';

	type AttendanceStatus = 'present' | 'excused' | 'tardy' | 'unexcused' | 'activity';
	type AttendanceRecord = {
		date: string;
		status: AttendanceStatus;
		note: string;
		reason: string;
		periods: Array<{ period: string; course: string; reason: string; note: string }>;
	};

	const months = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];
	const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const statusPriority: Record<AttendanceStatus, number> = {
		present: -1,
		excused: 0,
		activity: 1,
		tardy: 2,
		unexcused: 3
	};
	const statusStyle: Record<AttendanceStatus, { label: string; chip: string; dot: string }> = {
		present: {
			label: 'Present',
			chip: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
			dot: 'bg-emerald-500'
		},
		excused: {
			label: 'Excused',
			chip: 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300',
			dot: 'bg-cyan-500'
		},
		tardy: {
			label: 'Tardy',
			chip: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
			dot: 'bg-amber-500'
		},
		unexcused: {
			label: 'Unexcused',
			chip: 'bg-red-500/12 text-red-700 dark:text-red-300',
			dot: 'bg-red-500'
		},
		activity: {
			label: 'Activity',
			chip: 'bg-sky-500/12 text-sky-700 dark:text-sky-300',
			dot: 'bg-sky-500'
		}
	};

	const now = new Date();
	let view = $state<'calendar' | 'list'>('calendar');
	let cursor = $state(new Date(now.getFullYear(), now.getMonth(), 1));
	let expanded = $state<Record<string, boolean>>({});

	loadAttendance();

	const records = $derived.by<AttendanceRecord[]>(() => {
		const incidentRecords = (attendanceState.data?.Absences.Absence ?? []).map((absence) => {
			const periods = (absence.Periods.Period ?? []).map((period) => ({
				period: period._Number,
				course: period._Course,
				reason: period._Reason || period._Name,
				note: ''
			}));
			const reasons = [
				absence._Reason,
				absence._Note,
				...periods.flatMap((period) => [period.reason, period.note])
			].filter(Boolean);
			const statuses = reasons.map(classifyReason);
			const status = statuses.reduce<AttendanceStatus>(
				(worst, candidate) =>
					statusPriority[candidate] > statusPriority[worst] ? candidate : worst,
				'excused'
			);
			return {
				date: absence._AbsenceDate,
				status,
				note: absence._Note,
				reason: absence._Reason,
				periods
			};
		});
		const incidentDates = new Set(incidentRecords.map((record) => record.date));
		const dailyRecords = (attendanceState.data?.DailyRecords ?? [])
			.filter((record) => !incidentDates.has(record.Date))
			.map((record) => ({
				date: record.Date,
				status: classifyReason(record.Status || record.Reason),
				note: '',
				reason: record.Reason,
				periods: []
			}));
		return [...incidentRecords, ...dailyRecords];
	});
	const sortedRecords = $derived([...records].sort((a, b) => b.date.localeCompare(a.date)));
	const recordsByDate = $derived.by(() => {
		const grouped: Record<string, AttendanceRecord[]> = {};
		for (const record of records) (grouped[record.date] ??= []).push(record);
		return grouped;
	});
	const year = $derived(cursor.getFullYear());
	const month = $derived(cursor.getMonth());
	const calendarCells = $derived(calendarDays(year, month));
	const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());

	function classifyReason(value: string): AttendanceStatus {
		const reason = value.toLowerCase();
		if (reason.includes('present')) return 'present';
		if (reason.includes('tardy') || reason.includes('late')) return 'tardy';
		if (reason.includes('unexcused') || reason.includes('unverified') || reason.includes('truan'))
			return 'unexcused';
		if (
			reason.includes('field trip') ||
			reason.includes('activity') ||
			reason.includes('school business') ||
			reason.includes('school pass')
		)
			return 'activity';
		return 'excused';
	}

	function calendarDays(calendarYear: number, calendarMonth: number) {
		const cells: Array<number | null> = [];
		const startWeekday = new Date(calendarYear, calendarMonth, 1).getDay();
		const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
		for (let index = 0; index < startWeekday; index += 1) cells.push(null);
		for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
		while (cells.length % 7 !== 0) cells.push(null);
		return cells;
	}

	function isoOf(calendarYear: number, calendarMonth: number, day: number) {
		return `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	function longDate(value: string) {
		const [dateYear = 1970, dateMonth = 1, dateDay = 1] = value.split('-').map(Number);
		return new Date(dateYear, dateMonth - 1, dateDay).toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	function shiftMonth(delta: number) {
		cursor = new Date(year, month + delta, 1);
	}

	function goToToday() {
		cursor = new Date(now.getFullYear(), now.getMonth(), 1);
	}

	function toggleRecord(record: AttendanceRecord) {
		expanded[record.date] = !expanded[record.date];
	}
</script>

<svelte:head>
	<title>Attendance - {brand}</title>
</svelte:head>

<div class="mx-auto w-full max-w-[1160px] px-4 pt-6 sm:px-6 lg:px-10 lg:pt-9">
	<div class="flex flex-wrap items-end justify-between gap-5">
		<AppPageHeader
			title="Attendance"
			description="See absences, tardies, and school activities on a clear monthly calendar."
			eyebrow="School record"
		/>
		<div
			class="bg-card mb-6 inline-flex rounded-xl p-1 shadow-sm lg:mb-8"
			aria-label="Attendance view"
		>
			<button
				type="button"
				class={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === 'calendar' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
				aria-pressed={view === 'calendar'}
				onclick={() => (view = 'calendar')}>Calendar</button
			>
			<button
				type="button"
				class={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${view === 'list' ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
				aria-pressed={view === 'list'}
				onclick={() => (view = 'list')}>List</button
			>
		</div>
	</div>
</div>

{#if !attendanceState.loaded && !attendanceState.data}
	<LoadingBanner>Loading attendance...</LoadingBanner>
{:else if attendanceState.refreshing}
	<LoadingBanner>Refreshing attendance...</LoadingBanner>
{/if}

{#if attendanceState.loaded}
	<RefreshIndicator
		canRefresh={!attendanceState.refreshing}
		refreshing={attendanceState.refreshing}
		lastRefresh={attendanceState.lastRefresh}
		refresh={() => loadAttendance(true)}
	/>
{/if}

{#if attendanceState.error}
	<RecordLoadFailure
		label="attendance"
		error={attendanceState.error}
		refreshing={attendanceState.refreshing}
		retry={() => loadAttendance(true)}
	/>
{/if}

{#if attendanceState.data}
	<div class="mx-auto mt-2 w-full max-w-[1160px] px-4 pb-12 sm:px-6 lg:px-10">
		{#if view === 'calendar'}
			<section
				aria-label={`${months[month]} ${year} attendance calendar`}
				class="mx-auto max-w-[940px]"
			>
				<div class="mb-4 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
					<Button
						variant="outline"
						size="icon"
						aria-label="Previous month"
						onclick={() => shiftMonth(-1)}
					>
						<ChevronLeftIcon />
					</Button>
					<h2 class="min-w-44 text-center text-lg font-semibold sm:text-xl">
						{months[month]}
						{year}
					</h2>
					<Button
						variant="outline"
						size="icon"
						aria-label="Next month"
						onclick={() => shiftMonth(1)}
					>
						<ChevronRightIcon />
					</Button>
					<Button variant="outline" size="sm" class="rounded-full" onclick={goToToday}>Today</Button
					>
				</div>

				<div class="pb-2">
					<div>
						<div class="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
							{#each weekdays as weekday}
								<div
									class="text-muted-foreground py-1 text-center text-[10px] font-semibold tracking-wide uppercase sm:text-xs"
								>
									{weekday}
								</div>
							{/each}
						</div>

						<div class="grid grid-cols-7 gap-1 sm:gap-1.5">
							{#each calendarCells as day, index (`${year}-${month}-${index}`)}
								{#if day === null}
									<div aria-hidden="true"></div>
								{:else}
									{@const date = isoOf(year, month, day)}
									{@const dayRecords = recordsByDate[date] ?? []}
									<div
										class:ring-2={date === todayIso}
										class:ring-primary={date === todayIso}
										class:bg-card={dayRecords.length > 0}
										class:shadow-sm={dayRecords.length > 0}
										class="bg-muted/45 min-h-[58px] rounded-md p-1 sm:min-h-[88px] sm:rounded-lg sm:p-1.5"
									>
										<div class="mb-1 flex justify-end">
											<span
												class:bg-foreground={date === todayIso}
												class:text-background={date === todayIso}
												class="flex size-6 items-center justify-center rounded-full text-xs font-semibold"
												>{day}</span
											>
										</div>
										<div class="space-y-1">
											{#each dayRecords as record}
												<div
													class={`${statusStyle[record.status].chip} flex items-center justify-center gap-1.5 overflow-hidden rounded-md px-0.5 py-1 text-[11px] font-semibold sm:justify-start sm:px-1.5`}
													title={record.note || statusStyle[record.status].label}
												>
													<span
														class={`${statusStyle[record.status].dot} size-1.5 shrink-0 rounded-full`}
													></span>
													<span class="hidden truncate sm:block"
														>{record.note || statusStyle[record.status].label}</span
													>
												</div>
											{/each}
										</div>
									</div>
								{/if}
							{/each}
						</div>
					</div>
				</div>

				<div
					class="text-muted-foreground mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm"
				>
					{#each Object.entries(statusStyle) as [, meta]}
						<div class="flex items-center gap-2">
							<span class={`${meta.dot} size-2.5 rounded-full`}></span>
							{meta.label}
						</div>
					{/each}
				</div>
			</section>
		{:else}
			<section aria-label="Attendance records" class="mx-auto max-w-[940px]">
				{#if sortedRecords.length === 0}
					<div class="text-muted-foreground py-14 text-center text-sm">No attendance records.</div>
				{:else}
					<div class="space-y-1">
						{#each sortedRecords as record (record.date)}
							<button
								type="button"
								class="hover:bg-accent/45 flex w-full items-center justify-between gap-4 rounded-lg px-2 py-4 text-left transition-colors"
								aria-expanded={Boolean(expanded[record.date])}
								onclick={() => toggleRecord(record)}
							>
								<span class="font-semibold">
									{longDate(record.date)}{record.note ? `: ${record.note}` : ''}
								</span>
								<span class="flex shrink-0 items-center gap-3">
									<span
										class={`${statusStyle[record.status].chip} rounded-md px-2.5 py-1 text-xs font-semibold`}
									>
										{statusStyle[record.status].label}
									</span>
									<ChevronDownIcon
										class={`text-muted-foreground size-4 transition-transform ${expanded[record.date] ? 'rotate-180' : ''}`}
									/>
								</span>
							</button>
							{#if expanded[record.date]}
								<div class="text-muted-foreground space-y-2 px-3 pb-4 text-sm">
									{#if record.periods.length === 0}
										<p>{record.reason || 'No additional details.'}</p>
									{:else}
										{#each record.periods as period}
											<p>
												{period.course || `Period ${period.period}`}: {period.reason ||
													'No additional details'}{period.note ? `: ${period.note}` : ''}
											</p>
										{/each}
									{/if}
								</div>
							{/if}
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</div>
{/if}
