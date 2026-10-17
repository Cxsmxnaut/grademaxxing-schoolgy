import type { Period } from '$lib/contracts/studentvue/attendance';

export type AttendanceType = 'Absent' | 'Tardy' | 'Excused' | 'Present' | 'Unknown';
const excusedReasonRegex =
	/Field Trip|School Pass|Excused|Medical\/Dent|Comp Ed\/Court-Religi|Illness or Sickness|SB14 Wellness\/Illnes|Med. all day\/period/i;

export function getAbsenceType(periods: Period[]): AttendanceType {
	const reasons = periods.map((period) => period._Name);
	if (reasons.some((reason) => reason === 'Absent' || reason === 'Non ADA')) return 'Absent';
	if (reasons.some((reason) => /Tardy/i.test(reason))) return 'Tardy';
	if (reasons.some((reason) => excusedReasonRegex.test(reason))) return 'Excused';
	if (reasons.some((reason) => reason === 'Present')) return 'Present';
	return 'Unknown';
}

export function getDailyType(status: string, reason: string): AttendanceType {
	const value = `${status} ${reason}`;
	if (/present/i.test(value)) return 'Present';
	if (/tardy|late/i.test(value)) return 'Tardy';
	if (/absent|unexcused|unverified|truan/i.test(value)) return 'Absent';
	if (/excused|field trip|activity|school business|school pass/i.test(value)) return 'Excused';
	return 'Unknown';
}
