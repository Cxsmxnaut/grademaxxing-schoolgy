<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import type { Period } from '$lib/contracts/studentvue/attendance';
	import CalendarDaysIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { attendanceState, loadAttendance } from './attendance.svelte';

	loadAttendance();

	type AttendanceType = 'Absent' | 'Tardy' | 'Excused' | 'Present' | 'Unknown';
	type View = 'day' | 'week' | 'month';
	type AttendanceRow = {
		date: string;
		dateObject?: Date;
		note: string;
		type: AttendanceType;
		periods: Period[];
		reason: string;
	};

	const excusedReasonRegex =
		/Field Trip|School Pass|Excused|Medical\/Dent|Comp Ed\/Court-Religi|Illness or Sickness|SB14 Wellness\/Illnes|Med. all day\/period/i;
	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
	const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
	const longDateFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
		year: 'numeric'
	});
	const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});
	const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const statusPriority: Record<AttendanceType, number> = {
		Present: 0,
		Excused: 1,
		Tardy: 2,
		Absent: 3,
		Unknown: 0
	};
	const statusOptions: AttendanceType[] = ['Absent', 'Tardy', 'Excused', 'Present', 'Unknown'];

	let selectedDate = $state(new Date());
	let view = $state<View>('day');
	let courseFilter = $state('all');
	let statusFilter = $state('all');
	let visibleStatuses = $state<AttendanceType[]>([...statusOptions]);
	let expandedRecord = $state<string | undefined>();

	function getAbsenceType(periods: Period[]): AttendanceType {
		const reasons = periods.map((period) => period._Name);
		if (reasons.some((reason) => reason === 'Absent' || reason === 'Non ADA')) return 'Absent';
		if (reasons.some((reason) => /Tardy/i.test(reason))) return 'Tardy';
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
		const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
		if (isoMatch)
			return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
		const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
		if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
		const date = new Date(value);
		return value && !Number.isNaN(date.getTime())
			? new Date(date.getFullYear(), date.getMonth(), date.getDate())
			: undefined;
	}

	function dateKey(date: Date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function statusTone(type: AttendanceType) {
		return type === 'Absent'
			? 'risk'
			: type === 'Tardy'
				? 'watch'
				: type === 'Excused'
					? 'accent'
					: type === 'Present'
						? 'success'
						: 'neutral';
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

	const courses = $derived(
		[
			...new Set(
				attendanceRows.flatMap((row) => row.periods.map((period) => period._Course).filter(Boolean))
			)
		].toSorted()
	);
	const filteredRows = $derived(
		attendanceRows.filter(
			(row) =>
				visibleStatuses.includes(row.type) &&
				(statusFilter === 'all' || row.type === statusFilter) &&
				(courseFilter === 'all' || row.periods.some((period) => period._Course === courseFilter))
		)
	);
	const latestRecord = $derived(attendanceRows.find((row) => row.dateObject));
	const selectedMonth = $derived(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
	const weekStart = $derived(
		new Date(
			selectedDate.getFullYear(),
			selectedDate.getMonth(),
			selectedDate.getDate() - selectedDate.getDay()
		)
	);
	const weekEnd = $derived(
		new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)
	);
	const rangeLabel = $derived(
		view === 'month'
			? monthFormatter.format(selectedDate)
			: view === 'week'
				? `${shortDateFormatter.format(weekStart)} – ${shortDateFormatter.format(weekEnd)}, ${weekEnd.getFullYear()}`
				: longDateFormatter.format(selectedDate)
	);
	const visibleDates = $derived.by(() => {
		if (view === 'day') return [selectedDate];
		if (view === 'week')
			return Array.from(
				{ length: 7 },
				(_, index) =>
					new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + index)
			);
		return Array.from(
			{ length: new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate() },
			(_, index) => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), index + 1)
		);
	});
	const agendaDates = $derived(
		view === 'month'
			? visibleDates.filter((date) =>
					filteredRows.some((row) => row.dateObject && dateKey(row.dateObject) === dateKey(date))
				)
			: visibleDates
	);
	const visibleCount = $derived(
		visibleDates.reduce((count, date) => count + recordsForDate(date).length, 0)
	);
	const calendarDays = $derived.by(() => {
		const year = selectedMonth.getFullYear();
		const month = selectedMonth.getMonth();
		return [
			...Array.from({ length: new Date(year, month, 1).getDay() }, (_, index) => ({
				key: `blank-${index}`,
				date: undefined
			})),
			...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => {
				const date = new Date(year, month, index + 1);
				return { key: dateKey(date), date };
			})
		];
	});

	function recordsForDate(date: Date) {
		return filteredRows.filter(
			(row) => row.dateObject && dateKey(row.dateObject) === dateKey(date)
		);
	}
	function allRecordsForDate(date: Date) {
		return filteredRows.filter(
			(row) => row.dateObject && dateKey(row.dateObject) === dateKey(date)
		);
	}
	function move(offset: number) {
		if (view === 'month')
			selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1);
		else
			selectedDate = new Date(
				selectedDate.getFullYear(),
				selectedDate.getMonth(),
				selectedDate.getDate() + offset * (view === 'week' ? 7 : 1)
			);
		expandedRecord = undefined;
	}
	function moveMonth(offset: number) {
		selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + offset, 1);
		expandedRecord = undefined;
	}
	function chooseDate(date: Date) {
		selectedDate = date;
		view = 'day';
		expandedRecord = undefined;
	}
	function toggleStatus(status: AttendanceType) {
		visibleStatuses = visibleStatuses.includes(status)
			? visibleStatuses.filter((item) => item !== status)
			: [...visibleStatuses, status];
	}
	function primaryType(records: AttendanceRow[]) {
		return records.reduce(
			(winner, record) =>
				statusPriority[record.type] > statusPriority[winner] ? record.type : winner,
			records[0]?.type ?? 'Unknown'
		);
	}
