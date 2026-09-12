import { adaptDocuments, adaptMessages } from '$lib/server/studentvue-api/legacy-adapters';
import { optionalInteger } from '$lib/server/studentvue-api/params';
import { capabilities, resources } from '$lib/server/studentvue-api/resources';
import { expect, test } from 'vitest';

test('publishes a unique, read-only resource inventory', () => {
	expect(new Set(resources).size).toBe(resources.length);
	expect(resources).toContain('capabilities');
	expect(resources).toContain('gradebook');
	expect(capabilities.readOnly).toBe(true);
	expect(capabilities.transport).toBe('HTTPS JSON');
});

test('accepts only optional integers inside the declared range', () => {
	expect(optionalInteger(null, 1, 12, 'month')).toBeUndefined();
	expect(optionalInteger('9', 1, 12, 'month')).toBe(9);
	expect(captureHttpError(() => optionalInteger('9.5', 1, 12, 'month'))).toMatchObject({
		status: 400,
		body: { message: 'month must be an integer.' }
	});
	expect(captureHttpError(() => optionalInteger('13', 1, 12, 'month'))).toMatchObject({
		status: 400,
		body: { message: 'month is outside the supported range.' }
	});
});

function captureHttpError(operation: () => unknown) {
	try {
		operation();
	} catch (cause) {
		return cause;
	}
	throw new Error('Expected the operation to throw.');
}

test('adapts document summaries without inventing student identifiers', () => {
	const result = adaptDocuments([
		{ id: 'opaque-document', title: 'Report', date: '9/1/2026', category: 'Report Card' }
	]);

	expect(result.StudentDocumentDatas.StudentDocumentData).toEqual([
		{
			_DocumentGU: 'opaque-document',
			_DocumentFileName: 'Report',
			_DocumentDate: '9/1/2026',
			_DocumentType: 'Report Card',
			_StudentGU: '',
			_DocumentComment: 'Report'
		}
	]);
});

test('adapts message and attachment summaries into the legacy read-only shape', () => {
	const result = adaptMessages([
		{
			messagePersonId: 'message-person',
			subject: 'Synthetic message',
			from: { contactDetails1: 'Teacher' },
			attachments: [{ attachmentId: 'attachment', name: 'Example.pdf' }]
		}
	]);
	const message = result.InboxItemListings.MessageXML[0];

	expect(message?._SMMsgPersonGU).toBe('message-person');
	expect(message?.From.RecipientXML._Details1).toBe('Teacher');
	expect(message?.Attachments).toEqual({
		AttachmentXML: [{ _SmAttachmentGU: 'attachment', _DocumentName: 'Example.pdf' }]
	});
	expect(result.SentItemListings.MessageXML).toEqual([]);
});
