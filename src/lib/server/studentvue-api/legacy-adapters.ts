export function adaptDocuments(
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
export function adaptMessages(records: Array<Record<string, unknown>>) {
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
