export type PortalConnectionState = 'idle' | 'checking' | 'connected' | 'reconnect' | 'offline';

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

export function markPortalOffline(message = 'StudentVUE is temporarily unavailable. Showing your last saved data.') {
	if (portalConnection.state !== 'reconnect') {
		portalConnection.state = 'offline';
		portalConnection.message = message;
	}
}

export function markPortalRetryScheduled(nextRetryAt: number) {
	if (portalConnection.state === 'offline') portalConnection.nextRetryAt = nextRetryAt;
}

export function resetPortalConnection() {
	portalConnection.state = 'idle';
	portalConnection.lastVerifiedAt = undefined;
	portalConnection.message = undefined;
	portalConnection.nextRetryAt = undefined;
}
