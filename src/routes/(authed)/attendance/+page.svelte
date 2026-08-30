<script lang="ts">
	import { fullDateFormatter, removeCourseType } from '$lib';
	import { brand } from '$lib/brand';
	import LoadingBanner from '$lib/components/LoadingBanner.svelte';
	import RecordLoadFailure from '$lib/components/RecordLoadFailure.svelte';
	import RefreshIndicator from '$lib/components/RefreshIndicator.svelte';
	import * as Accordion from '$lib/components/ui/accordion';
	import { Alert } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import type { Period } from '$lib/types/Attendance';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import { attendanceState, loadAttendance } from './attendance.svelte';

	loadAttendance();

	const excusedReasonRegex =
		/Field Trip|School Pass|Excused|Medical\/Dent|Comp Ed\/Court-Religi|Illness or Sickness|SB14 Wellness\/Illnes|Med. all day\/period/;

	function getAbsenceType(periods: Period[]) {
		const reasons = periods.map((period: Period) => period._Name);

		if (reasons.some((reason) => reason === 'Absent' || reason === 'Non ADA')) return 'Absent';

		if (reasons.some((reason) => /Tardy/.test(reason))) return 'Tardy';

		if (reasons.some((reason) => excusedReasonRegex.test(reason))) return 'Excused';

		if (reasons.some((reason) => reason === 'Present')) return 'Present';

		return 'Unknown';
	}

	function getAbsenceColor(absenceType: string) {
		switch (absenceType) {
			case 'Absent':
				return 'red';
			case 'Tardy':
				return 'yellow';
			case 'Excused':
			case 'Present':
				return 'sky';
			default:
				return 'orange';
		}
	}

	function getDailyType(status: string, reason: string) {
		const value = `${status} ${reason}`;
		if (/present/i.test(value)) return 'Present';
		if (/tardy|late/i.test(value)) return 'Tardy';
		if (/absent|unexcused|unverified|truan/i.test(value)) return 'Absent';
		if (/excused|field trip|activity|school business|school pass/i.test(value)) return 'Excused';
		return status || reason || 'Unknown';
	}

	function attendanceDate(value: string) {
		const date = new Date(value);
		return value && !Number.isNaN(date.getTime())
			? fullDateFormatter.format(date)
			: 'Date unavailable';
	}

	const attendanceRows = $derived.by(() => {
		const absences = attendanceState.data?.Absences.Absence ?? [];
		const incidentDates = new Set(absences.map((absence) => absence._AbsenceDate));
		return [
			...absences.map((absence) => ({
				date: absence._AbsenceDate,
				note: absence._Note || absence._Reason,
				type: getAbsenceType(absence.Periods.Period ?? []),
				periods: absence.Periods.Period ?? [],
				reason: absence._Reason
			})),
			...(attendanceState.data?.DailyRecords ?? [])
				.filter((record) => !incidentDates.has(record.Date))
				.map((record) => ({
					date: record.Date,
					note: record.Reason,
					type: getDailyType(record.Status, record.Reason),
					periods: [] as Period[],
					reason: record.Reason || record.Status
				}))
		].toSorted((a, b) => b.date.localeCompare(a.date));
	});
</script>

<svelte:head>
	<title>Attendance - {brand}</title>
</svelte:head>

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
	<div class="mx-2 mt-8 md:mx-4">
		{#if attendanceRows.length > 0}
			<Accordion.Root type="single" class="mx-auto max-w-2xl">
				{#each attendanceRows as record (`${record.date}-${record.type}`)}
					<Accordion.Item>
						<Accordion.Trigger>
							{attendanceDate(record.date)}{#if record.note}
								: {record.note}
							{/if}

							<Badge color={getAbsenceColor(record.type)} class="ml-auto">{record.type}</Badge>
						</Accordion.Trigger>

						<Accordion.Content>
							{#if record.periods.length > 0}
								<ol class="text-muted-foreground space-y-2">
									{#each record.periods.filter((course) => course._Name) as period (`${period._Number}-${period._Course}`)}
										<li>{removeCourseType(period._Course)}: {period._Name}</li>
									{/each}
								</ol>
							{:else}
								<p class="text-muted-foreground">{record.reason || record.type}</p>
							{/if}
						</Accordion.Content>
					</Accordion.Item>
				{/each}
			</Accordion.Root>
		{:else}
			<Alert class="mx-auto w-fit">
				<CircleCheckIcon /> Looks like you haven't had any attendance events yet.
			</Alert>
		{/if}
	</div>
{/if}
