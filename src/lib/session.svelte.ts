export type PortalConnectionState = 'idle' | 'checking' | 'connected' | 'reconnect' | 'offline';

export const sessionRecovery = $state<{
	active: boolean;
	stage: 'saving' | 'refreshing';
}>({ active: false, stage: 'saving' });

let recoverySequence = 0;
let recoveryController: AbortController | undefined;

export function beginSessionRecovery() {
	recoveryController?.abort();
	recoveryController = new AbortController();
	const recovery = ++recoverySequence;
	sessionRecovery.active = true;
	sessionRecovery.stage = 'saving';
	return recovery;
}

export function isSessionRecoveryCurrent(recovery: number) {
	return recovery === recoverySequence && sessionRecovery.active;
}

export function getSessionRecoverySignal(recovery: number) {
	return isSessionRecoveryCurrent(recovery) ? recoveryController!.signal : AbortSignal.abort();
}

export function markSessionRecoveryRefreshing(recovery: number) {
	if (recovery !== recoverySequence) return;
	sessionRecovery.stage = 'refreshing';
}

export function finishSessionRecovery(recovery: number) {
	if (recovery !== recoverySequence) return;
	sessionRecovery.active = false;
}

export const portalConnection = $state<{
	state: PortalConnectionState;
	lastVerifiedAt?: number;
	message?: string;
	/** The next quiet background retry, never an identifier or StudentVUE record. */
	nextRetryAt?: number;
}>({ state: 'idle' });

export function markPortalChecking() {
	if (portalConnection.state !== 'reconnect') portalConnection.state = 'checking';
}

export function markPortalConnected(updatedAt = Date.now()) {
	portalConnection.state = 'connected';
	portalConnection.lastVerifiedAt = updatedAt;
	portalConnection.message = undefined;
	portalConnection.nextRetryAt = undefined;
}

export function markPortalReconnect(message?: string) {
	portalConnection.state = 'reconnect';
	portalConnection.message = message ?? 'Reconnect to StudentVUE to update your school data.';
}

export function markPortalOffline(
	message = 'StudentVUE is temporarily unavailable. Showing your last saved data.'
) {
	if (portalConnection.state !== 'reconnect') {
		portalConnection.state = 'offline';
		portalConnection.message = message;
	}
}

export function markPortalRetryScheduled(nextRetryAt: number) {
	if (portalConnection.state === 'offline') portalConnection.nextRetryAt = nextRetryAt;
}

export function resetPortalConnection() {
	recoveryController?.abort();
	recoveryController = undefined;
	recoverySequence += 1;
	sessionRecovery.active = false;
	sessionRecovery.stage = 'saving';
	portalConnection.state = 'idle';
	portalConnection.lastVerifiedAt = undefined;
	portalConnection.message = undefined;
	portalConnection.nextRetryAt = undefined;
}
