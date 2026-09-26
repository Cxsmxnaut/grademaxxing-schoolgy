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
	type AttendanceRow = {
		date: string;
		dateObject?: Date;
		note: string;
		type: AttendanceType;
		periods: Period[];
		reason: string;
	};

	const excusedReasonRegex = /Field Trip|School Pass|Excused|Medical\/Dent|Comp Ed\/Court-Religi|Illness or Sickness|SB14 Wellness\/Illnes|Med. all day\/period/;
	const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
	const shortDateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
	const longDateFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
	const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const statusPriority: Record<AttendanceType, number> = { Present: 0, Excused: 1, Tardy: 2, Absent: 3, Unknown: 0 };

	let currentMonth = $state(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
	let rangeStart = $state<string | undefined>();
	let rangeEnd = $state<string | undefined>();
	let expandedRecord = $state<string | undefined>();

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
		const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
		if (isoMatch) return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
		const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(value);
		if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
		const date = new Date(value);
		return value && !Number.isNaN(date.getTime()) ? new Date(date.getFullYear(), date.getMonth(), date.getDate()) : undefined;
	}

	function dateKey(date: Date) {
		return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
	}

	function statusTone(type: AttendanceType) {
		return type === 'Absent' ? 'risk' : type === 'Tardy' ? 'watch' : type === 'Excused' ? 'accent' : type === 'Present' ? 'success' : 'neutral';
	}

	const attendanceRows = $derived.by((): AttendanceRow[] => {
		const absences = attendanceState.data?.Absences.Absence ?? [];
		const incidentDates = new Set(absences.map((absence) => absence._AbsenceDate));
		return [
			...absences.map((absence) => ({ date: absence._AbsenceDate, dateObject: parseAttendanceDate(absence._AbsenceDate), note: absence._Note || absence._Reason, type: getAbsenceType(absence.Periods.Period ?? []), periods: absence.Periods.Period ?? [], reason: absence._Reason })),
			...(attendanceState.data?.DailyRecords ?? []).filter((record) => !incidentDates.has(record.Date)).map((record) => ({ date: record.Date, dateObject: parseAttendanceDate(record.Date), note: record.Reason, type: getDailyType(record.Status, record.Reason), periods: [], reason: record.Reason || record.Status }))
		].toSorted((a, b) => (b.dateObject?.getTime() ?? 0) - (a.dateObject?.getTime() ?? 0));
	});

	const daysRecorded = $derived(new Set(attendanceRows.flatMap((row) => row.dateObject ? [dateKey(row.dateObject)] : [])).size);
	const absences = $derived(attendanceRows.filter((row) => row.type === 'Absent').length);
	const tardies = $derived(attendanceRows.filter((row) => row.type === 'Tardy' || row.periods.some((period) => /tardy/i.test(period._Name))).length);
	const latestRecord = $derived(attendanceRows.find((row) => row.dateObject));
	const filteredRows = $derived(attendanceRows.filter((row) => {
		if (!row.dateObject || !rangeStart) return !rangeStart;
		const key = dateKey(row.dateObject);
		return rangeEnd ? key >= rangeStart && key <= rangeEnd : key === rangeStart;
	}));
	const focusLabel = $derived(!rangeStart ? 'All recorded dates' : !rangeEnd ? shortDateFormatter.format(parseAttendanceDate(rangeStart)!) : `${shortDateFormatter.format(parseAttendanceDate(rangeStart)!)} – ${shortDateFormatter.format(parseAttendanceDate(rangeEnd)!)}`);
	const calendarDays = $derived.by(() => {
		const year = currentMonth.getFullYear();
		const month = currentMonth.getMonth();
		return [...Array.from({ length: new Date(year, month, 1).getDay() }, (_, index) => ({ key: `blank-${index}`, date: undefined })), ...Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => { const date = new Date(year, month, index + 1); return { key: dateKey(date), date }; })];
	});

	function recordsForDate(date: Date) { return attendanceRows.filter((record) => record.dateObject && dateKey(record.dateObject) === dateKey(date)); }
	function changeMonth(offset: number) { currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1); }
	function chooseDate(date: Date) {
		const key = dateKey(date);
		expandedRecord = undefined;
		if (!rangeStart || rangeEnd || key < rangeStart) { rangeStart = key; rangeEnd = undefined; }
		else rangeEnd = key;
	}
	function clearRange() { rangeStart = undefined; rangeEnd = undefined; expandedRecord = undefined; }
	function showLatest() {
		if (!latestRecord?.dateObject) return;
		currentMonth = new Date(latestRecord.dateObject.getFullYear(), latestRecord.dateObject.getMonth(), 1);
		rangeStart = dateKey(latestRecord.dateObject); rangeEnd = undefined;
	}
	function isInRange(key: string) { return Boolean(rangeStart && rangeEnd && key > rangeStart && key < rangeEnd); }
	function isSelected(key: string) { return key === rangeStart || key === rangeEnd; }
	function isToday(date: Date) { return dateKey(date) === dateKey(new Date()); }
	function primaryType(records: AttendanceRow[]) { return records.reduce((winner, record) => statusPriority[record.type] > statusPriority[winner] ? record.type : winner, records[0]?.type ?? 'Unknown'); }
