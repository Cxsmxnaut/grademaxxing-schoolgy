import { invalidateRecordState, loadRecord, LocalStorageKey, type RecordState } from '$lib';
import { acc } from '$lib/account.svelte';
import type { Attendance } from '$lib/types/Attendance';

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
