import { acc } from '$lib/account.svelte';
import type { Attendance } from '$lib/contracts/studentvue/attendance';
import type { Schedule } from '$lib/contracts/studentvue/schedule';
import { LocalStorageKey } from '$lib/storage/keys';
import { invalidateRecordState, loadRecord, type RecordState } from '$lib/storage/record-state';

export const attendanceState: RecordState<Attendance> = $state({ loaded: false });
export const scheduleState: RecordState<Schedule> = $state({ loaded: false });

export const resetAttendance = () => {
	invalidateRecordState(attendanceState);
	attendanceState.data = undefined;
	attendanceState.loaded = false;
	attendanceState.refreshing = false;
	attendanceState.error = undefined;
	attendanceState.lastRefresh = undefined;
	invalidateRecordState(scheduleState);
	scheduleState.data = undefined;
	scheduleState.loaded = false;
	scheduleState.refreshing = false;
	scheduleState.error = undefined;
	scheduleState.lastRefresh = undefined;
};

export const loadSchedule = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		scheduleState,
		() => studentAccount.schedule(),
		LocalStorageKey.schedule,
		1000 * 60 * 30,
		forceRefresh
	);
};

export const loadAttendance = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		attendanceState,
		() => studentAccount.attendance(),
		LocalStorageKey.attendance,
		1000 * 60 * 60,
		forceRefresh
	);
};
