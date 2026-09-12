export interface AttendanceResult {
	Attendance: Attendance;
}

export interface Attendance {
	Absences: Absences;
	CourseTotals?: AttendanceCourseTotal[];
	DailyRecords?: AttendanceDailyRecord[];
	TotalExcused: AttendanceEventTotal;
	TotalTardies: AttendanceEventTotal;
	TotalUnexcused: AttendanceEventTotal;
	TotalActivities: AttendanceEventTotal;
	TotalUnexcusedTardies: AttendanceEventTotal;
	ConcurrentSchoolsLists: string;
	'_xmlns:xsd': string;
	'_xmlns:xsi': string;
	_Type: string;
	_StartPeriod: string;
	_EndPeriod: string;
	_PeriodCount: string;
	_SchoolName: string;
}

export interface AttendanceDailyRecord {
	Date: string;
	Status: string;
	Reason: string;
}

export interface AttendanceCourseTotal {
	Course: string;
	Present: number;
	Tardy: number;
	Absent: number;
	Excused: number;
	Unexcused: number;
}

export interface Absences {
	Absence?: Absence[] | null;
}

export interface Absence {
	Periods: Periods;
	_AbsenceDate: string;
	_Reason: string;
	_Note: string;
	_DailyIconName: string;
	_CodeAllDayReasonType: string;
	_CodeAllDayDescription: string;
}

export interface Periods {
	Period?: Period[] | null;
}

export interface Period {
	_Number: string;
	_Name: string;
	_Reason: string;
	_Course: string;
	_Staff: string;
	_StaffEMail: string;
	_IconName: string;
	_SchoolName: string;
	_StaffGU: string;
	_OrgYearGU: string;
}

export interface AttendanceEventTotal {
	PeriodTotal?: PeriodTotal[] | null;
}

export interface PeriodTotal {
	_Number: string;
	_Total: string;
}
