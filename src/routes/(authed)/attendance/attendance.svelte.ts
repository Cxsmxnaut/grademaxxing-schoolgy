import { acc } from '$lib/account.svelte';
import type { Attendance } from '$lib/contracts/studentvue/attendance';
import { LocalStorageKey } from '$lib/storage/keys';
import { invalidateRecordState, loadRecord, type RecordState } from '$lib/storage/record-state';

export const attendanceState: RecordState<Attendance> = $state({ loaded: false });

export const resetAttendance = () => {
	invalidateRecordState(attendanceState);
	attendanceState.data = undefined;
	attendanceState.loaded = false;
	attendanceState.refreshing = false;
	attendanceState.error = undefined;
	attendanceState.lastRefresh = undefined;
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
