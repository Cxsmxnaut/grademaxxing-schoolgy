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

/**
 * District profile fields are rendered as text, so every value is coerced to a
 * string at the data boundary. Portal parsers and older caches can hand back
 * numbers or nulls, and a non-string would crash text presentation code.
 */
export const normalizeProfileFields = (value: unknown): StudentProfileFields => {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const fields: StudentProfileFields = {};
	for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
		if (entry === null || entry === undefined) continue;
		const text = typeof entry === 'string' ? entry : String(entry);
		if (text.trim()) fields[key] = text;
	}
	return fields;
};

// PXP2_Student.aspx exposes district-specific profile fields in addition to the
// universal name/ID/grade set. The response omits `fields` when a district
// provides none, and the fallback response is an empty object, so failures here
// must never surface as a page error. The fields cache uses its own storage key:
// the student-info cache stores PermID and Grade as JSON numbers, which are not
// valid profile-field values.
export const loadStudentProfileFields = async (forceRefresh = false) => {
	const { studentAccount } = acc;
	if (!studentAccount) return;

	await loadRecord(
		studentProfileFieldsState,
		async () => {
			const profile = await studentAccount.studentProfile();
			return normalizeProfileFields(profile.fields);
		},
		LocalStorageKey.studentProfile,
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
