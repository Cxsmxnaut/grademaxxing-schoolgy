import type { PortalFile } from './pxp2';

type AttendanceDay = {
	date: string;
	type: string;
	reason: string;
	holidayType?: string;
	pending?: boolean;
};

type AttendanceEvent = {
	date?: string;
	absence?: string;
	reason?: string;
};

type AttendanceCourse = {
	course: string;
	totals?: Record<string, number>;
	events: AttendanceEvent[];
};

type AttendancePeriod = {
	period: string;
	totals: Record<string, number>;
	events: AttendanceEvent[];
};

export type ModernAttendanceDetails = {
	days: AttendanceDay[];
	courses: AttendanceCourse[];
	periods?: AttendancePeriod[];
	schoolName?: string;
};

export function adaptAttendance(details: ModernAttendanceDetails) {
	const courseEvents = details.courses.flatMap((course) =>
		course.events.map((event) => ({ ...event, course: course.course, period: '' }))
	);
	const periodEvents = (details.periods ?? []).flatMap((period) =>
		period.events.map((event) => ({ ...event, course: '', period: period.period }))
	);
	// Course rows carry the clearest labels. Some districts expose only period rows,
	// so use those as a complete fallback instead of presenting an empty record.
	const authoritativeEvents = courseEvents.length > 0 ? courseEvents : periodEvents;
	const periodsByDate = new Map<string, Array<Record<string, string>>>();
	for (const event of authoritativeEvents) {
		if (!event.date) continue;
		const date = normalizedDate(event.date);
		if (!date) continue;
		const periods = periodsByDate.get(date) ?? [];
		periods.push({
			_Number: periodNumber(event.period),
			_Name: event.absence || event.reason || 'Attendance event',
			_Reason: event.reason ?? '',
			_Course: event.course,
			_Staff: '',
			_StaffEMail: '',
			_IconName: '',
			_SchoolName: details.schoolName ?? '',
			_StaffGU: '',
			_OrgYearGU: ''
		});
		periodsByDate.set(date, periods);
	}

	const descriptiveDays = new Map(
		details.days.filter(isAttendanceDay).flatMap((day) => {
			const date = normalizedDate(day.date);
			return date ? [[date, day] as const] : [];
		})
	);
	const dates = [...new Set([...descriptiveDays.keys(), ...periodsByDate.keys()])].sort();
	const totals = details.periods ?? [];

	return {
		Absences: {
			Absence: dates.map((date) => {
				const day = descriptiveDays.get(date);
				const periods = periodsByDate.get(date) ?? [];
				if (periods.length === 0 && day) {
					periods.push({
						_Number: '',
						_Name: day.type || day.reason || 'Attendance event',
						_Reason: day.reason,
						_Course: '',
						_Staff: '',
						_StaffEMail: '',
						_IconName: '',
						_SchoolName: details.schoolName ?? '',
						_StaffGU: '',
						_OrgYearGU: ''
					});
				}
				return {
					_AbsenceDate: date,
					_Reason: day?.reason ?? '',
					_Note: day?.reason ?? '',
					_DailyIconName: '',
					_CodeAllDayReasonType: '',
					_CodeAllDayDescription: '',
					Periods: { Period: periods }
				};
			})
		},
		CourseTotals: details.courses.map((course) => ({
			Course: course.course,
			Present: course.totals?.present ?? 0,
			Tardy: course.totals?.tardy ?? 0,
			Absent: course.totals?.absent ?? 0,
			Excused: course.totals?.excused ?? 0,
			Unexcused: course.totals?.unexcused ?? 0
		})),
		DailyRecords: details.days.filter(isDailyAttendanceRecord).flatMap((day) => {
			const date = normalizedDate(day.date);
			return date
				? [{ Date: date, Status: dailyAttendanceStatus(day), Reason: day.reason || 'Present' }]
				: [];
		}),
		TotalExcused: periodTotals(totals, 'excused'),
		TotalTardies: periodTotals(totals, 'tardy'),
		TotalUnexcused: periodTotals(totals, 'unexcused'),
		TotalActivities: {},
		TotalUnexcusedTardies: {},
		ConcurrentSchoolsLists: '',
		'xmlns:xsd': '',
		'xmlns:xsi': '',
		_Type: '',
		_StartPeriod: totals[0] ? periodNumber(totals[0].period) : '',
		_EndPeriod: totals.at(-1) ? periodNumber(totals.at(-1)!.period) : '',
		_PeriodCount: String(totals.length),
		_SchoolName: details.schoolName ?? ''
	};
}

