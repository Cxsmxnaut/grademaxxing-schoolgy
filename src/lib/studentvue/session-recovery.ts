// Keep the portal client independent of browser account and gradebook modules.
// Their owners register these callbacks when the protected app initializes.
let currentAccount: (() => object | undefined) | undefined;
let refreshGrades: ((account: object) => Promise<boolean>) | undefined;

export function registerSessionRecoveryAccountProvider(provider: () => object | undefined) {
	currentAccount = provider;
}

export function isActiveSessionRecoveryAccount(account: object) {
	return currentAccount?.() === account;
}

export function registerSessionRecoveryGradeRefresh(
	refresh: (account: object) => Promise<boolean>
) {
	refreshGrades = refresh;
}

export function refreshGradesAfterSessionRestore(account: object) {
	if (!refreshGrades) throw new Error('The gradebook recovery loader is unavailable.');
	return refreshGrades(account);
}
