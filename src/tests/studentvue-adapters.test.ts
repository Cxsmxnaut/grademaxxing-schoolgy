import { adaptAttendance, adaptStudentInfo } from '$lib/server/studentvue-adapters';
import { expect, test } from 'vitest';

test('numeric PXP2 calendar day types are not fabricated into absences', () => {
	const attendance = adaptAttendance({
		days: [
			{ date: '2026-08-13', type: '11', reason: '', pending: false },
			{ date: '2026-08-14', type: '4', reason: '', pending: false },
			{ date: '2026-08-15', type: '4', reason: 'Non-School Day', pending: false },
			{ date: '2026-08-16', type: '4', reason: 'Holiday', pending: false },
			{ date: '2026-08-17', type: '5', reason: 'Present', pending: false },
			{ date: '2026-09-14', type: '11', reason: '', pending: true }
		],
		courses: [],
		periods: [],
		schoolName: 'Example High School'
	});

	expect(attendance.Absences.Absence).toEqual([]);
	expect(attendance.DailyRecords).toEqual([
		{ Date: '2026-08-13', Status: 'present', Reason: 'Present' },
		{ Date: '2026-08-17', Status: 'present', Reason: 'Present' }
	]);
});

test('period attendance is used when course-level events are unavailable', () => {
	const attendance = adaptAttendance({
		days: [{ date: '2026-08-28', type: '11', reason: '', pending: false }],
		courses: [{ course: 'Biology', events: [] }],
		periods: [
			{
				period: 'Period 2',
				totals: { tardy: 0, absent: 1, excused: 1, unexcused: 0 },
				events: [{ date: '8/28/2026', absence: 'Absent', reason: 'Excused' }]
			}
		],
		schoolName: 'Example High School'
	});

	expect(attendance.Absences.Absence).toHaveLength(1);
	expect(attendance.Absences.Absence[0]).toMatchObject({
		_AbsenceDate: '2026-08-28',
		Periods: {
			Period: [{ _Number: '2', _Name: 'Absent', _Reason: 'Excused' }]
		}
	});
	expect(attendance.TotalExcused.PeriodTotal).toEqual([{ _Number: '2', _Total: '1' }]);
});

test('modern per-course attendance totals survive the legacy adapter', () => {
	const attendance = adaptAttendance({
		days: [],
		courses: [
			{
				course: 'Biology',
				totals: { present: 10, tardy: 1, absent: 2, excused: 1, unexcused: 1 },
				events: []
			}
		],
		periods: []
	});

	expect(attendance.CourseTotals).toEqual([
		{
			Course: 'Biology',
			Present: 10,
			Tardy: 1,
			Absent: 2,
			Excused: 1,
			Unexcused: 1
		}
	]);
});

test('student portraits and identifiers survive the modern-to-legacy adapter', () => {
	const profile = adaptStudentInfo({
		name: 'Student Example',
		permId: '123456',
		grade: '11',
		gender: 'X',
		photo: { base64: 'cGljdHVyZQ==', mimeType: 'image/png', fileName: 'Photo.PNG' }
	});

	expect(profile).toMatchObject({
		FormattedName: 'Student Example',
		PermID: 123456,
		Grade: 11,
		Photo: 'cGljdHVyZQ==',
		PhotoMimeType: 'image/png'
	});
});
