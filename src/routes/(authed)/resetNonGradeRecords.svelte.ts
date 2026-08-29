import { resetAttendance } from './attendance/attendance.svelte';
import { resetDocuments } from './documents/documents.svelte';
import { resetMailData } from './mail/mailData.svelte';
import { resetStudentInfo } from './studentinfo/studentInfo.svelte';

export function resetNonGradeRecords() {
	resetAttendance();
	resetDocuments();
	resetMailData();
	resetStudentInfo();
}