</script>

<svelte:head><title>Attendance - {brand}</title></svelte:head>

<AppPageShell class="attendance-shell">
	<header class="page-heading">
		<div>
			<p class="eyebrow">School record</p>
			<h1>Attendance</h1>
			<p>Explore the dates and details reported by your school.</p>
		</div>
	</header>

	{#if !attendanceState.loaded}<LoadingBanner>Loading attendance records...</LoadingBanner
		>{:else if attendanceState.refreshing}<LoadingBanner>Refreshing attendance...</LoadingBanner
		>{/if}
	{#if attendanceState.loaded && attendanceState.error}<RecordLoadFailure
			label="attendance"
			error={attendanceState.error}
			refreshing={attendanceState.refreshing}
			retry={() => loadAttendance(true)}
		/>{/if}

	{#if attendanceState.data}
		<div class="filter-bar" aria-label="Attendance filters">
			<label
				><span>Course</span><select bind:value={courseFilter}
					><option value="all">All courses</option>{#each courses as course (course)}<option
							value={course}>{course}</option
						>{/each}</select
				></label
			>
			<label
				><span>Status</span><select bind:value={statusFilter}
					><option value="all">All statuses</option>{#each statusOptions as status (status)}<option
							value={status}>{status}</option
						>{/each}</select
				></label
			>
		</div>

		<div class="calendar-toolbar">
			<div class="date-actions">
				<button
					type="button"
					class="today-button"
					onclick={() => {
						selectedDate = new Date();
						expandedRecord = undefined;
					}}>Today</button
				><button type="button" aria-label="Previous {view}" onclick={() => move(-1)}
					><ChevronLeftIcon class="size-4" /></button
				><button type="button" aria-label="Next {view}" onclick={() => move(1)}
					><ChevronRightIcon class="size-4" /></button
				>
			</div>
			<h2>{rangeLabel}</h2>
			<div class="view-switch" aria-label="Calendar view">
				{#each ['month', 'week', 'day'] as option (option)}<button
						type="button"
						class:active={view === option}
						aria-pressed={view === option}
						onclick={() => {
							view = option as View;
							expandedRecord = undefined;
						}}>{(option[0] ?? '').toUpperCase() + option.slice(1)}</button
					>{/each}
			</div>
		</div>

		<div class="workspace">
			<main class="agenda" aria-label="Attendance records">
				{#if view === 'day'}<div class="section-heading">
						<CalendarDaysIcon class="size-5" />
						<h3>{weekdayFormatter.format(selectedDate)}</h3>
						<span>{visibleCount} {visibleCount === 1 ? 'record' : 'records'}</span>
					</div>{/if}
				{#if agendaDates.length}
					{#each agendaDates as date (dateKey(date))}
						{@const records = recordsForDate(date)}
						{#if view !== 'day'}<div class="section-heading">
								<h3>{weekdayFormatter.format(date)}</h3>
								<span>{records.length} {records.length === 1 ? 'record' : 'records'}</span>
							</div>{/if}
						{#if records.length}
							<div class="day-records">
								{#each records as record, index (`${record.date}-${record.type}-${index}`)}
									{@const recordKey = `${record.date}-${record.type}-${index}`}
									<article class="record">
										<button
											type="button"
											class="record-trigger"
											aria-expanded={expandedRecord === recordKey}
											onclick={() =>
												(expandedRecord = expandedRecord === recordKey ? undefined : recordKey)}
											><span class="record-icon {statusTone(record.type)}"></span><span
												class="record-copy"
												><strong>{record.note || record.reason || record.type}</strong><small
													>{record.periods.length
														? `${record.periods.length} affected ${record.periods.length === 1 ? 'period' : 'periods'}`
														: 'Daily attendance record'}</small
												></span
											><span class="type-badge {statusTone(record.type)}">{record.type}</span
											><ChevronDownIcon
												class={`chevron size-4 ${expandedRecord === recordKey ? 'rotated' : ''}`}
											/></button
										>
										{#if expandedRecord === recordKey}<div class="record-detail">
												{#if record.periods.length}{#each record.periods as period (`${recordKey}-${period._Number}`)}<div
														>
															<span>Period {period._Number}</span><strong
																>{period._Course || 'Course not provided'}</strong
															>
															<p>
																{period._Reason ||
																	period._Name ||
																	'No reason provided'}{period._Staff ? ` · ${period._Staff}` : ''}
															</p>
														</div>{/each}{:else}<p>
														{record.reason || 'No additional detail was provided.'}
													</p>{/if}
											</div>{/if}
									</article>{/each}
							</div>
						{:else}<p class="day-empty">No attendance records for this day.</p>{/if}
					{/each}
				{:else}<div class="empty-month">
						<CalendarDaysIcon class="size-6" />
						<h3>No records this month</h3>
						<p>Try another month or adjust the filters.</p>
						{#if latestRecord?.dateObject}<button
								type="button"
								onclick={() => chooseDate(latestRecord.dateObject!)}>Go to latest record</button
							>{/if}
					</div>{/if}
				{#if view === 'day' && !visibleCount && latestRecord?.dateObject}<button
						type="button"
						class="latest-link"
						onclick={() => chooseDate(latestRecord.dateObject!)}
						>Go to latest record <ChevronRightIcon class="size-4" /></button
					>{/if}
			</main>

			<aside class="calendar-sidebar" aria-label="Calendar and status filters">
				<div class="mini-calendar">
					<div class="mini-heading">
						<button type="button" aria-label="Previous month" onclick={() => moveMonth(-1)}
							><ChevronLeftIcon class="size-4" /></button
						><strong>{monthFormatter.format(selectedMonth)}</strong><button
							type="button"
							aria-label="Next month"
							onclick={() => moveMonth(1)}><ChevronRightIcon class="size-4" /></button
						>
					</div>
					<div class="mini-weekdays" aria-hidden="true">
						{#each weekdayNames as weekday (weekday)}<span>{weekday.slice(0, 1)}</span>{/each}
					</div>
					<div class="mini-grid">
						{#each calendarDays as day (day.key)}{#if day.date}{@const records = allRecordsForDate(
									day.date
								)}<button
									type="button"
									class:selected={dateKey(day.date) === dateKey(selectedDate)}
									class:has-record={records.length > 0}
									aria-label={`${longDateFormatter.format(day.date)}${records.length ? `, ${records.length} attendance ${records.length === 1 ? 'record' : 'records'}` : ''}`}
									aria-pressed={dateKey(day.date) === dateKey(selectedDate)}
									onclick={() => chooseDate(day.date)}
									>{day.date.getDate()}{#if records.length}<span
											class="date-dot {statusTone(primaryType(records))}"
										></span>{/if}</button
								>{:else}<span></span>{/if}{/each}
					</div>
				</div>
				<div class="status-panel">
					<div class="status-title">
						<span class="eyebrow">Show on calendar</span>
						<h3>Attendance types</h3>
					</div>
					{#each statusOptions as status (status)}<label class="status-option"
							><input
								type="checkbox"
								checked={visibleStatuses.includes(status)}
								onchange={() => toggleStatus(status)}
							/><span class="status-swatch {statusTone(status)}"></span><span
								>{status === 'Unknown' ? 'Other records' : status}</span
							></label
						>{/each}
				</div>
				<p class="source-note">
					Dates with dots have attendance records. Details come from your school’s StudentVUE
					record.
				</p>
			</aside>
		</div>
	{/if}
</AppPageShell>

<style>
	/* Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V4 · reference structure: agenda + calendar rail; Grademaxxing tokens */
	:global(.attendance-shell) {
		max-width: 90rem;
	}
	button {
		cursor: pointer;
	}
	button:focus-visible,
	select:focus-visible,
	input:focus-visible {
		outline: 2px solid var(--focus);
		outline-offset: 2px;
	}
	.page-heading {
		margin-bottom: var(--space-lg);
	}
	.page-heading h1 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.8rem, 3vw, 2.35rem);
		letter-spacing: -0.04em;
	}
	.page-heading p:last-child {
		margin: 0.25rem 0 0;
		color: var(--muted-foreground);
		font-size: 0.9rem;
	}
	.eyebrow {
		margin: 0 0 0.2rem;
		color: var(--primary);
		font-family: var(--font-technical);
		font-size: 0.67rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.filter-bar {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.filter-bar label {
		position: relative;
		min-width: 0;
	}
	.filter-bar label span {
		position: absolute;
		top: 0.48rem;
		left: 0.9rem;
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.62rem;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		pointer-events: none;
	}
	.filter-bar select {
		width: 100%;
		min-height: 3.6rem;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--card);
		color: var(--foreground);
		padding: 1.2rem 2.2rem 0.3rem 0.9rem;
		font: inherit;
		font-size: 0.9rem;
		font-weight: 650;
	}
	.calendar-toolbar {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: var(--space-md);
		margin: 0 0 var(--space-lg);
	}
	.calendar-toolbar h2 {
		min-width: 0;
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: clamp(1.05rem, 2vw, 1.4rem);
		letter-spacing: -0.025em;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.date-actions,
	.view-switch {
		display: inline-flex;
		align-items: stretch;
		width: fit-content;
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--card);
	}
	.date-actions button,
	.view-switch button {
		display: grid;
		min-width: 2.5rem;
		min-height: 2.5rem;
		place-items: center;
		border: 0;
		border-right: 1px solid var(--border);
		background: transparent;
		color: var(--foreground);
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.date-actions button:last-child,
	.view-switch button:last-child {
		border-right: 0;
	}
	.date-actions .today-button {
		padding-inline: 0.9rem;
		background: var(--primary);
		color: var(--primary-foreground);
		font-weight: 700;
	}
	.view-switch {
		justify-self: end;
	}
	.view-switch button {
		padding-inline: 0.75rem;
	}
	.view-switch button.active {
		background: var(--secondary);
		font-weight: 750;
	}
	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(15.5rem, 18rem);
		align-items: start;
		gap: var(--space-lg);
	}
	.agenda {
		min-width: 0;
	}
	.section-heading {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 2.8rem;
		margin-bottom: var(--space-xs);
		border-radius: var(--radius-sm);
		background: var(--secondary);
		padding: 0.5rem var(--space-md);
		color: var(--foreground);
	}
	.section-heading:not(:first-child) {
		margin-top: var(--space-lg);
	}
	.section-heading h3 {
		min-width: 0;
		margin: 0;
		font-family: var(--font-heading);
		font-size: 1.05rem;
		letter-spacing: -0.02em;
	}
	.section-heading span {
		margin-left: auto;
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.68rem;
		white-space: nowrap;
	}
	.day-records {
		border-bottom: 1px solid var(--border);
	}
	.record {
		border-top: 1px solid var(--border);
	}
	.record:first-child {
		border-top: 0;
	}
	.record-trigger {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		width: 100%;
		min-height: 4.7rem;
		border: 0;
		background: transparent;
		color: var(--foreground);
		padding: 0.85rem var(--space-sm);
		text-align: left;
	}
	.record-icon {
		width: 0.55rem;
		height: 0.55rem;
		flex: 0 0 auto;
		border-radius: 50%;
		background: currentColor;
	}
	.record-copy {
		display: grid;
		min-width: 0;
		gap: 0.2rem;
	}
	.record-copy strong {
		overflow-wrap: anywhere;
		font-size: 0.9rem;
		line-height: 1.35;
	}
	.record-copy small {
		color: var(--muted-foreground);
		font-size: 0.76rem;
	}
	.type-badge {
		margin-left: auto;
		border-radius: 999px;
		padding: 0.3rem 0.65rem;
		font-size: 0.7rem;
		font-weight: 700;
		white-space: nowrap;
	}
	.type-badge.risk {
		background: var(--grade-risk-soft);
	}
	.type-badge.watch {
		background: var(--grade-watch-soft);
	}
	.type-badge.success {
		background: var(--grade-strong-soft);
	}
	.type-badge.accent {
		background: var(--accent);
	}
	.type-badge.neutral {
		background: var(--secondary);
	}
	.chevron {
		flex: 0 0 auto;
		color: var(--muted-foreground);
		transition: transform 150ms ease-out;
	}
	.chevron.rotated {
		transform: rotate(180deg);
	}
	.record-detail {
		display: grid;
		gap: var(--space-xs);
		padding: 0 var(--space-md) var(--space-md) calc(var(--space-md) + 0.55rem + var(--space-md));
	}
	.record-detail > div {
		display: grid;
		grid-template-columns: 5rem minmax(0, 1fr);
		gap: 0.15rem var(--space-sm);
		border-left: 2px solid var(--border);
		background: var(--secondary);
		padding: 0.65rem 0.8rem;
	}
	.record-detail span {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.68rem;
	}
	.record-detail strong {
		overflow-wrap: anywhere;
		font-size: 0.8rem;
	}
	.record-detail p {
		grid-column: 2;
		margin: 0;
		color: var(--muted-foreground);
		font-size: 0.78rem;
	}
	.day-empty {
		margin: 0;
		padding: var(--space-xl) var(--space-md);
		color: var(--muted-foreground);
		font-size: 0.9rem;
	}
	.latest-link,
	.empty-month button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		margin: var(--space-sm) 0 0 var(--space-md);
		border: 0;
		background: transparent;
		color: var(--primary);
		font-size: 0.83rem;
		font-weight: 700;
	}
	.empty-month {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		padding: var(--space-2xl) var(--space-md);
		color: var(--muted-foreground);
		text-align: center;
	}
	.empty-month h3 {
		margin: 0;
		color: var(--foreground);
	}
	.empty-month p {
		margin: 0;
	}
	.empty-month button {
		margin-left: 0;
	}
	.calendar-sidebar {
		overflow: hidden;
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--card);
	}
	.mini-calendar {
		padding: var(--space-md);
	}
	.mini-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-xs);
		margin-bottom: var(--space-sm);
	}
	.mini-heading strong {
		min-width: 0;
		font-family: var(--font-heading);
		font-size: 0.88rem;
		text-align: center;
	}
	.mini-heading button {
		display: grid;
		width: 1.9rem;
		height: 1.9rem;
		flex: 0 0 auto;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--secondary);
		color: var(--foreground);
	}
	.mini-weekdays,
	.mini-grid {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		gap: 0.18rem;
	}
	.mini-weekdays {
		margin-bottom: 0.25rem;
	}
	.mini-weekdays span {
		color: var(--muted-foreground);
		font-family: var(--font-technical);
		font-size: 0.62rem;
		text-align: center;
	}
	.mini-grid button,
	.mini-grid > span {
		position: relative;
		display: grid;
		min-width: 0;
		height: 2rem;
		place-items: center;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--muted-foreground);
		font-size: 0.77rem;
	}
	.mini-grid button.has-record {
		background: var(--secondary);
		color: var(--foreground);
		font-weight: 700;
	}
	.mini-grid button.selected {
		background: var(--primary);
		color: var(--primary-foreground);
	}
	.date-dot {
		position: absolute;
		bottom: 0.13rem;
		width: 0.2rem;
		height: 0.2rem;
		border-radius: 50%;
		background: currentColor;
	}
	.mini-grid button.selected .date-dot {
		color: var(--primary-foreground);
	}
	.status-panel {
		border-top: 1px solid var(--border);
	}
	.status-title {
		padding: var(--space-md) var(--space-md) var(--space-xs);
	}
	.status-title h3 {
		margin: 0;
		color: var(--foreground);
		font-family: var(--font-heading);
		font-size: 0.95rem;
	}
	.status-option {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-height: 2.7rem;
		border-top: 1px solid var(--border);
		padding: 0.4rem var(--space-md);
		color: var(--foreground);
		font-size: 0.81rem;
		cursor: pointer;
	}
	.status-option input {
		accent-color: var(--primary);
	}
	.status-swatch {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: currentColor;
	}
	.source-note {
		margin: 0;
		border-top: 1px solid var(--border);
		padding: var(--space-md);
		color: var(--muted-foreground);
		font-size: 0.72rem;
		line-height: 1.5;
	}
	.risk {
		color: var(--grade-risk);
	}
	.watch {
		color: var(--grade-watch);
	}
	.success {
		color: var(--grade-strong);
	}
	.accent {
		color: var(--primary);
	}
	.neutral {
		color: var(--muted-foreground);
	}
	@media (max-width: 56rem) {
		.workspace {
			grid-template-columns: minmax(0, 1fr);
		}
		.calendar-sidebar {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.status-panel {
			border-top: 0;
			border-left: 1px solid var(--border);
		}
		.source-note {
			grid-column: 1 / -1;
		}
	}
	@media (max-width: 39rem) {
		.calendar-toolbar {
			grid-template-columns: 1fr auto;
		}
		.calendar-toolbar h2 {
			grid-column: 1 / -1;
			grid-row: 1;
			text-align: left;
		}
		.date-actions,
		.view-switch {
			grid-row: 2;
		}
		.view-switch button {
			padding-inline: 0.55rem;
		}
		.calendar-sidebar {
			grid-template-columns: 1fr;
		}
		.status-panel {
			border-left: 0;
			border-top: 1px solid var(--border);
		}
		.source-note {
			grid-column: auto;
		}
		.filter-bar {
			gap: 0.5rem;
		}
		.filter-bar select {
			font-size: 0.78rem;
		}
		.record-trigger {
			gap: var(--space-sm);
		}
		.type-badge {
			display: none;
		}
		.record-detail {
			padding-left: var(--space-sm);
		}
		.record-detail > div {
			grid-template-columns: 1fr;
		}
		.record-detail p {
			grid-column: 1;
		}
	}
	@media (hover: hover) {
		.record-trigger:hover,
		.mini-grid button:hover,
		.date-actions button:not(.today-button):hover,
		.view-switch button:hover {
			background: var(--secondary);
		}
		.mini-grid button.selected:hover {
			background: var(--primary);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
