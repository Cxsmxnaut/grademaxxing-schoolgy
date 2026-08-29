import { LocalStorageKey } from '$lib';
import { StudentAccount } from '$lib/synergy';

export const acc: { studentAccount?: StudentAccount } = $state({});

export const loadStudentAccount = () => {
	try {
		const token = localStorage.getItem(LocalStorageKey.token);
		if (token === null) return;
		const value = JSON.parse(token) as Record<string, unknown>;
		if (
			typeof value.username !== 'string' ||
			typeof value.domain !== 'string' ||
			typeof value.sessionId !== 'string' ||
			!value.username ||
			!value.domain ||
			!value.sessionId
		) {
			throw new Error('Invalid local session metadata.');
		}
		acc.studentAccount = new StudentAccount(value.domain, value.username, '', value.sessionId);
	} catch {
		try {
			localStorage.removeItem(LocalStorageKey.token);
		} catch {
			// The caller will remain signed out when managed browser policy disables storage.
		}
		acc.studentAccount = undefined;
	}
};
