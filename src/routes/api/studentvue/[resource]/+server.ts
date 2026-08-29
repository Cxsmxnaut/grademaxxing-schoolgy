import { gradebookXml } from '$lib/server/gradebook-adapter';
import { Pxp2InputError, Pxp2SessionExpiredError, Pxp2TimeoutError } from '$lib/server/pxp2';
import {
	clientSessionHeader,
	deleteStudentSession,
	getStudentSession,
	requireStudentSessionContext,
	runStudentOperation,
	sessionCookie,
	StudentOperationAbortedError,
	StudentServiceBusyError,
	StudentSessionBusyError
} from '$lib/server/student-session';
import { adaptAttendance, adaptStudentInfo } from '$lib/server/studentvue-adapters';
import { error, isHttpError, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const resources = [
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
type Resource = (typeof resources)[number];

export const GET: RequestHandler = async ({ params, cookies, request, url }) => {
	if (!resources.includes(params.resource as Resource))
		throw error(404, 'Unknown StudentVUE API resource.');
	let session: ReturnType<typeof getStudentSession>;
	try {
		session = getStudentSession(cookies.get(sessionCookie));
		requireStudentSessionContext(session, request.headers.get(clientSessionHeader));
	} catch (cause) {
		throw error(401, cause instanceof Error ? cause.message : 'Sign in to StudentVUE first.');
	}
	try {
		return await runStudentOperation(
			session,
			async () => {
				switch (params.resource as Resource) {
					case 'capabilities':
						return json(capabilities);
					case 'gradebook': {
						const reportPeriod = optionalInteger(
							url.searchParams.get('reportPeriod'),
							0,
							999,
							'reportPeriod'
						);
						return json({ xml: gradebookXml(await session.client.gradebook(reportPeriod)) });
					}
					case 'attendance':
						return json(adaptAttendance(await session.client.attendanceDetails()));
					case 'attendance-details':
						return json(await session.client.attendanceDetails());
					case 'calendar': {
						const month = optionalInteger(url.searchParams.get('month'), 1, 12, 'month');
						const year = optionalInteger(url.searchParams.get('year'), 2000, 2200, 'year');
						if ((month === undefined) !== (year === undefined))
							throw error(400, 'month and year must be supplied together.');
						return json(await session.client.calendar(month, year));
					}
					case 'student-info':
						return json(adaptStudentInfo(await session.client.studentInfo()));
					case 'student-profile':
						return json(await session.client.studentInfo());
					case 'documents':
						return json(adaptDocuments(await session.client.documents()));
					case 'document': {
						const id = url.searchParams.get('id');
						if (!id) throw error(400, 'A document identifier is required.');
						const file = await session.client.document(id);
						return json({
							Base64Code: file.base64,
							_DocumentGU: id,
							_FileName: file.fileName,
							_DocFileName: file.fileName,
							_DocType: file.mimeType
						});
					}
					case 'report-cards':
						return json(await session.client.reportCards());
					case 'schedule':
						return json(await session.client.schedule());
					case 'school-info':
						return json(await session.client.schoolInfo());
					case 'messages':
						return json(adaptMessages(await session.client.messages()));
					case 'mailbox':
						return json(await session.client.mailbox());
					case 'message': {
						const id = url.searchParams.get('id');
						if (!id) throw error(400, 'A message identifier is required.');
						const detail = await session.client.messageDetails(
							id,
							url.searchParams.get('system') === 'true'
						);
						return json(
							url.searchParams.get('legacy') === 'true'
								? adaptMessages([detail]).InboxItemListings.MessageXML[0]
								: detail
						);
					}
					case 'attachment': {
						const id = url.searchParams.get('id');
						if (!id) throw error(400, 'An attachment identifier is required.');
						const file = await session.client.attachment(id);
						return json({
							Base64Code: file.base64,
							_SmAttachmentGU: id,
							_DocumentName: file.fileName,
							_MimeType: file.mimeType
						});
					}
				}
				throw error(404, 'Unknown StudentVUE API resource.');
			},
			request.signal
		);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;
		if (cause instanceof StudentOperationAbortedError) throw error(499, cause.message);
		if (cause instanceof StudentSessionBusyError) throw error(429, cause.message);
		if (cause instanceof StudentServiceBusyError) throw error(503, cause.message);
		if (cause instanceof Pxp2InputError) throw error(400, cause.message);
		if (cause instanceof Pxp2SessionExpiredError) {
			deleteStudentSession(cookies.get(sessionCookie));
			cookies.delete(sessionCookie, { path: '/' });
			throw error(401, cause.message);
		}
		if (cause instanceof Pxp2TimeoutError) throw error(504, cause.message);
		throw error(502, cause instanceof Error ? cause.message : 'StudentVUE request failed.');
	}
};

const capabilities = {
	version: 1,
	transport: 'HTTPS JSON',
	authentication: 'server-side StudentVUE session cookie',
	readOnly: true,
	resources: {
		gradebook: {
			path: '/api/studentvue/gradebook?reportPeriod=0',
			parameters: { reportPeriod: 'zero-based index from ReportingPeriods' },
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

function optionalInteger(value: string | null, minimum: number, maximum: number, label: string) {
	if (value === null) return undefined;
	if (!/^\d+$/.test(value)) throw error(400, `${label} must be an integer.`);
	const number = Number(value);
	if (number < minimum || number > maximum)
		throw error(400, `${label} is outside the supported range.`);
	return number;
}

function adaptDocuments(
	rows: Array<{ id: string; title: string; date: string; category: string }>
) {
	return {
		StudentDocumentDatas: {
			StudentDocumentData: rows.map((r) => ({
				_DocumentGU: r.id,
				_DocumentFileName: r.title,
				_DocumentDate: r.date,
				_DocumentType: r.category,
				_StudentGU: '',
				_DocumentComment: r.title
			}))
		},
		_xmlns_xsd: '',
		_xmlns_xsi: '',
		_showDateColumn: '',
		_showDocNameColumn: '',
		_showDocCatColumn: '',
		_StudentGU: '',
		_StudentSSY: ''
	};
}
function adaptMessages(records: Array<Record<string, unknown>>) {
	return {
		FolderListViews: { FolderListViewXML: [] },
		InboxItemListings: {
			MessageXML: records.map((m, i) => ({
				From: {
					RecipientXML: {
						_RecipientType: 'From',
						_RecipientList: 'Staff',
						_GroupUserTypes: '',
						_Details1: sender(m),
						_Details2: 'Staff',
						_ReadCount: '',
						_PersonCount: ''
					}
				},
				To: '',
				CC: '',
				BCC: '',
				Attachments: adaptAttachments(m.attachments),
				_SMMessageGU: String(m.messagePersonId ?? m.messageId ?? i),
				_SMMsgPersonGU: text(m.messagePersonId),
				_SendDateTime: text(m.sendDateTime),
				_Subject: text(m.subject),
				_MessageText: text(m.messageText),
				_FolderType: 'Inbox',
				_Priority: 'None',
				_IsItDraft: 'false',
				_MailRead: String(m.mailRead === true || String(m.mailRead).toLowerCase() === 'true'),
				_OriginalLanguageCode: '',
				_Translated: '',
				_SendDateTimeFormattedLong: text(m.sendDateTimeFormattedLong),
				_SendDateTimeFormattedShort: text(m.sendDateTimeFormattedShort),
				_ReadCount: String(m.readCount ?? ''),
				_PersonCount: String(m.personCount ?? ''),
				_UpdateContactLog: '',
				_TranslationComplete: '',
				_ContactCategory: 'ME',
				_AssociatedStudentGU: '',
				_IsMeeting: String(Boolean(m.isMeeting)),
				_VidConfGU: '',
				_MeetingStartDate: '',
				_Deleted: String(Boolean(m.deleted)),
				_NoReply: String(Boolean(m.noReply)),
				_EnforceSecurity: 'false',
				_MessageStatus: text(m.messageStatus),
				_MeetingEndDate: '',
				_CanJoinMeeting: String(Boolean(m.canJoinMeeting)),
				_MeetingDateString: '',
				_MeetingHost: '',
				_Recurrence: '',
				_RecurrenceText: text(m.recurrenceText),
				_IsSystemMessage: String(Boolean(m.isSystemMessage))
			}))
		},
		SentItemListings: { MessageXML: [] },
		DraftItemListings: { MessageXML: [] },
		ArchiveItemListings: '',
		OutboxItemListings: '',
		AllOtherFolderMessages: '',
		_xmlns_xsd: '',
		_xmlns_xsi: '',
		_PersonGU: '',
		_NewSignature: '',
		_ReplySignature: '',
		_EnableForwarding: '',
		_emailAddresses: '',
		_ParentRecipientAccessValue: '',
		_StudentRecipientAccessValue: '',
		_StaffRecipientAccessValue: '',
		_UserGroupsTabAllowed: '',
		_MassEmailTabAllowed: '',
		_StudentGroupsTabAllowed: '',
		_StaffTabAllowed: '',
		_ParentsTabAllowed: '',
		_StudentsTabAllowed: '',
		_TeachersTabAllowed: '',
		_CounselorsTabAllowed: '',
		_ShowBCC: '',
		_SynergyMailForwardingEnabled: '',
		_SM_CheckUnreadMessagesTimeout: '',
		_SM_MaxAttachmentSizeMB: '',
		_SM_JobTitleColumnVisible: '',
		_SM_TypeColumnVisible: '',
		_SM_ContactLogOption: '',
		_SM_SupportingClassesDropDown: '',
		_SM_SupportingMessageSubjectAsElement: ''
	};
}
function text(value: unknown) {
	return typeof value === 'string' ? value : '';
}
function sender(message: Record<string, unknown>) {
	const from = message.from;
	return from && typeof from === 'object'
		? text((from as Record<string, unknown>).contactDetails1)
		: '';
}
function adaptAttachments(value: unknown) {
	if (!Array.isArray(value)) return '';
	const items = value.flatMap((item) => {
		if (!item || typeof item !== 'object') return [];
		const attachment = item as Record<string, unknown>;
		const id = text(attachment.attachmentId);
		const name = text(attachment.name);
		return id && name ? [{ _SmAttachmentGU: id, _DocumentName: name }] : [];
	});
	return items.length ? { AttachmentXML: items } : '';
}
