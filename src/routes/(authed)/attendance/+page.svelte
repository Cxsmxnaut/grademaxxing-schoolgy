<script lang="ts">
	import { brand } from '$lib/brand';
	import AppPageShell from '$lib/components/AppPageShell.svelte';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import { Calendar } from '$lib/components/ui/calendar';
	import CalendarDay from '$lib/components/ui/calendar/calendar-day.svelte';
	import type { Period } from '$lib/contracts/studentvue/attendance';
	import { CalendarDate, type DateValue } from '@internationalized/date';
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
	const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'long',
		month: 'short',
		day: 'numeric'
	});
	const statusPriority: Record<AttendanceType, number> = {
		Present: 0,
		Excused: 1,
		Tardy: 2,
		Absent: 3,
		Unknown: 0
	};
	const statusOptions: AttendanceType[] = ['Absent', 'Tardy', 'Excused', 'Present', 'Unknown'];

	const initialDate = new Date();
	let selectedDate = $state(initialDate);
	let calendarPlaceholder = $state(toCalendarDate(initialDate));
	const calendarValue = $derived(toCalendarDate(selectedDate));
	let view = $state<View>('day');
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
	function toCalendarDate(date: Date) {
		return new CalendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
	}
	function fromCalendarDate(date: DateValue) {
		return new Date(date.year, date.month - 1, date.day);
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

	const filteredRows = $derived(attendanceRows.filter((row) => visibleStatuses.includes(row.type)));
	const latestRecord = $derived(attendanceRows.find((row) => row.dateObject));
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
		view === 'month' || view === 'day'
			? monthFormatter.format(selectedDate)
			: `${shortDateFormatter.format(weekStart)} – ${shortDateFormatter.format(weekEnd)}, ${weekEnd.getFullYear()}`
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
	function recordsForDate(date: Date) {
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
		calendarPlaceholder = toCalendarDate(selectedDate);
		expandedRecord = undefined;
	}
	function chooseDate(date: Date) {
		selectedDate = date;
		calendarPlaceholder = toCalendarDate(date);
		view = 'day';
		expandedRecord = undefined;
	}
	function showCalendarMonth(date: DateValue) {
		calendarPlaceholder = new CalendarDate(date.year, date.month, date.day);
		if (date.year !== selectedDate.getFullYear() || date.month !== selectedDate.getMonth() + 1) {
			selectedDate = new Date(date.year, date.month - 1, 1);
			expandedRecord = undefined;
		}
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
			<h1>Attendance</h1>
			<p>Explore the dates and details reported by your school.</p>
		</div>
	</header>

	{#if !attendanceState.loaded}<LoadingBanner>Loading attendance records…</LoadingBanner
		>{:else if attendanceState.refreshing}<LoadingBanner>Refreshing attendance…</LoadingBanner>{/if}
	{#if attendanceState.loaded && attendanceState.error}<RecordLoadFailure
			label="attendance"
			error={attendanceState.error}
			refreshing={attendanceState.refreshing}
			retry={() => loadAttendance(true)}
		/>{/if}

	{#if attendanceState.data}
		<div class="calendar-toolbar">
			<div class="date-actions">
				<button
					type="button"
					class="today-button"
					onclick={() => {
						selectedDate = new Date();
						calendarPlaceholder = toCalendarDate(selectedDate);
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
					<Calendar
						type="single"
						value={calendarValue}
						placeholder={calendarPlaceholder}
						onValueChange={(date) => {
							if (date) chooseDate(fromCalendarDate(date));
						}}
						onPlaceholderChange={showCalendarMonth}
						calendarLabel="Attendance dates"
						weekdayFormat="short"
						disableDaysOutsideMonth
						class="attendance-calendar w-full bg-transparent p-0 [--cell-size:2rem]"
					>
						{#snippet day({ day, outsideMonth })}
							{@const records = recordsForDate(fromCalendarDate(day))}
							<CalendarDay
								class="attendance-day relative"
								title={records.length
									? `${records.length} attendance ${records.length === 1 ? 'record' : 'records'}`
									: undefined}
							>
								{day.day}
								{#if !outsideMonth && records.length}<span
										class="date-dot {statusTone(primaryType(records))}"
										aria-hidden="true"
									></span>{/if}
							</CalendarDay>
						{/snippet}
					</Calendar>
				</div>
				<div class="status-panel">
					<div class="status-title">
						<h3>Attendance types</h3>
					</div>
					<div class="status-options">
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
	/* Hallmark · pre-emit critique: P5 H4 E4 S5 R5 V4 · genre: modern-minimal · macrostructure: Agenda Workbench · palette: Grademaxxing semantic tokens */
	:global(.attendance-shell) {
		max-width: 90rem;
	}
	button {
		cursor: pointer;
	}
	button:focus-visible,
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
		min-height: 3rem;
		margin-bottom: var(--space-sm);
		border-bottom: 1px solid var(--border);
		padding: 0.35rem 0 var(--space-sm);
		color: var(--foreground);
	}
	.section-heading:not(:first-child) {
		margin-top: var(--space-lg);
	}
	.section-heading h3 {
		min-width: 0;
		margin: 0;
		font-family: var(--font-heading);
		font-size: 1.125rem;
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
		border-top: 1px solid var(--border);
		padding: 0.7rem 0;
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
	:global(.attendance-calendar) {
		margin-inline: auto;
		max-width: 17rem;
	}
	:global(.attendance-calendar [data-bits-calendar-header]) {
		font-family: var(--font-heading);
	}
	.date-dot {
		position: absolute;
		bottom: 0.12rem;
		width: 0.2rem;
		height: 0.2rem;
		border-radius: 50%;
		background: currentColor;
	}
	:global(.attendance-calendar [data-selected]) .date-dot {
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
	.status-options {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0 var(--space-xs);
		padding: 0 var(--space-md) var(--space-sm);
	}
	.status-option {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 2.4rem;
		padding: 0.25rem 0;
		color: var(--foreground);
		font-size: 0.73rem;
		white-space: nowrap;
		cursor: pointer;
	}
	.status-option:last-child {
		grid-column: 1 / -1;
	}
	.status-option input {
		appearance: none;
		display: grid;
		width: 1rem;
		height: 1rem;
		flex: 0 0 auto;
		place-items: center;
		margin: 0;
		border: 1px solid var(--input);
		border-radius: var(--radius-sm);
		background: transparent;
		cursor: pointer;
	}
	.status-option input:checked {
		border-color: var(--primary);
		background: var(--primary);
	}
	.status-option input::after {
		width: 0.28rem;
		height: 0.5rem;
		border-right: 2px solid var(--primary-foreground);
		border-bottom: 2px solid var(--primary-foreground);
		content: '';
		opacity: 0;
		transform: translateY(-0.08rem) rotate(45deg);
	}
	.status-option input:checked::after {
		opacity: 1;
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
		.record-trigger {
			gap: var(--space-sm);
		}
		.type-badge {
			padding: 0.2rem 0.45rem;
			font-size: 0.65rem;
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
		.date-actions button:hover,
		.view-switch button:hover {
			background: var(--secondary);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.chevron {
			transition: none;
		}
	}
</style>
