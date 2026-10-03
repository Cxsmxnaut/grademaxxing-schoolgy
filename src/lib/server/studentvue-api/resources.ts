export const resources = [
	'capabilities',
	'gradebook',
	'attendance',
	'attendance-details',
	'calendar',
	'student-info',
	'student-profile',
	'documents',
	'document',
	'report-cards',
	'schedule',
	'school-info',
	'messages',
	'mailbox',
	'message',
	'attachment'
] as const;
export type Resource = (typeof resources)[number];

export const capabilities = {
	version: 1,
	transport: 'HTTPS JSON',
	authentication: 'server-side StudentVUE session cookie',
	readOnly: true,
	resources: {
		gradebook: {
			path: '/api/studentvue/gradebook?reportPeriod=0',
			parameters: {
				reportPeriod: 'zero-based index from ReportingPeriods',
				summary: 'optional true: fast header-only response; falls back to complete data if unsafe',
				fresh:
					'optional true: reload portal context and complete assignment details; overrides summary'
			},
			legacySoap: 'Gradebook',
			modernSource: [
				'PXP.GBFocusData',
				'Gradebook_SchoolClasses',
				'GradebookFocusClassInfo',
				'Gradebook_ClassDetails',
				'pxp.course.content.items/LoadWithOptions',
				'pxp.course.grade.card/get',
				'genericdata.classdata/GetClassData',
				'Gradebook_AssignmentDetails'
			]
		},
		attendance: {
			path: '/api/studentvue/attendance',
			legacySoap: 'Attendance',
			modernSource: 'PXP.StudentAttendanceData'
		},
		attendanceDetails: {
			path: '/api/studentvue/attendance-details',
			modernSource: 'PXP.StudentAttendanceData'
		},
		calendar: {
			path: '/api/studentvue/calendar?month=8&year=2026',
			modernSource: 'PXP.CalendarData'
		},
		studentInfo: {
			path: '/api/studentvue/student-info',
			legacySoap: 'StudentInfo',
			modernSource: 'PXP2_Student.aspx'
		},
		studentProfile: { path: '/api/studentvue/student-profile', modernSource: 'PXP2_Student.aspx' },
		documents: {
			path: '/api/studentvue/documents',
			legacySoap: 'GetStudentDocumentInitialData',
			modernSource: 'PXP2_Documents.aspx'
		},
		document: {
			path: '/api/studentvue/document?id=...',
			legacySoap: 'GetReportCardDocumentData',
			modernSource: 'PXP_ShowDocument.aspx'
		},
		reportCards: {
			path: '/api/studentvue/report-cards',
			modernSource: ['PXP.GradesData', 'PXP2_Documents.aspx']
		},
		schedule: { path: '/api/studentvue/schedule', modernSource: 'PXP.TodayContent' },
		schoolInfo: {
			path: '/api/studentvue/school-info',
			modernSource: 'PXP2_SchoolInformation.aspx'
		},
		messages: {
			path: '/api/studentvue/messages',
			legacySoap: 'SynergyMailGetData',
			modernSource: 'ST.Messaging/GetMessages'
		},
		mailbox: {
			path: '/api/studentvue/mailbox',
			modernSource: ['ST.Messaging/GetFolders', 'ST.Messaging/GetMessages']
		},
		message: { path: '/api/studentvue/message?id=...', modernSource: 'ST.Messaging/GetMessage' },
		attachment: {
			path: '/api/studentvue/attachment?id=...',
			legacySoap: 'SynergyMailGetAttachment',
			modernSource: 'FileDownload.aspx'
		}
	},
	retired: {
		GenerateAuthToken:
			'No data operation depended on it; it only opened the old messages page in a second browser session. Native ST.Messaging JSON calls replace that workflow.'
	}
} as const;