export function adaptStudentInfo(info: {
	name: string;
	permId: string;
	grade: string;
	gender: string;
	photo?: PortalFile;
}) {
	return {
		FormattedName: info.name,
		PermID: optionalProfileNumber(info.permId),
		Grade: optionalProfileNumber(info.grade),
		Gender: info.gender,
		Photo: info.photo?.base64 ?? '',
		PhotoMimeType: info.photo?.mimeType ?? '',
		'xmlns:xsd': '',
		'xmlns:xsi': '',
		_Type: '',
		_ShowPhysicianAndDentistInfo: ''
	};
}

function isAttendanceDay(day: AttendanceDay) {
	// PXP2 numeric Type values describe ordinary calendar cells (school day,
	// weekend, today), and Pending marks future calendar dates rather than an
	// attendance incident. Reason also carries labels such as Holiday,
	// Non-School Day, and Present. Only absence/tardy-like status text is valid.
	const status = `${/^\d+$/.test(day.type.trim()) ? '' : day.type} ${day.reason}`;
	return /(?:absen|tard|excus|unexcus|truancy|late|illness|medical|court|field trip|school pass|wellness)/i.test(
		status
	);
}

function isDailyAttendanceRecord(day: AttendanceDay) {
	if (day.pending) return false;
	const reason = day.reason.trim();
	if (/^(?:holiday|non-school day)$/i.test(reason)) return false;
	// PXP2 is exception-based: completed ordinary school days use numeric type 11
	// with a blank reason, while weekends use type 4 and future school days also
	// arrive as type 11. A past/today type-11 cell with no incident is therefore
	// the portal's implicit present record. Incident rows still win in the adapter.
	if (!reason) return day.type.trim() === '11' && normalizedDate(day.date) <= localTodayIso();
	return reason.toLowerCase() === 'present' || isAttendanceDay(day);
}

function dailyAttendanceStatus(day: AttendanceDay) {
	if (!day.reason.trim() || /^present$/i.test(day.reason.trim())) return 'present';
	const status = `${day.type} ${day.reason}`;
	if (/(?:tard|late)/i.test(status)) return 'tardy';
	if (/(?:unexcus|unverified|truan)/i.test(status)) return 'unexcused';
	if (/(?:field trip|activity|school business|school pass)/i.test(status)) return 'activity';
	return 'excused';
}

function localTodayIso() {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}

function periodTotals(periods: AttendancePeriod[], key: string) {
	return {
		PeriodTotal: periods.map((period) => ({
			_Number: periodNumber(period.period),
			_Total: String(period.totals[key] ?? 0)
		}))
	};
}

function periodNumber(value: string) {
	return value.match(/\d+/)?.[0] ?? value.trim();
}

function normalizedDate(value: string) {
	const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (iso)
		return `${iso[1]}-${String(Number(iso[2])).padStart(2, '0')}-${String(Number(iso[3])).padStart(2, '0')}`;
	const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
	if (mdy)
		return `${mdy[3]}-${String(Number(mdy[1])).padStart(2, '0')}-${String(Number(mdy[2])).padStart(2, '0')}`;
	return '';
}

function optionalProfileNumber(value: string) {
	if (!value.trim()) return null;
	const number = Number(value);
	return Number.isFinite(number) && number >= 0 ? number : null;
}