</script>

<svelte:head><title>Attendance - {brand}</title></svelte:head>

<AppPageShell class="max-w-[67.5rem]">
	<header class="attendance-heading">
		<div>
			<p class="eyebrow"><CalendarDaysIcon class="size-4" /> Attendance</p>
			<h1>See the whole picture.</h1>
			<p class="lede">Choose a day or a date range to focus the record below.</p>
		</div>
		<button class="action-button" type="button" onclick={showLatest} disabled={!latestRecord}>Latest record</button>
	</header>

	{#if !attendanceState.loaded}<LoadingBanner>Loading attendance. Checking the ledger.</LoadingBanner>{:else if attendanceState.refreshing}<LoadingBanner>Refreshing attendance...</LoadingBanner>{/if}
	{#if attendanceState.loaded && attendanceState.error}<RecordLoadFailure label="attendance" error={attendanceState.error} refreshing={attendanceState.refreshing} retry={() => loadAttendance(true)} />{/if}

	{#if attendanceState.data}
		<section class="summary-strip" aria-label="Attendance summary">
			<div><span>Recorded days</span><strong>{daysRecorded}</strong></div>
			<div><span>Absences</span><strong class="risk">{absences}</strong></div>
			<div><span>Tardies</span><strong class="watch">{tardies}</strong></div>
			<div class="focus-readout"><span>Current focus</span><strong>{focusLabel}</strong>{#if rangeStart}<button type="button" onclick={clearRange}>Clear</button>{/if}</div>
		</section>

		<section class="attendance-workspace" aria-label="Attendance calendar workspace">
			<div class="calendar-panel">
				<div class="calendar-panel__heading">
					<div><p class="eyebrow">Calendar</p><p>Pick a start and end date to narrow the record.</p></div>
					<div class="month-controls"><button type="button" aria-label="Previous month" onclick={() => changeMonth(-1)}><ChevronLeftIcon class="size-4" /></button><h2 id="attendance-month">{monthFormatter.format(currentMonth)}</h2><button type="button" aria-label="Next month" onclick={() => changeMonth(1)}><ChevronRightIcon class="size-4" /></button></div>
				</div>
				<div class="weekdays" aria-hidden="true">{#each weekdayNames as weekday (weekday)}<span>{weekday}</span>{/each}</div>
				<div class="calendar-grid">
					{#each calendarDays as day (day.key)}
						{#if day.date}{@const records = recordsForDate(day.date)}{@const key = day.key}<button type="button" class:recorded={records.length > 0} class:selected={isSelected(key)} class:in-range={isInRange(key)} class:range-start={key === rangeStart} class:range-end={key === rangeEnd} class="calendar-day" aria-pressed={isSelected(key) || isInRange(key)} aria-label={`${longDateFormatter.format(day.date)}${records.length ? `, ${records.length} attendance ${records.length === 1 ? 'record' : 'records'}` : ''}`} onclick={() => chooseDate(day.date)}><time datetime={key} class:today={isToday(day.date)}>{day.date.getDate()}</time>{#if records.length}<span class="marker {statusTone(primaryType(records))}"></span>{/if}</button>{:else}<span class="calendar-blank"></span>{/if}
					{/each}
				</div>
				<div class="legend" aria-label="Attendance status legend"><span class="success">Present</span><span class="accent">Excused</span><span class="watch">Tardy</span><span class="risk">Absent</span></div>
			</div>
			<aside class="guide-panel"><p class="eyebrow">How it works</p><ol><li><span>1</span><p>Choose a date to see that day’s record.</p></li><li><span>2</span><p>Choose another date to create a range.</p></li><li><span>3</span><p>Open an entry to see affected periods.</p></li></ol><p class="guide-note">Calendar marks show dates with a recorded attendance event.</p></aside>
		</section>

		<section class="records-panel" aria-labelledby="record-detail-title">
			<div class="records-panel__heading"><div><p class="eyebrow">Record detail</p><h2 id="record-detail-title">{rangeStart ? 'Focused records' : 'All recorded days'}</h2></div><span>{filteredRows.length} {filteredRows.length === 1 ? 'entry' : 'entries'}</span></div>
			{#if filteredRows.length}
				<div class="record-list">{#each filteredRows as record, index (`${record.date}-${record.type}-${index}`)}{@const recordKey = `${record.date}-${record.type}-${index}`}<article class:open={expandedRecord === recordKey}><button type="button" class="record-trigger" aria-expanded={expandedRecord === recordKey} onclick={() => expandedRecord = expandedRecord === recordKey ? undefined : recordKey}><time datetime={record.date}>{#if record.dateObject}<span>{shortDateFormatter.format(record.dateObject)}</span><strong>{record.dateObject.getFullYear()}</strong>{:else}<strong>{record.date}</strong>{/if}</time><span class="record-summary"><strong>{record.note || record.reason || record.type}</strong><span>{record.periods.length ? `${record.periods.length} affected ${record.periods.length === 1 ? 'period' : 'periods'}` : 'Day record'}</span></span><span class="type-badge {statusTone(record.type)}">{record.type}</span><span class:rotated={expandedRecord === recordKey} class="chevron"><ChevronDownIcon class="size-4" /></span></button>{#if expandedRecord === recordKey}<div class="record-detail">{#if record.periods.length}{#each record.periods as period (`${recordKey}-${period._Number}`)}<div><strong>{period._Course || `Period ${period._Number}`}</strong><p>{period._Reason || period._Name || 'No reason provided'}</p></div>{/each}{:else}<p>{record.reason || 'No additional period detail was provided.'}</p>{/if}</div>{/if}</article>{/each}</div>
			{:else}<div class="empty-state"><CalendarDaysIcon class="size-6" /><strong>No records in this range.</strong><p>Choose another date or clear the current focus to see every recorded day.</p><button type="button" onclick={clearRange}>Show all records</button></div>{/if}
		</section>
	{/if}
</AppPageShell>

<style>
	/* Hallmark · genre: playful · macrostructure: Workbench · tone: practical · anchor hue: Grademaxxing semantic status tokens */
	.attendance-heading { display: flex; align-items: end; justify-content: space-between; gap: var(--space-md); margin-bottom: var(--space-xl); }
	.eyebrow { display: flex; align-items: center; gap: var(--space-xs); margin: 0; color: var(--primary); font-family: var(--font-technical); font-size: 0.7rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
	h1, h2 { font-family: var(--font-heading); color: var(--foreground); letter-spacing: -0.04em; }
	h1 { margin: var(--space-xs) 0; font-size: clamp(2rem, 4vw, 2.7rem); line-height: 1.05; } h2 { margin: var(--space-xs) 0 0; font-size: 1.45rem; }
	.lede { margin: 0; color: var(--muted-foreground); line-height: 1.6; }
	button { cursor: pointer; } button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
	.action-button, .focus-readout button, .empty-state button { min-height: 2.5rem; border: 1px solid var(--border); border-radius: 999px; background: var(--card); color: var(--foreground); padding-inline: var(--space-md); font-weight: 600; white-space: nowrap; }.action-button:disabled { cursor: not-allowed; opacity: 0.55; }
	.summary-strip { display: grid; overflow: hidden; margin-bottom: var(--space-xl); border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); }.summary-strip > div { min-width: 0; padding: var(--space-md); border-bottom: 1px solid var(--border); }.summary-strip span { display: block; color: var(--muted-foreground); font-size: 0.78rem; }.summary-strip strong { display: block; margin-top: var(--space-xs); font-family: var(--font-technical); font-size: 1.6rem; }.risk { color: var(--grade-risk); }.watch { color: var(--grade-watch); }.success { color: var(--grade-strong); }.accent { color: var(--primary); }.focus-readout { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-xs); }.focus-readout > span { width: 100%; }.focus-readout strong { min-width: 0; overflow-wrap: anywhere; font-family: var(--font-body); font-size: 0.95rem; }.focus-readout button { min-height: 2rem; color: var(--muted-foreground); font-size: 0.8rem; }
	.attendance-workspace { display: grid; gap: var(--space-md); }.calendar-panel, .guide-panel, .records-panel { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--card); }.calendar-panel { min-width: 0; padding: var(--space-lg); }.calendar-panel__heading { display: flex; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: var(--space-md); margin-bottom: var(--space-lg); }.calendar-panel__heading > div > p:last-child { margin: var(--space-xs) 0 0; color: var(--muted-foreground); font-size: 0.875rem; }.month-controls { display: flex; align-items: center; gap: var(--space-xs); }.month-controls button { display: grid; width: 2.5rem; height: 2.5rem; place-items: center; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--secondary); color: var(--foreground); }.month-controls h2 { min-width: 10rem; margin: 0; font-size: 1rem; text-align: center; }.weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 0.25rem; }.weekdays { margin-bottom: var(--space-xs); }.weekdays span { color: var(--muted-foreground); font-family: var(--font-technical); font-size: 0.67rem; text-align: center; text-transform: uppercase; }.calendar-day, .calendar-blank { position: relative; display: grid; min-width: 0; min-height: 2.75rem; place-items: center; border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--muted-foreground); }.calendar-day.recorded { color: var(--foreground); font-weight: 700; }.calendar-day.in-range { border-radius: 0; background: var(--accent); }.calendar-day.selected { background: var(--primary); color: var(--primary-foreground); }.calendar-day.range-start { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }.calendar-day.range-end { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }.calendar-day time { display: grid; width: 1.85rem; height: 1.85rem; place-items: center; border-radius: 999px; font-size: 0.85rem; }.calendar-day time.today { border: 1px solid var(--border); color: var(--foreground); }.calendar-day.selected time.today { border-color: color-mix(in srgb, var(--primary-foreground) 55%, transparent); color: inherit; }.marker { position: absolute; bottom: 0.33rem; width: 0.28rem; height: 0.28rem; border-radius: 999px; background: currentColor; }.calendar-day.selected .marker { background: var(--primary-foreground); }.legend { display: flex; flex-wrap: wrap; gap: var(--space-sm); margin-top: var(--space-lg); padding-top: var(--space-md); border-top: 1px solid var(--border); }.legend span { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.78rem; }.legend span::before { width: 0.4rem; height: 0.4rem; border-radius: 999px; background: currentColor; content: ''; }
	.guide-panel { display: flex; flex-direction: column; padding: var(--space-lg); }.guide-panel ol { display: grid; gap: var(--space-md); margin: var(--space-lg) 0 auto; padding: 0; list-style: none; }.guide-panel li { display: flex; gap: var(--space-sm); }.guide-panel li > span { display: grid; width: 1.45rem; height: 1.45rem; flex: 0 0 auto; place-items: center; border: 1px solid var(--border); border-radius: 999px; color: var(--muted-foreground); font-family: var(--font-technical); font-size: 0.7rem; }.guide-panel li p { margin: 0.1rem 0 0; color: var(--muted-foreground); font-size: 0.875rem; line-height: 1.5; }.guide-note { margin: var(--space-lg) 0 0; padding-top: var(--space-md); border-top: 1px solid var(--border); color: var(--muted-foreground); font-size: 0.78rem; line-height: 1.5; }
	.records-panel { overflow: hidden; margin-top: var(--space-md); }.records-panel__heading { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: var(--space-md); padding: var(--space-lg); border-bottom: 1px solid var(--border); }.records-panel__heading > span { border: 1px solid var(--border); border-radius: 999px; color: var(--muted-foreground); padding: 0.3rem 0.6rem; font-family: var(--font-technical); font-size: 0.72rem; white-space: nowrap; }.record-list { display: grid; }.record-list article { border-bottom: 1px solid var(--border); }.record-list article:last-child { border-bottom: 0; }.record-trigger { display: grid; width: 100%; grid-template-columns: minmax(4.2rem, 0.6fr) minmax(0, 2fr) auto 1rem; align-items: center; gap: var(--space-sm); border: 0; background: transparent; color: var(--foreground); padding: var(--space-md) var(--space-lg); text-align: left; }.record-trigger time { display: grid; gap: 0.1rem; }.record-trigger time span, .record-summary > span { color: var(--muted-foreground); font-size: 0.75rem; }.record-trigger time strong, .record-summary > strong { overflow: hidden; font-size: 0.88rem; text-overflow: ellipsis; white-space: nowrap; }.record-summary { display: grid; min-width: 0; gap: 0.2rem; }.type-badge { border-radius: 999px; padding: 0.28rem 0.55rem; font-size: 0.72rem; font-weight: 700; white-space: nowrap; }.type-badge.risk { background: var(--grade-risk-soft); }.type-badge.watch { background: var(--grade-watch-soft); }.type-badge.success { background: var(--grade-strong-soft); }.type-badge.accent { background: var(--accent); }.chevron { color: var(--muted-foreground); transition: transform 150ms ease-out; }.rotated { transform: rotate(180deg); }.record-detail { display: grid; gap: var(--space-sm); padding: 0 var(--space-lg) var(--space-lg) calc(var(--space-lg) + 4.2rem); }.record-detail > div { display: grid; gap: var(--space-xs); border-left: 2px solid var(--border); background: var(--secondary); padding: var(--space-sm); }.record-detail strong { font-size: 0.82rem; }.record-detail p { margin: 0; color: var(--muted-foreground); font-size: 0.82rem; line-height: 1.5; }.empty-state { display: grid; justify-items: center; gap: var(--space-sm); padding: var(--space-2xl) var(--space-lg); color: var(--muted-foreground); text-align: center; }.empty-state strong { color: var(--foreground); }.empty-state p { max-width: 30rem; margin: 0; font-size: 0.875rem; line-height: 1.5; }
	@media (min-width: 40rem) { .summary-strip { grid-template-columns: repeat(3, minmax(0, 1fr)); }.summary-strip > div { border-right: 1px solid var(--border); border-bottom: 0; }.focus-readout { grid-column: 1 / -1; border-top: 1px solid var(--border); }.calendar-day, .calendar-blank { min-height: 3.6rem; } }
	@media (min-width: 64rem) { .summary-strip { grid-template-columns: repeat(3, minmax(0, 0.8fr)) minmax(16rem, 1.55fr); }.focus-readout { grid-column: auto; border-top: 0; border-right: 0 !important; }.attendance-workspace { grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.35fr); } }
	@media (max-width: 39.99rem) { .attendance-heading { align-items: start; flex-direction: column; }.action-button { width: 100%; }.month-controls { justify-content: space-between; width: 100%; }.month-controls h2 { flex: 1; }.record-trigger { grid-template-columns: minmax(3.8rem, 0.6fr) minmax(0, 1fr) 1rem; padding-inline: var(--space-md); }.type-badge { display: none; }.record-detail { padding-inline: var(--space-md); }.record-detail > div { grid-template-columns: 1fr; } }
	@media (hover: hover) { .calendar-day:hover, .record-trigger:hover { background: var(--secondary); }.calendar-day.selected:hover { background: var(--primary); }.action-button:hover, .month-controls button:hover { border-color: var(--primary); } }
	@media (prefers-reduced-motion: reduce) { .chevron { transition-duration: 150ms; } }
</style>
