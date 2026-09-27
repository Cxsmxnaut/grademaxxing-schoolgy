import { acc } from '$lib/account.svelte';
import type { Schedule } from '$lib/contracts/studentvue/schedule';
import type { SchoolInfo } from '$lib/contracts/studentvue/school-info';
import type { StudentInfo, StudentProfileFields } from '$lib/contracts/studentvue/student-info';
import { LocalStorageKey } from '$lib/storage/keys';
import { invalidateRecordState, loadRecord, type RecordState } from '$lib/storage/record-state';

export const studentInfoState: RecordState<StudentInfo> = $state({ loaded: false });
export const studentProfileFieldsState: RecordState<StudentProfileFields> = $state({
	loaded: false
});
export const scheduleState: RecordState<Schedule> = $state({ loaded: false });
export const schoolInfoState: RecordState<SchoolInfo> = $state({ loaded: false });

const resetRecord = <T>(recordState: RecordState<T>) => {
	invalidateRecordState(recordState);
	recordState.data = undefined;
	recordState.loaded = false;
	recordState.refreshing = false;
	recordState.error = undefined;
	recordState.lastRefresh = undefined;
};

export const resetStudentInfo = () => {
	resetRecord(studentInfoState);
	resetRecord(studentProfileFieldsState);
	resetRecord(scheduleState);
	resetRecord(schoolInfoState);
};

export const loadStudentInfo = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		studentInfoState,
		() => studentAccount.studentInfo(),
		LocalStorageKey.studentInfo,
		1000 * 60 * 60 * 24 * 30,
		forceRefresh
	);
};

// PXP2_Student.aspx exposes district-specific profile fields in addition to the
// universal name/ID/grade set. The response omits `fields` when a district
// provides none, and the fallback response is an empty object, so failures here
// must never surface as a page error.
export const loadStudentProfileFields = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		studentProfileFieldsState,
		async () => {
			const profile = await studentAccount.studentProfile();
			return profile.fields ?? {};
		},
		LocalStorageKey.studentInfo,
		1000 * 60 * 60 * 24 * 30,
		forceRefresh
	);
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

export const loadSchoolInfo = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		schoolInfoState,
		() => studentAccount.schoolInfo(),
		LocalStorageKey.schoolInfo,
		1000 * 60 * 60 * 24 * 30,
		forceRefresh
	);
};
